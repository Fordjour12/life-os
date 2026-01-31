import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ActionCtx } from "../_generated/server";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import { sanitizeSuggestionCopy } from "../identity/guardrails";
import {
  DAILY_SUGGESTION_CAP,
  getBoundaryFlagsFromBlocks,
  normalizeOffsetMinutes,
} from "./stabilization";

function getUserId(): string {
  return "user_me";
}

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const suggestionAgent = new Agent(components.agent, {
  name: "LifeOS Suggestion Agent",
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  instructions:
    "You are a gentle, recovery-first Life OS assistant. You propose supportive suggestions based on the user's current state, never to judge or shame. Always return a JSON array of suggestions with the required fields.",
  callSettings: {
    temperature: 0.7,
  },
  maxSteps: 1,
});

const weeklyReviewAgent = new Agent(components.agent, {
  name: "LifeOS Weekly Review",
  languageModel: openrouter.chat("openai/gpt-4o-mini"),
  instructions:
    "Analyze weekly data and generate insights. Output: { highlights: string[], frictionPoints: string[], reflectionQuestion: string }. Be supportive, never judgmental. Focus on patterns, not failures.",
  callSettings: {
    temperature: 0.6,
  },
  maxSteps: 1,
});

const journalAgent = new Agent(components.agent, {
  name: "LifeOS Journal Assistant",
  languageModel: openrouter.chat("anthropic/claude-3.5-sonnet"),
  instructions:
    "Generate gentle journal prompts based on user's state and recent activities. Keep prompts open-ended and non-judgmental.",
  callSettings: {
    temperature: 0.8,
  },
  maxSteps: 1,
});

type AiSuggestContext = {
  day: string;
  tzOffsetMinutes: number;
  state: LifeState;
  events: Array<{ type: string; ts: number; meta?: unknown }>;
  tasks: {
    active: Array<{ _id: string; title: string; estimateMin: number; priority?: number }>;
    paused: Array<{ _id: string; title: string; estimateMin: number; priority?: number }>;
  };
  calendarBlocks: Array<{ startMin: number; endMin: number; kind: string }>;
  plan: {
    day: string;
    version: number;
    focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
  } | null;
  existingSuggestions: Array<{
    type: string;
    priority: number;
    cooldownKey?: string;
    createdAt: number;
    status: string;
  }>;
  boundaries: {
    isLateNight: boolean;
    isRestWindow: boolean;
    isFocusProtection: boolean;
  };
};

type AiSuggestRawData = {
  stateDoc: { state: LifeState } | null;
  events: Array<{
    _id: Id<"events">;
    userId: string;
    ts: number;
    type: string;
    meta: unknown;
    idempotencyKey: string;
  }>;
  activeTasks: Array<{
    _id: Id<"tasks">;
    userId: string;
    title: string;
    estimateMin: number;
    priority?: number;
    status: string;
  }>;
  pausedTasks: Array<{
    _id: Id<"tasks">;
    userId: string;
    title: string;
    estimateMin: number;
    priority?: number;
    status: string;
  }>;
  calendarBlocks: Array<{
    _id: Id<"calendarBlocks">;
    userId: string;
    day: string;
    startMin: number;
    endMin: number;
    kind: string;
  }>;
  existingSuggestions: Array<{
    _id: Id<"suggestions">;
    userId: string;
    day: string;
    type: string;
    priority: number;
    reason: unknown;
    payload: unknown;
    status: string;
    cooldownKey?: string;
    createdAt: number;
    updatedAt: number;
  }>;
};

const DATA_LIMITS = {
  maxEvents: 200,
  maxActiveTasks: 50,
  maxPausedTasks: 50,
  maxCalendarBlocks: 50,
  maxExistingSuggestions: 20,
};

const AI_SUGGESTION_TYPES = [
  "PLAN_RESET",
  "TINY_WIN",
  "DAILY_REVIEW_QUESTION",
  "GENTLE_RETURN",
  "MICRO_RECOVERY_PROTOCOL",
  "NEXT_STEP",
] as const;

const MAX_REASON_DETAIL_LENGTH = 240;
const MAX_COOLDOWN_KEY_LENGTH = 64;

function truncate<T extends Record<string, unknown>>(obj: T, maxDepth = 3): T {
  if (maxDepth <= 0) return {} as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.slice(0, 500);
    } else if (typeof value === "number") {
      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .slice(0, 50)
        .map((item) =>
          typeof item === "object" && item !== null ? truncate(item, maxDepth - 1) : item,
        );
    } else if (typeof value === "object" && value !== null) {
      result[key] = truncate(value as Record<string, unknown>, maxDepth - 1);
    }
  }
  return result as T;
}

function isValidSuggestionType(type: string): type is KernelSuggestion["type"] {
  return AI_SUGGESTION_TYPES.includes(type as (typeof AI_SUGGESTION_TYPES)[number]);
}

function isValidPriority(priority: number): priority is KernelSuggestion["priority"] {
  return Number.isInteger(priority) && priority >= 1 && priority <= 5;
}

function validateAiSuggestion(suggestion: unknown): KernelSuggestion | null {
  if (!suggestion || typeof suggestion !== "object") return null;
  const s = suggestion as Record<string, unknown>;

  if (!s.day || typeof s.day !== "string") return null;
  if (!s.type || typeof s.type !== "string" || !isValidSuggestionType(s.type)) return null;
  if (typeof s.priority !== "number" || !isValidPriority(s.priority)) return null;

  const reason = s.reason as { code?: string; detail?: string } | undefined;
  if (!reason || typeof reason !== "object") return null;
  if (!reason.code || typeof reason.code !== "string") return null;
  if (!reason.detail || typeof reason.detail !== "string") return null;
  if (reason.detail.length > MAX_REASON_DETAIL_LENGTH) {
    reason.detail = reason.detail.slice(0, MAX_REASON_DETAIL_LENGTH);
  }

  const payload = s.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") return null;

  let cooldownKey = s.cooldownKey as string | undefined;
  if (
    cooldownKey &&
    typeof cooldownKey === "string" &&
    cooldownKey.length > MAX_COOLDOWN_KEY_LENGTH
  ) {
    cooldownKey = cooldownKey.slice(0, MAX_COOLDOWN_KEY_LENGTH);
  }

  return {
    day: s.day,
    type: s.type as KernelSuggestion["type"],
    priority: s.priority as KernelSuggestion["priority"],
    reason: {
      code: reason.code,
      detail: reason.detail,
    },
    payload: payload as Record<string, unknown>,
    status: "new" as const,
    cooldownKey,
  };
}

function buildAiContext(
  raw: AiSuggestRawData,
  day: string,
  tzOffsetMinutes: number,
): AiSuggestContext | null {
  const now = Date.now();
  const offset = normalizeOffsetMinutes(tzOffsetMinutes);

  if (!raw.stateDoc) {
    return null;
  }

  const state = raw.stateDoc.state as LifeState;

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const allEvents = raw.events;

  const recentEvents = allEvents
    .filter((e) => now - e.ts < SEVEN_DAYS)
    .slice(0, DATA_LIMITS.maxEvents)
    .map((e) => truncate({ type: e.type, ts: e.ts, meta: e.meta }));

  const activeTasksRaw = raw.activeTasks;

  const activeTasks = activeTasksRaw
    .slice(0, DATA_LIMITS.maxActiveTasks)
    .map((t) =>
      truncate({ _id: t._id, title: t.title, estimateMin: t.estimateMin, priority: t.priority }),
    );

  const pausedTasksRaw = raw.pausedTasks;

  const pausedTasks = pausedTasksRaw
    .slice(0, DATA_LIMITS.maxPausedTasks)
    .map((t) =>
      truncate({ _id: t._id, title: t.title, estimateMin: t.estimateMin, priority: t.priority }),
    );

  const blocks = raw.calendarBlocks;

  const calendarBlocks = blocks
    .slice(0, DATA_LIMITS.maxCalendarBlocks)
    .map((b) => truncate({ startMin: b.startMin, endMin: b.endMin, kind: b.kind }));

  const planEvents = allEvents.filter((e) => e.type === "PLAN_SET");
  let plan: AiSuggestContext["plan"] = null;
  let latestVersion = -1;
  for (const event of planEvents) {
    const meta = event.meta as {
      day?: string;
      version?: number;
      focusItems?: Array<{ id?: string; label?: string; estimatedMinutes?: number }>;
    };
    if (meta?.day !== day || !Array.isArray(meta.focusItems)) continue;
    const version = Number(meta.version ?? 0);
    if (version > latestVersion) {
      latestVersion = version;
      plan = {
        day,
        version,
        focusItems: meta.focusItems
          .map((item) => ({
            id: String(item?.id ?? "").trim(),
            label: String(item?.label ?? "").trim(),
            estimatedMinutes: Number(item?.estimatedMinutes ?? 0),
          }))
          .filter((item) => item.id && item.label && Number.isFinite(item.estimatedMinutes)),
      };
    }
  }

  const existingSugs = raw.existingSuggestions;

  const existingSuggestions = existingSugs.slice(0, DATA_LIMITS.maxExistingSuggestions).map((s) =>
    truncate({
      type: s.type,
      priority: s.priority,
      cooldownKey: s.cooldownKey,
      createdAt: s.createdAt,
      status: s.status,
    }),
  );

  const boundaries = getBoundaryFlagsFromBlocks(blocks, now, offset);

  return {
    day,
    tzOffsetMinutes: offset,
    state,
    events: recentEvents,
    tasks: { active: activeTasks, paused: pausedTasks },
    calendarBlocks,
    plan,
    existingSuggestions,
    boundaries,
  };
}

async function callAiModel(
  ctx: ActionCtx,
  userId: string,
  context: AiSuggestContext,
): Promise<KernelSuggestion[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("[vex-agents] No OPENROUTER_API_KEY configured, skipping AI call");
    return [];
  }

  try {
    const { threadId } = await suggestionAgent.createThread(ctx, {
      userId,
      title: `ai-suggest:${context.day}`,
    });

    const prompt = `CONTEXT:
- Day: ${context.day}
- Current State: ${JSON.stringify(context.state, null, 2)}
- Active Tasks: ${context.tasks.active.length}
- Paused Tasks: ${context.tasks.paused.length}
- Has Plan: ${context.plan ? "Yes" : "No"}
- Boundaries: ${JSON.stringify(context.boundaries)}

RULES:
1. Only suggest up to ${DAILY_SUGGESTION_CAP} items total
2. Priority range: 1-5 (5 = highest)
3. Each suggestion must have a clear, kind reason
4. Never suggest anything that would shame the user
5. If in recovery mode, prioritize MICRO_RECOVERY_PROTOCOL
6. Respect boundaries (no TINY_WIN in late night)
7. Use existing cooldown keys to avoid repetition

ALLOWED SUGGESTION TYPES:
- PLAN_RESET: When overloaded, suggest resetting plan (mode: "reset" or "rest")
- TINY_WIN: Small 10-min task to build momentum
- DAILY_REVIEW_QUESTION: Gentle reflection prompt
- GENTLE_RETURN: Bring back a paused task when there's room
- MICRO_RECOVERY_PROTOCOL: Full recovery mode suggestion
- NEXT_STEP: Suggest next logical action

OUTPUT FORMAT: JSON array of suggestions with fields: day, type, priority, reason {code, detail}, payload, cooldownKey. Return JSON only, no extra text.

Generate suggestions based on:
${JSON.stringify(context, null, 2)}`;

    const result = await suggestionAgent.generateText(ctx, { threadId, userId }, { prompt });

    if (!result.text) {
      console.log("[vex-agents] Empty response from AI");
      return [];
    }

    const suggestions = JSON.parse(result.text) as unknown[];
    if (!Array.isArray(suggestions)) {
      console.log("[vex-agents] AI response not an array");
      return [];
    }

    return suggestions.map(validateAiSuggestion).filter((s): s is KernelSuggestion => s !== null);
  } catch (error) {
    console.error("[vex-agents] Error calling AI:", error);
    return [];
  }
}

export const generateAiSuggestions = internalAction({
  args: {
    day: v.string(),
    tzOffsetMinutes: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { day, tzOffsetMinutes, source }) => {
    const userId = getUserId();
    const now = Date.now();

    const isEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!isEnabled) {
      console.log(
        `[vex-agents] AI_SUGGESTIONS_ENABLED=false, skipping for user=${userId}, day=${day}`,
      );
      return { status: "skipped", reason: "feature_disabled" };
    }

    console.log(
      `[vex-agents] Starting generation: user=${userId}, day=${day}, source=${source ?? "unknown"}`,
    );

    try {
      const raw = (await ctx.runQuery(internal.kernel.vexAgents.getAiSuggestRawData, {
        day,
      })) as AiSuggestRawData;
      const context = buildAiContext(raw, day, tzOffsetMinutes ?? 0);
      if (!context) {
        console.log(`[vex-agents] No state found for day=${day}, skipping`);
        return { status: "skipped", reason: "no_state" };
      }

      const inputSize = JSON.stringify(context).length;
      console.log(`[vex-agents] Context built: input_size=${inputSize} chars`);

      const aiSuggestions = await callAiModel(ctx, userId, context);
      console.log(`[vex-agents] AI returned ${aiSuggestions.length} suggestions`);

      if (aiSuggestions.length === 0) {
        return { status: "success", count: 0 };
      }

      const existingSugs = (await ctx.runQuery(internal.kernel.vexAgents.getSuggestionsForDay, {
        day,
      })) as AiSuggestRawData["existingSuggestions"];

      const existingNewCount = existingSugs.filter((s) => s.status === "new").length;
      if (existingNewCount > 0) {
        console.log(
          `[vex-agents] Existing new suggestions found (${existingNewCount}), skipping insertion`,
        );
        return { status: "skipped", reason: "existing_new_suggestions" };
      }

      const remainingSlots = Math.max(0, DAILY_SUGGESTION_CAP - existingSugs.length);
      if (remainingSlots === 0) {
        console.log(`[vex-agents] Daily cap reached (${DAILY_SUGGESTION_CAP}), skipping insertion`);
        return { status: "skipped", reason: "daily_cap_reached" };
      }

      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      const recentlySuggested = (cooldownKey?: string) => {
        if (!cooldownKey) return false;
        return existingSugs.some(
          (s) => s.cooldownKey === cooldownKey && now - s.createdAt < TWELVE_HOURS,
        );
      };

      const cappedSuggestions = aiSuggestions.slice(0, remainingSlots);
      let insertedCount = 0;

      for (const suggestion of cappedSuggestions) {
        if (recentlySuggested(suggestion.cooldownKey)) {
          console.log(
            `[vex-agents] Skipping suggestion with cooldownKey=${suggestion.cooldownKey}`,
          );
          continue;
        }

        const safeSuggestion = sanitizeSuggestionCopy(suggestion);

        await ctx.runMutation(internal.kernel.vexAgents.insertSuggestion, {
          suggestion: safeSuggestion,
          createdAt: now,
          updatedAt: now,
        });

        insertedCount++;
        console.log(
          `[vex-agents] Inserted suggestion: type=${safeSuggestion.type}, priority=${safeSuggestion.priority}`,
        );
      }

      console.log(
        `[vex-agents] Completed: inserted=${insertedCount}, total_new=${existingSugs.length + insertedCount}`,
      );
      return { status: "success", count: insertedCount };
    } catch (error) {
      console.error(`[vex-agents] Error in generateAiSuggestions:`, error);
      return { status: "error", error: String(error) };
    }
  },
});

const suggestionValidator = v.object({
  day: v.string(),
  type: v.string(),
  priority: v.number(),
  reason: v.object({
    code: v.string(),
    detail: v.string(),
  }),
  payload: v.any(),
  status: v.string(),
  cooldownKey: v.optional(v.string()),
});

export const getAiSuggestRawData = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const pausedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();

    const calendarBlocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const existingSuggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    return {
      stateDoc,
      events,
      activeTasks,
      pausedTasks,
      calendarBlocks,
      existingSuggestions,
    };
  },
});

export const getSuggestionsForDay = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();

    return ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();
  },
});

export const insertSuggestion = internalMutation({
  args: {
    suggestion: suggestionValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, { suggestion, createdAt, updatedAt }) => {
    const userId = getUserId();
    await ctx.db.insert("suggestions", {
      userId,
      day: suggestion.day,
      type: suggestion.type,
      priority: suggestion.priority,
      reason: suggestion.reason,
      payload: suggestion.payload,
      status: suggestion.status,
      cooldownKey: suggestion.cooldownKey,
      createdAt,
      updatedAt,
    });
  },
});

import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { v } from "convex/values";

import { sanitizeSuggestionCopy } from "../identity/guardrails";
import {
  DAILY_SUGGESTION_CAP,
  getBoundaryFlagsFromBlocks,
  normalizeOffsetMinutes,
} from "./stabilization";

function getUserId(): string {
  return "user_me";
}

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

async function buildAiContext(
  ctx: {
    db: {
      query: typeof import("../_generated/server").query;
      run: (query: unknown) => Promise<unknown>;
    };
  },
  day: string,
  tzOffsetMinutes: number,
): Promise<AiSuggestContext | null> {
  const userId = getUserId();
  const now = Date.now();
  const offset = normalizeOffsetMinutes(tzOffsetMinutes);

  const stateDoc = await ctx.db
    .query("stateDaily")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .first();

  if (!stateDoc) {
    return null;
  }

  const state = stateDoc.state as LifeState;

  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const allEvents = (await ctx.db
    .query("events")
    .withIndex("by_user_ts", (q) => q.eq("userId", userId))
    .collect()) as Array<{
    _id: Id<"events">;
    userId: string;
    ts: number;
    type: string;
    meta: unknown;
    idempotencyKey: string;
  }>;

  const recentEvents = allEvents
    .filter((e) => now - e.ts < SEVEN_DAYS)
    .slice(0, DATA_LIMITS.maxEvents)
    .map((e) => truncate({ type: e.type, ts: e.ts, meta: e.meta }));

  const activeTasksRaw = (await ctx.db
    .query("tasks")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .collect()) as Array<{
    _id: Id<"tasks">;
    userId: string;
    title: string;
    estimateMin: number;
    priority?: number;
    status: string;
  }>;

  const activeTasks = activeTasksRaw
    .slice(0, DATA_LIMITS.maxActiveTasks)
    .map((t) =>
      truncate({ _id: t._id, title: t.title, estimateMin: t.estimateMin, priority: t.priority }),
    );

  const pausedTasksRaw = (await ctx.db
    .query("tasks")
    .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
    .collect()) as Array<{
    _id: Id<"tasks">;
    userId: string;
    title: string;
    estimateMin: number;
    priority?: number;
    status: string;
  }>;

  const pausedTasks = pausedTasksRaw
    .slice(0, DATA_LIMITS.maxPausedTasks)
    .map((t) =>
      truncate({ _id: t._id, title: t.title, estimateMin: t.estimateMin, priority: t.priority }),
    );

  const blocks = (await ctx.db
    .query("calendarBlocks")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .collect()) as Array<{
    _id: Id<"calendarBlocks">;
    userId: string;
    day: string;
    startMin: number;
    endMin: number;
    kind: string;
  }>;

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

  const existingSugs = (await ctx.db
    .query("suggestions")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .collect()) as Array<{
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

async function callAiModel(context: AiSuggestContext): Promise<KernelSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("[aiSuggest] No OPENAI_API_KEY configured, skipping AI call");
    return [];
  }

  const systemPrompt = `You are a gentle, recovery-first Life OS assistant. Your role is to propose supportive suggestions based on the user's current state, never to judge or shame.

CONTEXT:
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

OUTPUT FORMAT: JSON array of suggestions with fields: day, type, priority, reason {code, detail}, payload, cooldownKey`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate suggestions based on: ${JSON.stringify(context, null, 2)}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[aiSuggest] OpenAI API error:", error);
      return [];
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log("[aiSuggest] Empty response from AI");
      return [];
    }

    const suggestions = JSON.parse(content) as unknown[];
    if (!Array.isArray(suggestions)) {
      console.log("[aiSuggest] AI response not an array");
      return [];
    }

    return suggestions.map(validateAiSuggestion).filter((s): s is KernelSuggestion => s !== null);
  } catch (error) {
    console.error("[aiSuggest] Error calling AI:", error);
    return [];
  }
}

export const generateAiSuggestions = action({
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
        `[aiSuggest] AI_SUGGESTIONS_ENABLED=false, skipping for user=${userId}, day=${day}`,
      );
      return { status: "skipped", reason: "feature_disabled" };
    }

    console.log(
      `[aiSuggest] Starting generation: user=${userId}, day=${day}, source=${source ?? "unknown"}`,
    );

    try {
      const context = await buildAiContext(ctx, day, tzOffsetMinutes ?? 0);
      if (!context) {
        console.log(`[aiSuggest] No state found for day=${day}, skipping`);
        return { status: "skipped", reason: "no_state" };
      }

      const inputSize = JSON.stringify(context).length;
      console.log(`[aiSuggest] Context built: input_size=${inputSize} chars`);

      const aiSuggestions = await callAiModel(context);
      console.log(`[aiSuggest] AI returned ${aiSuggestions.length} suggestions`);

      if (aiSuggestions.length === 0) {
        return { status: "success", count: 0 };
      }

      const existingSugs = (await ctx.db
        .query("suggestions")
        .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
        .collect()) as Array<{
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

      const existingNewCount = existingSugs.filter((s) => s.status === "new").length;
      if (existingNewCount > 0) {
        console.log(
          `[aiSuggest] Existing new suggestions found (${existingNewCount}), skipping insertion`,
        );
        return { status: "skipped", reason: "existing_new_suggestions" };
      }

      const remainingSlots = Math.max(0, DAILY_SUGGESTION_CAP - existingSugs.length);
      if (remainingSlots === 0) {
        console.log(`[aiSuggest] Daily cap reached (${DAILY_SUGGESTION_CAP}), skipping insertion`);
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
          console.log(`[aiSuggest] Skipping suggestion with cooldownKey=${suggestion.cooldownKey}`);
          continue;
        }

        const safeSuggestion = sanitizeSuggestionCopy(suggestion);

        await ctx.db.insert("suggestions", {
          userId,
          day: safeSuggestion.day,
          type: safeSuggestion.type,
          priority: safeSuggestion.priority,
          reason: safeSuggestion.reason,
          payload: safeSuggestion.payload,
          status: safeSuggestion.status,
          cooldownKey: safeSuggestion.cooldownKey,
          createdAt: now,
          updatedAt: now,
        });

        insertedCount++;
        console.log(
          `[aiSuggest] Inserted suggestion: type=${safeSuggestion.type}, priority=${safeSuggestion.priority}`,
        );
      }

      console.log(
        `[aiSuggest] Completed: inserted=${insertedCount}, total_new=${existingSugs.length + insertedCount}`,
      );
      return { status: "success", count: insertedCount };
    } catch (error) {
      console.error(`[aiSuggest] Error in generateAiSuggestions:`, error);
      return { status: "error", error: String(error) };
    }
  },
});

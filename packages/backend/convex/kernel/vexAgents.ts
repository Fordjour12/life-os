import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ActionCtx } from "../_generated/server";
import { action, internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

import { components, internal } from "../_generated/api";
import {
  filterSafeStrings,
  isSafeCopy,
  safeCopy,
  sanitizeSuggestionCopy,
} from "../identity/guardrails";
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

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

function formatYYYYMMDD(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getISOWeekIdFromDate(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const year = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / MILLISECONDS_IN_DAY + 1) / 7);
  return `${year}-${String(week).padStart(2, "0")}`;
}

function getISOWeekStartDate(weekId: string): Date {
  const [yearPart, weekPart] = weekId.split("-");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    throw new Error("Week must be YYYY-WW");
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const weekStart = new Date(week1Monday);
  weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

function getDefaultWeekId(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return getISOWeekIdFromDate(date);
}

function getTodayYYYYMMDD() {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pickPrompt(day: string) {
  const safePrompts = journalFallbackPrompts.filter(isSafeCopy);
  const source = safePrompts.length > 0 ? safePrompts : journalFallbackPrompts;
  const seed = day.split("-").reduce((sum, part) => sum + Number(part || 0), 0);
  return source[seed % source.length] ?? source[0];
}

const allowedMomenta = new Set(["stalled", "steady", "strong"]);

const journalFallbackPrompts = [
  "What felt heavy today?",
  "What helped, even a little?",
  "Anything you want to unload here?",
];

const journalReasonDetails: Record<string, string> = {
  quiet: "You marked today as quiet, so the prompt stays optional.",
  reflection: "A reflection prompt was suggested today.",
  recovery: "Recovery mode shows up today, so the prompt is gentle.",
  plan_reset: "You used a plan reset this week, so a light check-in helps.",
  micro_recovery: "You used a recovery protocol, so a soft prompt can help.",
};

function getMomentum(state: LifeState | null | undefined): LifeState["momentum"] | null {
  if (!state || typeof state !== "object") return null;
  const momentum = (state as LifeState).momentum;
  return allowedMomenta.has(momentum) ? momentum : null;
}

function getLoad(state: LifeState | null | undefined): LifeState["load"] | null {
  if (!state || typeof state !== "object") return null;
  const load = (state as LifeState).load;
  return load === "balanced" || load === "overloaded" || load === "underloaded" ? load : null;
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

type WeeklyReviewRawData = {
  stateDocs: Array<{ day: string; state: LifeState }>;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

type JournalPromptRawData = {
  skip: boolean;
  stateDoc: { state: LifeState } | null;
  suggestions: Array<{ type: string; status: string }>;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

type NextStepRawData = {
  task: {
    _id: Id<"tasks">;
    title: string;
    estimateMin: number;
    priority?: number;
    status: string;
  } | null;
  stateDoc: { state: LifeState } | null;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

type RecoveryProtocolRawData = {
  stateDoc: { state: LifeState } | null;
  calendarBlocks: Array<{ startMin: number; endMin: number; kind: string }>;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

type WeeklyPlanRawData = {
  activeTasks: Array<{ title: string; estimateMin: number; priority?: number }>;
  pausedTasks: Array<{ title: string; estimateMin: number; priority?: number }>;
  stateDocs: Array<{ day: string; state: LifeState }>;
  calendarBlocks: Array<{ day: string; startMin: number; endMin: number; kind: string }>;
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

    const result = await suggestionAgent.generateText(ctx, { threadId, userId }, {
      prompt,
    } as Parameters<typeof suggestionAgent.generateText>[2]);

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

type WeeklyReviewDraft = {
  highlights: string[];
  frictionPoints: string[];
  reflectionQuestion: string;
  narrative: string;
  reason: { code: string; detail: string };
};

function normalizeWeeklyReviewDraft(raw: unknown, fallback: WeeklyReviewDraft): WeeklyReviewDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const highlightsRaw = Array.isArray(candidate.highlights)
    ? candidate.highlights.map((item) => String(item))
    : fallback.highlights;
  const frictionRaw = Array.isArray(candidate.frictionPoints)
    ? candidate.frictionPoints.map((item) => String(item))
    : fallback.frictionPoints;
  const reflectionQuestion =
    typeof candidate.reflectionQuestion === "string"
      ? safeCopy(candidate.reflectionQuestion, fallback.reflectionQuestion)
      : fallback.reflectionQuestion;
  const narrative =
    typeof candidate.narrative === "string"
      ? safeCopy(candidate.narrative, fallback.narrative)
      : fallback.narrative;
  const reasonRaw = candidate.reason as { code?: string; detail?: string } | undefined;
  const reason =
    reasonRaw?.code && typeof reasonRaw.code === "string"
      ? {
          code: reasonRaw.code,
          detail: safeCopy(
            typeof reasonRaw.detail === "string" ? reasonRaw.detail : fallback.reason.detail,
            fallback.reason.detail,
          ),
        }
      : fallback.reason;

  return {
    highlights: filterSafeStrings(highlightsRaw).slice(0, 2),
    frictionPoints: filterSafeStrings(frictionRaw).slice(0, 3),
    reflectionQuestion,
    narrative: isSafeCopy(narrative) ? narrative : fallback.narrative,
    reason,
  };
}

export const generateWeeklyReviewDraft = action({
  args: {
    week: v.optional(v.string()),
  },
  handler: async (ctx, { week }) => {
    const userId = getUserId();
    const weekId = week ?? getDefaultWeekId();
    if (!/^\d{4}-\d{2}$/.test(weekId)) {
      throw new Error("Week must be YYYY-WW");
    }

    const weekStart = getISOWeekStartDate(weekId);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setUTCDate(weekStart.getUTCDate() + 7);

    const startDay = formatYYYYMMDD(weekStart);
    const endDay = formatYYYYMMDD(new Date(weekEndExclusive.getTime() - MILLISECONDS_IN_DAY));

    const raw = (await ctx.runQuery(internal.kernel.vexAgents.getWeeklyReviewRawData, {
      startDay,
      endDay,
      weekStartMs: weekStart.getTime(),
      weekEndMs: weekEndExclusive.getTime(),
    })) as WeeklyReviewRawData;

    const weekStates = raw.stateDocs.map((entry) => ({
      day: entry.day,
      state: entry.state as LifeState,
    }));

    const recoveryDays = weekStates.filter((entry) => entry.state?.mode === "recovery").length;
    const balancedDays = weekStates.filter((entry) => getLoad(entry.state) === "balanced").length;

    const weekEvents = raw.events;

    const tinyWins = weekEvents.filter((event) => {
      if (event.type !== "TASK_COMPLETED") return false;
      const estimateMin = Number((event.meta as { estimateMin?: number })?.estimateMin ?? 0);
      return Number.isFinite(estimateMin) && estimateMin <= 10;
    }).length;

    const planResets = weekEvents.filter((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    }).length;

    const plannedDays = weekStates.filter((entry) => (entry.state?.plannedMinutes ?? 0) > 0);
    const onTrackDays = plannedDays.filter((entry) => {
      const planned = entry.state?.plannedMinutes ?? 0;
      const completed = entry.state?.completedMinutes ?? 0;
      if (planned <= 0) return false;
      return completed >= planned * 0.8;
    }).length;
    const plannedDaysCount = plannedDays.length;
    const onTrackRatio = plannedDaysCount > 0 ? onTrackDays / plannedDaysCount : 0;

    const highlights: string[] = [];
    const sortedStates = [...weekStates].sort((a, b) => a.day.localeCompare(b.day));
    let momentumLift = 0;
    for (let index = 1; index < sortedStates.length; index += 1) {
      const prev = sortedStates[index - 1]?.state;
      const next = sortedStates[index]?.state;
      if (getMomentum(prev) === "stalled" && getMomentum(next) && getMomentum(next) !== "stalled") {
        momentumLift += 1;
      }
    }
    if (momentumLift > 0) {
      highlights.push("Momentum tended to return after small wins.");
    }

    const restCount = weekEvents.filter((event) => {
      if (event.type === "REST_ACCEPTED") return true;
      if (event.type !== "RECOVERY_PROTOCOL_USED") return false;
      return Boolean((event.meta as { didRest?: boolean })?.didRest);
    }).length;
    if (restCount > 0) {
      highlights.push("Rest days were followed by steadier momentum.");
    }

    const gentleReturns = weekEvents.filter((event) => {
      if (event.type !== "TASK_RESUMED") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "gentle_return";
    }).length;
    if (gentleReturns > 0) {
      highlights.push("Gentle returns helped re-enter paused tasks.");
    }
    if (plannedDaysCount >= 2 && onTrackRatio >= 0.7) {
      highlights.push("Planned focus mostly matched completed effort.");
    }

    const frictionPoints: string[] = [];
    const overloadedDays = weekStates.filter(
      (entry) => getLoad(entry.state) === "overloaded",
    ).length;
    if (overloadedDays > 0) {
      frictionPoints.push(
        `Overload showed up on ${overloadedDays} day${overloadedDays === 1 ? "" : "s"}.`,
      );
    }
    if (planResets > 0) {
      frictionPoints.push("Plan resets were used to protect capacity.");
    }
    if (plannedDaysCount >= 2 && onTrackRatio <= 0.3) {
      frictionPoints.push("Planned focus often exceeded what was completed.");
    }

    const reflectionQuestion = "What would you like to protect next week?";
    const safeHighlights = filterSafeStrings(highlights).slice(0, 2);
    const safeFriction = filterSafeStrings(frictionPoints).slice(0, 3);
    const safeQuestion = isSafeCopy(reflectionQuestion)
      ? reflectionQuestion
      : "What would you like to protect next week?";

    const fallbackNarrative = safeCopy(
      "This week shows how small wins and rest help stabilize momentum.",
      "This week shows how small wins and rest help stabilize momentum.",
    );
    const fallback: WeeklyReviewDraft = {
      highlights: safeHighlights,
      frictionPoints: safeFriction,
      reflectionQuestion: safeQuestion,
      narrative: fallbackNarrative,
      reason: {
        code: "derived",
        detail: "Derived from your last week of patterns and events.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return { status: "success", source: "fallback", draft: fallback, week: weekId } as const;
    }

    try {
      const { threadId } = await weeklyReviewAgent.createThread(ctx, {
        userId,
        title: `weekly-review:${weekId}`,
      });

      const prompt = `You are generating a weekly review draft.
CONTEXT:
- Week: ${weekId}
- Recovery days: ${recoveryDays}
- Balanced days: ${balancedDays}
- Tiny wins: ${tinyWins}
- Plan resets: ${planResets}
- Planned days: ${plannedDaysCount}
- On-track ratio: ${onTrackRatio.toFixed(2)}
- Highlights: ${JSON.stringify(safeHighlights)}
- Friction points: ${JSON.stringify(safeFriction)}

RULES:
1. Return JSON only.
2. Include at most 2 highlights and at most 3 friction points.
3. Keep tone supportive, no shame.
4. Provide a reflectionQuestion that is short and gentle.
5. Include a narrative summary in 1-2 sentences.
6. Include a reason with { code, detail } explaining why these insights fit.

OUTPUT FORMAT:
{ "highlights": string[], "frictionPoints": string[], "reflectionQuestion": string, "narrative": string, "reason": { "code": string, "detail": string } }`;

      const result = await weeklyReviewAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof weeklyReviewAgent.generateText>[2]);

      if (!result.text) {
        return { status: "success", source: "fallback", draft: fallback, week: weekId } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeWeeklyReviewDraft(parsed, fallback);
      return { status: "success", source: "ai", draft, week: weekId } as const;
    } catch (error) {
      console.error("[vex-agents] Weekly review AI error:", error);
      return { status: "success", source: "fallback", draft: fallback, week: weekId } as const;
    }
  },
});

export const generateWeeklyPlanDraft = action({
  args: {
    week: v.optional(v.string()),
  },
  handler: async (ctx, { week }) => {
    const userId = getUserId();
    const weekId = week ?? getDefaultWeekId();
    if (!/^\d{4}-\d{2}$/.test(weekId)) {
      throw new Error("Week must be YYYY-WW");
    }

    const weekStart = getISOWeekStartDate(weekId);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setUTCDate(weekStart.getUTCDate() + 7);

    const startDay = formatYYYYMMDD(weekStart);
    const endDay = formatYYYYMMDD(new Date(weekEndExclusive.getTime() - MILLISECONDS_IN_DAY));

    const raw = (await ctx.runQuery(internal.kernel.vexAgents.getWeeklyPlanRawData, {
      startDay,
      endDay,
    })) as WeeklyPlanRawData;

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate() + index);
      return formatYYYYMMDD(date);
    });

    const activeTasks = raw.activeTasks
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2))
      .slice(0, 7);

    const fallbackDays = days.map((day, index) => {
      const task = activeTasks[index % Math.max(activeTasks.length, 1)];
      const label = task?.title ?? "Recovery & reset";
      return {
        day,
        focusItems: [
          {
            id: `focus-${day}-0`,
            label: safeCopy(label, "Recovery & reset"),
            estimatedMinutes: normalizePlanEstimate(task?.estimateMin ?? 25),
          },
        ],
        reason: {
          code: "draft",
          detail: "Drafted to keep the week light and consistent.",
        },
      };
    });

    const fallback: WeeklyPlanDraft = {
      week: weekId,
      days: fallbackDays,
      reason: {
        code: "draft",
        detail: "Drafted to balance load across the week.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return { status: "success", source: "fallback", draft: fallback } as const;
    }

    try {
      const { threadId } = await suggestionAgent.createThread(ctx, {
        userId,
        title: `weekly-plan:${weekId}`,
      });

      const prompt = `You are generating a weekly plan draft.

WEEK:
- Week ID: ${weekId}
- Days: ${JSON.stringify(days)}

TASKS:
- Active: ${JSON.stringify(raw.activeTasks)}
- Paused: ${JSON.stringify(raw.pausedTasks)}

STATE SNAPSHOTS:
${JSON.stringify(raw.stateDocs)}

CALENDAR BLOCKS:
${JSON.stringify(raw.calendarBlocks)}

RULES:
1. Return JSON only.
2. Provide 1-3 focus items per day.
3. Keep total planned minutes gentle; avoid overload.
4. If rest is needed, use a single focus item labeled "Rest & recovery".
5. Each day must include a reason { code, detail }.
6. Include a top-level reason for the week.

OUTPUT FORMAT:
{ "week": "${weekId}", "days": [{ "day": "YYYY-MM-DD", "focusItems": [{ "id": string, "label": string, "estimatedMinutes": number }], "reason": { "code": string, "detail": string } }], "reason": { "code": string, "detail": string } }`;

      const result = await suggestionAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof suggestionAgent.generateText>[2]);

      if (!result.text) {
        return { status: "success", source: "fallback", draft: fallback } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeWeeklyPlanDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Weekly plan AI error:", error);
      return { status: "success", source: "fallback", draft: fallback } as const;
    }
  },
});

type JournalPromptDraft = {
  day: string;
  prompt: string | null;
  reason: { code: string; detail: string } | null;
  quiet: boolean;
};

function normalizeJournalPromptDraft(
  raw: unknown,
  fallback: JournalPromptDraft,
): JournalPromptDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const promptValue =
    candidate.prompt === null
      ? null
      : typeof candidate.prompt === "string"
        ? safeCopy(candidate.prompt, fallback.prompt ?? "")
        : fallback.prompt;
  const reasonRaw = candidate.reason as { code?: string; detail?: string } | undefined;
  const reason =
    reasonRaw?.code && typeof reasonRaw.code === "string"
      ? {
          code: reasonRaw.code,
          detail: safeCopy(
            typeof reasonRaw.detail === "string"
              ? reasonRaw.detail
              : (fallback.reason?.detail ?? ""),
            fallback.reason?.detail ?? "",
          ),
        }
      : fallback.reason;
  const quiet = typeof candidate.quiet === "boolean" ? candidate.quiet : fallback.quiet;

  return {
    day: fallback.day,
    prompt: promptValue && isSafeCopy(promptValue) ? promptValue : fallback.prompt,
    reason,
    quiet,
  };
}

type NextStepDraft = {
  taskId: string;
  step: string;
  estimateMin: number;
  reason: { code: string; detail: string };
};

function normalizeNextStepDraft(raw: unknown, fallback: NextStepDraft): NextStepDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const step =
    typeof candidate.step === "string" ? safeCopy(candidate.step, fallback.step) : fallback.step;
  const estimateMin = Number.isFinite(Number(candidate.estimateMin))
    ? Math.max(1, Math.round(Number(candidate.estimateMin)))
    : fallback.estimateMin;
  const reasonRaw = candidate.reason as { code?: string; detail?: string } | undefined;
  const reason =
    reasonRaw?.code && typeof reasonRaw.code === "string"
      ? {
          code: reasonRaw.code,
          detail: safeCopy(
            typeof reasonRaw.detail === "string" ? reasonRaw.detail : fallback.reason.detail,
            fallback.reason.detail,
          ),
        }
      : fallback.reason;

  return {
    taskId: fallback.taskId,
    step: isSafeCopy(step) ? step : fallback.step,
    estimateMin,
    reason,
  };
}

type RecoveryProtocolDraft = {
  day: string;
  title: string;
  steps: string[];
  minutes: number;
  reason: { code: string; detail: string };
};

function normalizeRecoveryProtocolDraft(
  raw: unknown,
  fallback: RecoveryProtocolDraft,
): RecoveryProtocolDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const title =
    typeof candidate.title === "string"
      ? safeCopy(candidate.title, fallback.title)
      : fallback.title;
  const stepsRaw = Array.isArray(candidate.steps)
    ? candidate.steps.map((item) => safeCopy(String(item), ""))
    : fallback.steps;
  const steps = filterSafeStrings(stepsRaw)
    .filter((step) => step.trim())
    .slice(0, 3);
  const minutes = Number.isFinite(Number(candidate.minutes))
    ? Math.max(5, Math.round(Number(candidate.minutes)))
    : fallback.minutes;
  const reasonRaw = candidate.reason as { code?: string; detail?: string } | undefined;
  const reason =
    reasonRaw?.code && typeof reasonRaw.code === "string"
      ? {
          code: reasonRaw.code,
          detail: safeCopy(
            typeof reasonRaw.detail === "string" ? reasonRaw.detail : fallback.reason.detail,
            fallback.reason.detail,
          ),
        }
      : fallback.reason;

  return {
    day: fallback.day,
    title: isSafeCopy(title) ? title : fallback.title,
    steps: steps.length ? steps : fallback.steps,
    minutes,
    reason,
  };
}

type WeeklyPlanDraft = {
  week: string;
  days: Array<{
    day: string;
    focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
    reason: { code: string; detail: string };
  }>;
  reason: { code: string; detail: string };
};

const allowedPlanEstimates = [10, 25, 45, 60];

function normalizePlanEstimate(value: number) {
  if (!Number.isFinite(value)) return 25;
  return allowedPlanEstimates.reduce((closest, estimate) =>
    Math.abs(estimate - value) < Math.abs(closest - value) ? estimate : closest,
  );
}

function normalizeWeeklyPlanDraft(raw: unknown, fallback: WeeklyPlanDraft): WeeklyPlanDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const daysRaw = Array.isArray(candidate.days) ? candidate.days : fallback.days;
  const reasonRaw = candidate.reason as { code?: string; detail?: string } | undefined;
  const reason =
    reasonRaw?.code && typeof reasonRaw.code === "string"
      ? {
          code: reasonRaw.code,
          detail: safeCopy(
            typeof reasonRaw.detail === "string" ? reasonRaw.detail : fallback.reason.detail,
            fallback.reason.detail,
          ),
        }
      : fallback.reason;

  const days = daysRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const day = typeof item.day === "string" ? item.day : "";
      const focusItemsRaw = Array.isArray(item.focusItems) ? item.focusItems : [];
      const focusItems = focusItemsRaw
        .slice(0, 3)
        .map((focus, index) => {
          if (!focus || typeof focus !== "object") return null;
          const data = focus as Record<string, unknown>;
          const label = safeCopy(String(data.label ?? "").trim(), "Focus block");
          if (!label) return null;
          return {
            id: String(data.id ?? `focus-${day}-${index}`).trim() || `focus-${day}-${index}`,
            label,
            estimatedMinutes: normalizePlanEstimate(Number(data.estimatedMinutes ?? 25)),
          };
        })
        .filter((focus): focus is { id: string; label: string; estimatedMinutes: number } =>
          Boolean(focus),
        );
      const reasonValue = item.reason as { code?: string; detail?: string } | undefined;
      const reason =
        reasonValue?.code && typeof reasonValue.code === "string"
          ? {
              code: reasonValue.code,
              detail: safeCopy(
                typeof reasonValue.detail === "string"
                  ? reasonValue.detail
                  : "Reason provided for this plan day.",
                "Reason provided for this plan day.",
              ),
            }
          : { code: "draft", detail: "Drafted to fit your capacity for the day." };

      if (!/\d{4}-\d{2}-\d{2}/.test(day) || focusItems.length === 0) return null;

      return {
        day,
        focusItems,
        reason,
      };
    })
    .filter((entry): entry is WeeklyPlanDraft["days"][number] => Boolean(entry));

  return {
    week: fallback.week,
    days: days.length ? days : fallback.days,
    reason,
  };
}

export const generateJournalPromptDraft = action({
  args: {
    day: v.optional(v.string()),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();
    const targetDay = day ?? getTodayYYYYMMDD();

    const raw = (await ctx.runQuery(internal.kernel.vexAgents.getJournalPromptRawData, {
      day: targetDay,
    })) as JournalPromptRawData;

    if (raw.skip) {
      return {
        status: "success",
        source: "quiet",
        draft: {
          day: targetDay,
          prompt: pickPrompt(targetDay),
          reason: {
            code: "quiet",
            detail: journalReasonDetails.quiet,
          },
          quiet: true,
        },
      } as const;
    }

    const stateDoc = raw.stateDoc;
    const suggestions = raw.suggestions;
    const events = raw.events;

    const hasReflectionSuggestion = suggestions.some(
      (suggestion) => suggestion.type === "DAILY_REVIEW_QUESTION" && suggestion.status === "new",
    );
    const recoveryMode =
      stateDoc?.state && (stateDoc.state as { mode?: string }).mode === "recovery";
    const hadPlanReset = events.some((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    });
    const usedMicroRecovery = events.some((event) => event.type === "RECOVERY_PROTOCOL_USED");

    const shouldPrompt = Boolean(
      hasReflectionSuggestion || recoveryMode || hadPlanReset || usedMicroRecovery,
    );

    if (!shouldPrompt) {
      return {
        status: "success",
        source: "quiet",
        draft: {
          day: targetDay,
          prompt: null,
          reason: null,
          quiet: false,
        },
      } as const;
    }

    const reasonCode = hasReflectionSuggestion
      ? "reflection"
      : recoveryMode
        ? "recovery"
        : hadPlanReset
          ? "plan_reset"
          : "micro_recovery";
    const fallback: JournalPromptDraft = {
      day: targetDay,
      prompt: pickPrompt(targetDay),
      reason: {
        code: reasonCode,
        detail: journalReasonDetails[reasonCode] ?? "A gentle check-in can help today.",
      },
      quiet: false,
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return { status: "success", source: "fallback", draft: fallback } as const;
    }

    try {
      const { threadId } = await journalAgent.createThread(ctx, {
        userId,
        title: `journal:${targetDay}`,
      });

      const recentEvents = events
        .slice(-25)
        .map((event) => truncate({ type: event.type, ts: event.ts, meta: event.meta }));
      const prompt = `You are generating a single gentle journal prompt.

CONTEXT:
- Day: ${targetDay}
- Reason: ${reasonCode}
- Recovery mode: ${recoveryMode ? "yes" : "no"}
- Reflection suggested: ${hasReflectionSuggestion ? "yes" : "no"}
- Recent events: ${JSON.stringify(recentEvents)}

RULES:
1. Return JSON only.
2. Prompt must be a single short sentence.
3. Tone is gentle, recovery-first, no shame.
4. Include a reason object with { code, detail } using the provided reason code.

OUTPUT FORMAT:
{ "prompt": string, "reason": { "code": string, "detail": string }, "quiet": false }`;

      const result = await journalAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof journalAgent.generateText>[2]);
      if (!result.text) {
        return { status: "success", source: "fallback", draft: fallback } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeJournalPromptDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Journal AI error:", error);
      return { status: "success", source: "fallback", draft: fallback } as const;
    }
  },
});

export const generateNextStepDraft = action({
  args: {
    taskId: v.id("tasks"),
    day: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, day }) => {
    const userId = getUserId();
    const targetDay = day ?? getTodayYYYYMMDD();

    const raw = (await ctx.runQuery(internal.kernel.vexAgents.getNextStepRawData, {
      taskId,
      day: targetDay,
    })) as NextStepRawData;

    if (!raw.task) {
      return { status: "error", reason: "task_not_found" } as const;
    }

    const fallback: NextStepDraft = {
      taskId: raw.task._id,
      step: "Open the task and write the very next physical action.",
      estimateMin: Math.max(5, Math.min(10, Math.round(raw.task.estimateMin / 2 || 10))),
      reason: {
        code: "micro_step",
        detail: "Small steps reduce decision load and build momentum.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return { status: "success", source: "fallback", draft: fallback } as const;
    }

    try {
      const { threadId } = await suggestionAgent.createThread(ctx, {
        userId,
        title: `next-step:${taskId}`,
      });

      const prompt = `You are generating a next-step micro plan for a single task.

TASK:
- Title: ${raw.task.title}
- Estimate (min): ${raw.task.estimateMin}
- Status: ${raw.task.status}

STATE:
- Day: ${targetDay}
- Mode: ${(raw.stateDoc?.state as { mode?: string })?.mode ?? "unknown"}
- Load: ${(raw.stateDoc?.state as { load?: string })?.load ?? "unknown"}

RECENT EVENTS:
${JSON.stringify(raw.events)}

RULES:
1. Return JSON only.
2. Provide a single concrete step.
3. Keep it small (<= 10 minutes).
4. Tone is gentle, recovery-first.
5. Include a reason with { code, detail }.

OUTPUT FORMAT:
{ "step": string, "estimateMin": number, "reason": { "code": string, "detail": string } }`;

      const result = await suggestionAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof suggestionAgent.generateText>[2]);

      if (!result.text) {
        return { status: "success", source: "fallback", draft: fallback } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeNextStepDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Next step AI error:", error);
      return { status: "success", source: "fallback", draft: fallback } as const;
    }
  },
});

export const generateRecoveryProtocolDraft = action({
  args: {
    day: v.optional(v.string()),
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { day, tzOffsetMinutes }) => {
    const userId = getUserId();
    const targetDay = day ?? getTodayYYYYMMDD();
    const offset = normalizeOffsetMinutes(tzOffsetMinutes ?? 0);

    const raw = (await ctx.runQuery(internal.kernel.vexAgents.getRecoveryProtocolRawData, {
      day: targetDay,
    })) as RecoveryProtocolRawData;

    const boundaries = getBoundaryFlagsFromBlocks(raw.calendarBlocks, Date.now(), offset);

    const fallback: RecoveryProtocolDraft = {
      day: targetDay,
      title: "Recovery protocol",
      steps: ["Drink water.", "Slow breath for 2 minutes.", "Take 10 minutes of rest."],
      minutes: 15,
      reason: {
        code: "recovery",
        detail: "Lowering load helps stabilize energy and attention.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return { status: "success", source: "fallback", draft: fallback } as const;
    }

    try {
      const { threadId } = await journalAgent.createThread(ctx, {
        userId,
        title: `recovery:${targetDay}`,
      });

      const prompt = `You are generating a brief recovery protocol.

CONTEXT:
- Day: ${targetDay}
- Mode: ${(raw.stateDoc?.state as { mode?: string })?.mode ?? "unknown"}
- Load: ${(raw.stateDoc?.state as { load?: string })?.load ?? "unknown"}
- Boundaries: ${JSON.stringify(boundaries)}
- Recent events: ${JSON.stringify(raw.events)}

RULES:
1. Return JSON only.
2. Provide a short title and 1-3 steps.
3. Steps must be gentle and doable within 20 minutes.
4. Include a reason with { code, detail }.

OUTPUT FORMAT:
{ "title": string, "steps": string[], "minutes": number, "reason": { "code": string, "detail": string } }`;

      const result = await journalAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof journalAgent.generateText>[2]);

      if (!result.text) {
        return { status: "success", source: "fallback", draft: fallback } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeRecoveryProtocolDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Recovery AI error:", error);
      return { status: "success", source: "fallback", draft: fallback } as const;
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

export const getWeeklyReviewRawData = internalQuery({
  args: {
    startDay: v.string(),
    endDay: v.string(),
    weekStartMs: v.number(),
    weekEndMs: v.number(),
  },
  handler: async (ctx, { startDay, endDay, weekStartMs, weekEndMs }) => {
    const userId = getUserId();

    const stateDocs = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const filteredStates = stateDocs
      .filter((entry) => entry.day >= startDay && entry.day <= endDay)
      .map((entry) => ({ day: entry.day, state: entry.state as LifeState }));

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const filteredEvents = events
      .filter((event) => event.ts >= weekStartMs && event.ts < weekEndMs)
      .map((event) => ({ ts: event.ts, type: event.type, meta: event.meta }));

    return {
      stateDocs: filteredStates,
      events: filteredEvents,
    } satisfies WeeklyReviewRawData;
  },
});

export const getJournalPromptRawData = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();

    const skip = await ctx.db
      .query("journalSkips")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    return {
      skip: Boolean(skip),
      stateDoc: stateDoc ? { state: stateDoc.state as LifeState } : null,
      suggestions: suggestions.map((suggestion) => ({
        type: suggestion.type,
        status: suggestion.status,
      })),
      events: events.map((event) => ({ ts: event.ts, type: event.type, meta: event.meta })),
    } satisfies JournalPromptRawData;
  },
});

export const getNextStepRawData = internalQuery({
  args: {
    taskId: v.id("tasks"),
    day: v.string(),
  },
  handler: async (ctx, { taskId, day }) => {
    const userId = getUserId();

    const task = await ctx.db.get(taskId);
    const safeTask =
      task && task.userId === userId
        ? {
            _id: task._id,
            title: task.title,
            estimateMin: task.estimateMin,
            priority: task.priority ?? undefined,
            status: task.status,
          }
        : null;

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const recentEvents = events
      .filter((event) => now - event.ts < SEVEN_DAYS)
      .slice(-40)
      .map((event) => ({ ts: event.ts, type: event.type, meta: event.meta }));

    return {
      task: safeTask,
      stateDoc: stateDoc ? { state: stateDoc.state as LifeState } : null,
      events: recentEvents,
    } satisfies NextStepRawData;
  },
});

export const getRecoveryProtocolRawData = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const calendarBlocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const recentEvents = events
      .filter((event) => now - event.ts < SEVEN_DAYS)
      .slice(-40)
      .map((event) => ({ ts: event.ts, type: event.type, meta: event.meta }));

    return {
      stateDoc: stateDoc ? { state: stateDoc.state as LifeState } : null,
      calendarBlocks: calendarBlocks.map((block) => ({
        startMin: block.startMin,
        endMin: block.endMin,
        kind: block.kind,
      })),
      events: recentEvents,
    } satisfies RecoveryProtocolRawData;
  },
});

export const getWeeklyPlanRawData = internalQuery({
  args: {
    startDay: v.string(),
    endDay: v.string(),
  },
  handler: async (ctx, { startDay, endDay }) => {
    const userId = getUserId();

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const pausedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();

    const stateDocs = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const calendarBlocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    return {
      activeTasks: activeTasks.map((task) => ({
        title: task.title,
        estimateMin: task.estimateMin,
        priority: task.priority ?? undefined,
      })),
      pausedTasks: pausedTasks.map((task) => ({
        title: task.title,
        estimateMin: task.estimateMin,
        priority: task.priority ?? undefined,
      })),
      stateDocs: stateDocs
        .filter((entry) => entry.day >= startDay && entry.day <= endDay)
        .map((entry) => ({ day: entry.day, state: entry.state as LifeState })),
      calendarBlocks: calendarBlocks
        .filter((block) => block.day >= startDay && block.day <= endDay)
        .map((block) => ({
          day: block.day,
          startMin: block.startMin,
          endMin: block.endMin,
          kind: block.kind,
        })),
    } satisfies WeeklyPlanRawData;
  },
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

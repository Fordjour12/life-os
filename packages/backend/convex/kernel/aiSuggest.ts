import { v } from "convex/values";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { KernelSuggestion, LifeState } from "../../../src/kernel/types";
import { internal } from "./_generated/api";

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-sonnet";
const AI_SUGGESTIONS_ENABLED = process.env.AI_SUGGESTIONS_ENABLED === "true";

const MAX_AI_SUGGESTIONS = 3;
const MAX_TOKENS = 4000;

interface AiSuggestionInput {
  day: string;
  state: LifeState;
  activeTasks: Array<{ id: string; title: string; estimateMin: number }>;
  pausedTasks: Array<{ id: string; title: string; estimateMin: number }>;
  plan: Array<{ id: string; label: string; estimatedMinutes: number }> | null;
  recentEvents: Array<{ type: string; ts: number }>;
  tzOffsetMinutes: number;
  context: {
    planResetCountToday: number;
    stableDaysCount: number;
    exitedRecoveryRecently: boolean;
    remainingRoomMin: number;
    boundaries: {
      isLateNight: boolean;
      isRestWindow: boolean;
      isFocusProtection: boolean;
    };
  };
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
  error?: {
    message: string;
  };
}

function buildSystemPrompt(): string {
  return `You are a compassionate productivity assistant for a recovery-first Life OS.

CRITICAL RULES:
1. ALWAYS use two-phase commit: propose actions, never execute directly
2. NEVER use shame, guilt, or judgmental language
3. NEVER use words like "lazy", "procrastinate", "addiction", "disorder", "diagnosis", "label", "predict"
4. Keep suggestions gentle and supportive
5. Respect the user's current state (recovery, maintain, build, sprint)

OUTPUT FORMAT:
Return ONLY a JSON array of suggestions. Each suggestion must have:
- type: One of "PLAN_RESET", "TINY_WIN", "DAILY_REVIEW_QUESTION", "GENTLE_RETURN", "MICRO_RECOVERY_PROTOCOL", "NEXT_STEP"
- priority: 1-5 (5 is highest)
- reason.code: Short identifier
- reason.detail: Human-readable explanation (max 120 chars, gentle tone)
- payload: Type-specific data
- cooldownKey: Optional identifier for deduplication

MAX 3 suggestions. Prioritize based on urgency and user state.`;
}

function buildUserPrompt(input: AiSuggestionInput): string {
  const { state, activeTasks, pausedTasks, plan, recentEvents, context } = input;

  const eventSummary = recentEvents
    .slice(0, 10)
    .map((e) => e.type)
    .join(", ");
  const totalPausedEstimate = pausedTasks.reduce((sum, t) => sum + t.estimateMin, 0);

  return `Current State:
- Day: ${input.day}
- Mode: ${state.mode}
- Load: ${state.load} (${state.plannedMinutes}min planned / ${state.effectiveFreeMinutes}min available)
- Momentum: ${state.momentum}
- Focus Capacity: ${state.focusCapacity}
- Stability Score: ${state.stabilityScore}/100
- Plan Resets Today: ${context.planResetCountToday}
- Stable Days (recent): ${context.stableDaysCount}
- Exited Recovery Recently: ${context.exitedRecoveryRecently}
- Remaining Room: ${context.remainingRoomMin}min

Time Boundaries:
- Late Night: ${context.boundaries.isLateNight}
- Rest Window: ${context.boundaries.isRestWindow}
- Focus Protection: ${context.boundaries.isFocusProtection}

Active Tasks (${activeTasks.length}):
${activeTasks
  .slice(0, 5)
  .map((t) => `- ${t.title} (${t.estimateMin}min)`)
  .join("\n")}

Paused Tasks (${pausedTasks.length}, ${totalPausedEstimate}min total):
${pausedTasks
  .slice(0, 5)
  .map((t) => `- ${t.title} (${t.estimateMin}min)`)
  .join("\n")}

Current Plan:
${plan?.map((p, i) => `${i + 1}. ${p.label} (${p.estimatedMinutes}min)`).join("\n") ?? "No plan set"}

Recent Events: ${eventSummary || "None"}

Generate 1-3 suggestions based on this state. Return ONLY valid JSON array.`;
}

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
): Promise<{
  suggestions: KernelSuggestion[];
  tokens: { request: number; response: number };
} | null> {
  if (!OPENROUTER_API_KEY) {
    console.error("OpenRouter API key not configured");
    return null;
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://life-os.app",
        "X-Title": "Life OS AI Suggestions",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter error: ${response.status} ${errorText}`);
      return null;
    }

    const data = (await response.json()) as OpenRouterResponse;

    if (data.error) {
      console.error(`OpenRouter error: ${data.error.message}`);
      return null;
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("No content in OpenRouter response");
      return null;
    }

    let parsed: KernelSuggestion[];
    try {
      const parsedContent = JSON.parse(content);
      parsed = Array.isArray(parsedContent) ? parsedContent : parsedContent.suggestions || [];
    } catch {
      console.error("Failed to parse AI response as JSON", content.slice(0, 200));
      return null;
    }

    return {
      suggestions: parsed.slice(0, MAX_AI_SUGGESTIONS),
      tokens: {
        request: data.usage?.prompt_tokens ?? 0,
        response: data.usage?.completion_tokens ?? 0,
      },
    };
  } catch (error) {
    console.error("OpenRouter request failed:", error);
    return null;
  }
}

const VALID_SUGGESTION_TYPES = new Set([
  "PLAN_RESET",
  "TINY_WIN",
  "DAILY_REVIEW_QUESTION",
  "GENTLE_RETURN",
  "MICRO_RECOVERY_PROTOCOL",
  "NEXT_STEP",
]);

const FORBIDDEN_WORDS = [
  "addiction",
  "diagnose",
  "diagnosis",
  "disorder",
  "label",
  "lazy",
  "procrastinate",
  "you are",
  "you're",
  "predict",
];

function isSafeText(text: string): boolean {
  const lower = text.toLowerCase();
  return !FORBIDDEN_WORDS.some((word) => lower.includes(word));
}

function sanitizeText(text: string, fallback: string): string {
  return isSafeText(text) ? text : fallback;
}

function validateAndSanitizeSuggestion(suggestion: unknown, day: string): KernelSuggestion | null {
  if (!suggestion || typeof suggestion !== "object") return null;

  const s = suggestion as Record<string, unknown>;

  const type = s.type as string;
  if (!VALID_SUGGESTION_TYPES.has(type)) {
    console.warn(`Invalid suggestion type: ${type}`);
    return null;
  }

  const priority = Number(s.priority);
  if (![1, 2, 3, 4, 5].includes(priority)) {
    console.warn(`Invalid priority: ${priority}`);
    return null;
  }

  const reason = s.reason as Record<string, unknown> | undefined;
  if (!reason || typeof reason.detail !== "string" || !reason.detail.trim()) {
    console.warn("Missing or invalid reason.detail");
    return null;
  }

  const payload = s.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object") {
    console.warn("Missing or invalid payload");
    return null;
  }

  const cooldownKey = s.cooldownKey as string | undefined;

  const safeDetail = sanitizeText(reason.detail, "Gentle suggestion based on your current state.");

  if (safeDetail !== reason.detail) {
    console.warn("Sanitized suggestion detail due to unsafe language");
  }

  return {
    day,
    type: type as KernelSuggestion["type"],
    priority: priority as KernelSuggestion["priority"],
    reason: {
      code: String(reason.code || "AI_SUGGESTED"),
      detail: safeDetail,
    },
    payload: payload as Record<string, unknown>,
    status: "new",
    cooldownKey: cooldownKey || `ai_${type.toLowerCase()}`,
  };
}

export const generateSuggestions = action({
  args: {
    day: v.string(),
    tzOffsetMinutes: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { day, tzOffsetMinutes }) => {
    const startTime = Date.now();
    const offset = Math.max(-840, Math.min(840, tzOffsetMinutes ?? 0));

    if (!AI_SUGGESTIONS_ENABLED) {
      return { suggestions: [], cached: false, error: "AI suggestions disabled" };
    }

    // Use api object for queries
    const todayData = await ctx.runQuery(api.kernel.commands.getToday, { tzOffsetMinutes: offset });

    if (!todayData.state) {
      return { suggestions: [], cached: false, error: "No state available" };
    }

    const [recentEvents, allTasks] = await Promise.all([
      ctx.runQuery(api.kernel.commands.getEventsForDay, {
        day,
        types: [],
        tzOffsetMinutes: offset,
      }),
      ctx.runQuery(api.tasks.getAll, {}),
    ]);

    const activeTasks = allTasks
      .filter((t: { status: string }) => t.status === "active")
      .map((t: { _id: string; title: string; estimateMin: number }) => ({
        id: t._id,
        title: t.title,
        estimateMin: t.estimateMin,
      }));

    const pausedTasks = allTasks
      .filter((t: { status: string }) => t.status === "paused")
      .map((t: { _id: string; title: string; estimateMin: number }) => ({
        id: t._id,
        title: t.title,
        estimateMin: t.estimateMin,
      }));

    let stateHistory: Array<{ day: string; state: LifeState }> = [];
    try {
      stateHistory = await ctx.runQuery(api.kernel.commands.getStateHistory, { days: 7 });
    } catch {
      // Ignore errors
    }

    const priorDays = [1, 2, 3].map((d) => {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - d);
      return date.toISOString().split("T")[0];
    });

    let stableDaysCount = 0;
    for (const priorDay of priorDays) {
      const priorState = stateHistory.find((h) => h.day === priorDay)?.state;
      if (priorState?.stabilityScore && priorState.stabilityScore >= 60) {
        stableDaysCount += 1;
      }
    }

    const yesterdayState = stateHistory.find((h) => h.day === priorDays[0])?.state;
    const exitedRecoveryRecently =
      yesterdayState?.mode === "recovery" && todayData.state.mode !== "recovery";

    const remainingRoomMin = Math.max(
      0,
      (todayData.state.freeMinutes ?? 0) - (todayData.state.plannedMinutes ?? 0),
    );

    const planResetCountToday = recentEvents.filter(
      (e: { type: string; meta?: unknown }) =>
        e.type === "PLAN_RESET_APPLIED" ||
        (e.type === "PLAN_SET" && (e.meta as { reason?: string })?.reason === "reset"),
    ).length;

    const boundaries = {
      isLateNight: false,
      isRestWindow: false,
      isFocusProtection: false,
    };

    const aiInput: AiSuggestionInput = {
      day,
      state: todayData.state,
      activeTasks,
      pausedTasks,
      plan: todayData.plan,
      recentEvents: recentEvents.map((e: { type: string; ts: number }) => ({
        type: e.type,
        ts: e.ts,
      })),
      tzOffsetMinutes: offset,
      context: {
        planResetCountToday,
        stableDaysCount,
        exitedRecoveryRecently,
        remainingRoomMin,
        boundaries,
      },
    };

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(aiInput);

    const result = await callOpenRouter(systemPrompt, userPrompt);

    const durationMs = Date.now() - startTime;

    const userData = await ctx.runQuery(api.identity.getCurrentUserId, {});
    const userId = userData.userId;

    if (!result) {
      await ctx.runMutation(internal.ai.logRequest, {
        userId,
        day,
        success: false,
        modelUsed: OPENROUTER_MODEL,
        errorMessage: "OpenRouter call failed",
        durationMs,
      });
      return { suggestions: [], cached: false, error: "AI generation failed" };
    }

    const validSuggestions = result.suggestions
      .map((s) => validateAndSanitizeSuggestion(s, day))
      .filter((s): s is KernelSuggestion => s !== null);

    if (validSuggestions.length > 0) {
      await ctx.runMutation(internal.ai.cacheSuggestions, {
        userId,
        day,
        suggestions: validSuggestions,
        modelUsed: OPENROUTER_MODEL,
        requestTokens: result.tokens.request,
        responseTokens: result.tokens.response,
      });
    }

    await ctx.runMutation(internal.ai.logRequest, {
      userId,
      day,
      success: true,
      modelUsed: OPENROUTER_MODEL,
      durationMs,
    });

    return {
      suggestions: validSuggestions,
      cached: false,
      model: OPENROUTER_MODEL,
    };
  },
});

export const getCachedSuggestions = action({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userData = await ctx.runQuery(api.identity.getCurrentUserId, {});
    const userId = userData.userId;

    const cached = await ctx.runQuery(internal.ai.getCache, { userId, day });

    if (!cached) {
      return { suggestions: [], cached: false };
    }

    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - cached.createdAt > ONE_DAY_MS) {
      return { suggestions: [], cached: false, expired: true };
    }

    return {
      suggestions: cached.suggestions,
      cached: true,
      model: cached.modelUsed,
    };
  },
});

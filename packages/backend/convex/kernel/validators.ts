import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";
import {
  DAILY_SUGGESTION_CAP,
  getBoundaryFlagsFromBlocks,
  normalizeOffsetMinutes,
} from "./stabilization";
import { normalizePlanEstimate } from "./helpers";
import {
  filterSafeStrings,
  isSafeCopy,
  safeCopy,
  sanitizeSuggestionCopy,
} from "../identity/guardrails";
import {
  AI_SUGGESTION_TYPES,
  MAX_COOLDOWN_KEY_LENGTH,
  MAX_REASON_DETAIL_LENGTH,
  type AiSuggestContext,
  type AiSuggestRawData,
  type JournalPromptRawData,
  type NextStepRawData,
  type RecoveryProtocolRawData,
  type DailyPlanDraft,
  type WeeklyPlanRawData,
  type WeeklyPlanDraft,
  type WeeklyReviewDraft,
  type JournalPromptDraft,
  type NextStepDraft,
  type RecoveryProtocolDraft,
} from "./typesVex";

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

export function getMomentum(state: LifeState | null | undefined): LifeState["momentum"] | null {
  if (!state || typeof state !== "object") return null;
  const momentum = (state as LifeState).momentum;
  return allowedMomenta.has(momentum) ? momentum : null;
}

export function getLoad(state: LifeState | null | undefined): LifeState["load"] | null {
  if (!state || typeof state !== "object") return null;
  const load = (state as LifeState).load;
  return load === "balanced" || load === "overloaded" || load === "underloaded" ? load : null;
}

export function isValidSuggestionType(type: string): type is KernelSuggestion["type"] {
  return AI_SUGGESTION_TYPES.includes(type as (typeof AI_SUGGESTION_TYPES)[number]);
}

export function isValidPriority(priority: number): priority is KernelSuggestion["priority"] {
  return Number.isInteger(priority) && priority >= 1 && priority <= 5;
}

export function validateAiSuggestion(suggestion: unknown): KernelSuggestion | null {
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

export function buildAiContext(
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
    .slice(0, 200)
    .map((e) => ({ type: e.type, ts: e.ts, meta: e.meta }));

  const activeTasks = raw.activeTasks.slice(0, 50).map((t) => ({
    _id: t._id,
    title: t.title,
    estimateMin: t.estimateMin,
    priority: t.priority,
  }));

  const pausedTasks = raw.pausedTasks.slice(0, 50).map((t) => ({
    _id: t._id,
    title: t.title,
    estimateMin: t.estimateMin,
    priority: t.priority,
  }));

  const blocks = raw.calendarBlocks;

  const calendarBlocks = blocks
    .slice(0, 50)
    .map((b) => ({ startMin: b.startMin, endMin: b.endMin, kind: b.kind }));

  const planEvents = allEvents.filter((e) => e.type === "PLAN_SET");
  let plan: AiSuggestContext["plan"] = null;
  let latestVersion = -1;
  for (const event of planEvents) {
    const meta = event.meta as {
      day?: string;
      version?: number;
      focusItems?: Array<{
        id?: string;
        label?: string;
        estimatedMinutes?: number;
      }>;
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

  const existingSuggestions = raw.existingSuggestions.slice(0, 20).map((s) => ({
    type: s.type,
    priority: s.priority,
    cooldownKey: s.cooldownKey,
    createdAt: s.createdAt,
    status: s.status,
  }));

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

export function pickPrompt(day: string): string {
  const safePrompts = journalFallbackPrompts.filter(isSafeCopy);
  const source = safePrompts.length > 0 ? safePrompts : journalFallbackPrompts;
  const seed = day.split("-").reduce((sum, part) => sum + Number(part || 0), 0);
  return source[seed % source.length] ?? source[0];
}

export function normalizeWeeklyReviewDraft(
  raw: unknown,
  fallback: WeeklyReviewDraft,
): WeeklyReviewDraft {
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

export function normalizeJournalPromptDraft(
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

export function normalizeNextStepDraft(raw: unknown, fallback: NextStepDraft): NextStepDraft {
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

export function normalizeRecoveryProtocolDraft(
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

export function normalizeWeeklyPlanDraft(raw: unknown, fallback: WeeklyPlanDraft): WeeklyPlanDraft {
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
          : {
              code: "draft",
              detail: "Drafted to fit your capacity for the day.",
            };

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

export function normalizeDailyPlanDraft(raw: unknown, fallback: DailyPlanDraft): DailyPlanDraft {
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const focusItemsRaw = Array.isArray(candidate.focusItems) ? candidate.focusItems : [];
  const focusItems = focusItemsRaw
    .slice(0, 3)
    .map((focus, index) => {
      if (!focus || typeof focus !== "object") return null;
      const data = focus as Record<string, unknown>;
      const label = safeCopy(String(data.label ?? "").trim(), "Focus block");
      if (!label) return null;
      return {
        id:
          String(data.id ?? `focus-${fallback.day}-${index}`).trim() ||
          `focus-${fallback.day}-${index}`,
        label,
        estimatedMinutes: normalizePlanEstimate(Number(data.estimatedMinutes ?? 25)),
      };
    })
    .filter((focus): focus is { id: string; label: string; estimatedMinutes: number } =>
      Boolean(focus),
    );
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
    focusItems: focusItems.length ? focusItems : fallback.focusItems,
    reason,
  };
}

export { journalReasonDetails };

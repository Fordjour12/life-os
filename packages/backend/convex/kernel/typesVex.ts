import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";

export type { KernelSuggestion, LifeState };

export type AiSuggestContext = {
  day: string;
  tzOffsetMinutes: number;
  state: LifeState;
  events: Array<{ type: string; ts: number; meta?: unknown }>;
  tasks: {
    active: Array<{
      _id: string;
      title: string;
      estimateMin: number;
      priority?: number;
    }>;
    paused: Array<{
      _id: string;
      title: string;
      estimateMin: number;
      priority?: number;
    }>;
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

export type AiSuggestRawData = {
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

export type WeeklyReviewRawData = {
  stateDocs: Array<{ day: string; state: LifeState }>;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

export type JournalPromptRawData = {
  skip: boolean;
  stateDoc: { state: LifeState } | null;
  suggestions: Array<{ type: string; status: string }>;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

export type NextStepRawData = {
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

export type RecoveryProtocolRawData = {
  stateDoc: { state: LifeState } | null;
  calendarBlocks: Array<{ startMin: number; endMin: number; kind: string }>;
  events: Array<{ ts: number; type: string; meta: unknown }>;
};

export type WeeklyPlanRawData = {
  activeTasks: Array<{ title: string; estimateMin: number; priority?: number }>;
  pausedTasks: Array<{ title: string; estimateMin: number; priority?: number }>;
  stateDocs: Array<{ day: string; state: LifeState }>;
  calendarBlocks: Array<{
    day: string;
    startMin: number;
    endMin: number;
    kind: string;
  }>;
};

export type WeeklyReviewDraft = {
  highlights: string[];
  frictionPoints: string[];
  reflectionQuestion: string;
  narrative: string;
  reason: { code: string; detail: string };
};

export type JournalPromptDraft = {
  day: string;
  prompt: string | null;
  reason: { code: string; detail: string } | null;
  quiet: boolean;
};

export type NextStepDraft = {
  taskId: string;
  step: string;
  estimateMin: number;
  reason: { code: string; detail: string };
};

export type RecoveryProtocolDraft = {
  day: string;
  title: string;
  steps: string[];
  minutes: number;
  reason: { code: string; detail: string };
};

export type WeeklyPlanDraft = {
  week: string;
  days: Array<{
    day: string;
    focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
    reason: { code: string; detail: string };
  }>;
  reason: { code: string; detail: string };
};

export const AI_SUGGESTION_TYPES = [
  "PLAN_RESET",
  "TINY_WIN",
  "DAILY_REVIEW_QUESTION",
  "GENTLE_RETURN",
  "MICRO_RECOVERY_PROTOCOL",
  "NEXT_STEP",
] as const;

export const MAX_REASON_DETAIL_LENGTH = 240;
export const MAX_COOLDOWN_KEY_LENGTH = 64;

export const DATA_LIMITS = {
  maxEvents: 200,
  maxActiveTasks: 50,
  maxPausedTasks: 50,
  maxCalendarBlocks: 50,
  maxExistingSuggestions: 20,
};

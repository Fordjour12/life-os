export type PlanFocusItem = {
  id: string;
  label: string;
  estimatedMinutes: number;
};

export type PlanSetReason = "initial" | "adjust" | "reset" | "recovery" | "return";

export type PlannerState =
  | "NO_PLAN"
  | "PLANNED_OK"
  | "OVERLOADED"
  | "STALLED"
  | "RECOVERY"
  | "RETURNING";

export type KernelCommand =
  | {
      cmd: "create_task";
      input: { title: string; estimateMin: number; priority?: 1 | 2 | 3; notes?: string };
      idempotencyKey: string;
    }
  | { cmd: "complete_task"; input: { taskId: string }; idempotencyKey: string }
  | {
      cmd: "apply_plan_reset";
      input: { day: string; keepCount?: 1 | 2 };
      idempotencyKey: string;
    }
  | {
      cmd: "set_daily_plan";
      input: { day: string; focusItems: PlanFocusItem[]; reason?: PlanSetReason };
      idempotencyKey: string;
    }
  | {
      cmd: "submit_feedback";
      input: { suggestionId: string; vote: "up" | "down" | "ignore" };
      idempotencyKey: string;
    };

export type KernelEvent =
  | {
      type: "TASK_CREATED";
      ts: number;
      meta: { taskId: string; estimateMin: number };
    }
  | { type: "TASK_COMPLETED"; ts: number; meta: { taskId: string; estimateMin: number } }
  | {
      type: "TASK_PAUSED";
      ts: number;
      meta: { taskId: string; reason: "plan_reset" };
    }
  | {
      type: "TASK_RESUMED";
      ts: number;
      meta: { taskId: string; reason: "manual" | "gentle_return" };
    }
  | {
      type: "PLAN_RESET_APPLIED";
      ts: number;
      meta: { day: string; keptTaskIds: string[]; pausedTaskIds: string[] };
    }
  | {
      type: "PLAN_SET";
      ts: number;
      meta: {
        day: string;
        version: number;
        reason: PlanSetReason;
        focusItems: PlanFocusItem[];
        plannedMinutes?: number;
      };
    }
  | {
      type: "SUGGESTION_FEEDBACK";
      ts: number;
      meta: { suggestionId: string; vote: "up" | "down" | "ignore" };
    };

export type LoadState = "underloaded" | "balanced" | "overloaded";
export type Momentum = "stalled" | "steady" | "strong";
export type FocusCapacity = "very_low" | "low" | "medium" | "high";
export type LifeMode = "recovery" | "maintain" | "build" | "sprint";

export type LifeState = {
  day: string;
  mode: LifeMode;

  plannedMinutes: number;
  completedMinutes: number;
  completedTasksCount: number;
  stabilityScore: number;
  freeMinutes: number;

  load: LoadState;
  momentum: Momentum;
  focusCapacity: FocusCapacity;

  reasons: Array<{ code: string; detail: string }>;
};

export type SuggestionStatus =
  | "new"
  | "accepted"
  | "downvoted"
  | "ignored"
  | "expired";

export type KernelSuggestion = {
  day: string;
  type: "PLAN_RESET" | "TINY_WIN" | "DAILY_REVIEW_QUESTION" | "GENTLE_RETURN" | "NEXT_STEP";
  priority: 1 | 2 | 3 | 4 | 5;
  reason: { code: string; detail: string };
  payload: Record<string, unknown>;
  status: SuggestionStatus;
  cooldownKey?: string;
};

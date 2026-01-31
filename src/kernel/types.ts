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
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "complete_task";
      input: { taskId: string };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "accept_rest";
      input: { minutes: number; day: string };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "apply_plan_reset";
      input: { day: string; keepCount?: 1 | 2 };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "set_daily_plan";
      input: { day: string; focusItems: PlanFocusItem[]; reason?: PlanSetReason };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "submit_feedback";
      input: { suggestionId: string; vote: "up" | "down" | "ignore" };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "log_habit";
      input: { habitId: string; status: "done" | "missed"; note?: string };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
    }
  | {
      cmd: "add_expense";
      input: { amount: number; category: string; note?: string };
      idempotencyKey: string;
      tzOffsetMinutes?: number;
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
      meta: { taskId: string; reason: "plan_reset" | "micro_recovery" };
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
    }
  | {
      type: "CAL_BLOCK_ADDED";
      ts: number;
      meta: {
        blockId: string;
        day: string;
        startMin: number;
        endMin: number;
        kind: "busy" | "focus" | "rest" | "personal";
      };
    }
  | {
      type: "CAL_BLOCK_UPDATED";
      ts: number;
      meta: {
        blockId: string;
        day: string;
        startMin: number;
        endMin: number;
        kind: "busy" | "focus" | "rest" | "personal";
      };
    }
  | { type: "CAL_BLOCK_REMOVED"; ts: number; meta: { blockId: string } }
  | { type: "REST_ACCEPTED"; ts: number; meta: { minutes: number } }
  | {
      type: "RECOVERY_PROTOCOL_USED";
      ts: number;
      meta: { day: string; didTinyWin: boolean; didRest: boolean };
    }
  | {
      type: "HABIT_DONE";
      ts: number;
      meta: { habitId: string; note?: string };
    }
  | {
      type: "HABIT_MISSED";
      ts: number;
      meta: { habitId: string; note?: string };
    }
  | {
      type: "EXPENSE_ADDED";
      ts: number;
      meta: { amount: number; category: string; note?: string };
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
  effectiveFreeMinutes: number;
  focusMinutes: number;
  busyMinutes: number;

  load: LoadState;
  momentum: Momentum;
  focusCapacity: FocusCapacity;
  habitHealth: "fragile" | "stable" | "strong";
  financialDrift: "ok" | "watch" | "risk";
  backlogPressure: number;

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
  type:
    | "PLAN_RESET"
    | "TINY_WIN"
    | "DAILY_REVIEW_QUESTION"
    | "GENTLE_RETURN"
    | "MICRO_RECOVERY_PROTOCOL"
    | "NEXT_STEP";
  priority: 1 | 2 | 3 | 4 | 5;
  reason: { code: string; detail: string };
  payload: Record<string, unknown>;
  status: SuggestionStatus;
  cooldownKey?: string;
};

// Capacity & execution
export type FocusCapacity = "very_low" | "low" | "medium" | "high";
export type LoadState = "underloaded" | "balanced" | "overloaded";
export type Momentum = "stalled" | "steady" | "strong";
export type Friction = "low" | "medium" | "high";

// Behavior & routines
export type HabitHealth = "fragile" | "stable" | "strong";

// Finance (light, non-accounting)
export type FinancialDrift = "ok" | "watch" | "risk";

// Planning quality
export type PlanQuality = "none" | "rough" | "clear";

// Overall life mode
export type LifeMode = "recovery" | "maintain" | "build" | "sprint";

export type KernelEvent =
  | { type: "TASK_CREATED"; taskId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "TASK_COMPLETED"; taskId: string; ts: number; meta?: Record<string, unknown> }
  | {
      type: "TASK_RESCHEDULED";
      taskId: string;
      oldDate: string;
      newDate: string;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | { type: "TASK_DELETED"; taskId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "HABIT_DONE"; habitId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "HABIT_MISSED"; habitId: string; ts: number; meta?: Record<string, unknown> }
  | {
      type: "PLAN_SET";
      day: string;
      top3TaskIds: string[];
      ts: number;
      meta?: Record<string, unknown>;
    }
  | {
      type: "CAL_BLOCK_ADDED";
      blockId: string;
      day: string;
      startMin: number;
      endMin: number;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | {
      type: "CAL_BLOCK_FINISHED";
      blockId: string;
      completed: boolean;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | { type: "CAL_BLOCK_REMOVED"; blockId: string; ts: number; meta?: Record<string, unknown> }
  | {
      type: "EXPENSE_ADDED";
      expenseId: string;
      amount: number;
      category: string;
      ts: number;
      meta?: Record<string, unknown>;
    }
  | {
      type: "COACHING_FEEDBACK";
      suggestionId: string;
      action: "accepted" | "ignored" | "dismissed";
      ts: number;
      meta?: Record<string, unknown>;
    }
  | { type: "SESSION_START"; ts: number; meta?: Record<string, unknown> }
  | { type: "SESSION_END"; ts: number; meta?: Record<string, unknown> };

export type LifeState = {
  day: string;
  mode: LifeMode;
  focusCapacity: FocusCapacity;
  load: LoadState;
  momentum: Momentum;
  friction: Friction;
  habitHealth: HabitHealth;
  financialDrift: FinancialDrift;
  planQuality: PlanQuality;
  plannedMinutes: number;
  freeMinutes: number;
  completedMinutes: number;
  completionRate: number;
  streakScore: number;
  backlogPressure: number;
  spendVsIntent: number;
  reasons: Array<{ code: string; detail: string }>;
};

export type KernelAction =
  | { type: "SUGGEST_REPLAN_DAY"; reason: string; payload: Record<string, unknown> }
  | {
      type: "SUGGEST_TIMEBLOCK";
      taskId: string;
      suggestedSlot: { day: string; startMin: number; endMin: number };
    }
  | { type: "SUGGEST_REDUCE_SCOPE"; taskIds: string[]; toRemoveCount: number }
  | { type: "SUGGEST_HABIT_DOWNSHIFT"; habitId: string; newTarget: string }
  | { type: "SUGGEST_NO_SPEND_TODAY"; reason: string }
  | { type: "AUTO_RESCHEDULE_TASKS"; taskIds: string[]; newDates: Record<string, string> }
  | { type: "ASK_REFLECTION_QUESTION"; questionId: string; text: string }
  | { type: "SUGGEST_TINY_WIN"; taskId: string; reason: string }
  | { type: "SUGGEST_LIGHT_DAY"; suggestedTasks: string[] }
  | { type: "SUGGEST_BACKLOG_CLEANUP"; count: number };

export type KernelCommand =
  | {
      cmd: "create_task";
      input: { title: string; estimateMin: number; dueDate?: string; habitId?: string };
    }
  | { cmd: "complete_task"; input: { taskId: string } }
  | { cmd: "reschedule_task"; input: { taskId: string; newDate: string } }
  | { cmd: "delete_task"; input: { taskId: string } }
  | { cmd: "add_expense"; input: { amount: number; category: string; note?: string } }
  | { cmd: "set_daily_plan"; input: { day: string; top3TaskIds: string[] } }
  | { cmd: "apply_reschedule"; input: { taskId: string; newDate: string } }
  | { cmd: "downshift_habit"; input: { habitId: string; newTarget: string } }
  | { cmd: "accept_suggestion"; input: { suggestionId: string } };

export type PolicyContext = {
  now: string;
  state: LifeState;
  recentEvents: KernelEvent[];
  facts: {
    plannedMinutes: number;
    freeMinutes: number;
    completedLast3Days: number;
    habitCompletion7Days: number;
    streakBreaks: number;
    spendVsIntent: number;
    backlogCount: number;
  };
};

export type ProposedAction = {
  id: string;
  type: KernelAction["type"];
  priority: 1 | 2 | 3 | 4 | 5;
  cooldownHours?: number;
  reason: { code: string; detail: string };
  payload: Record<string, unknown>;
  requiresUserConfirm: boolean;
  safety: { scope: "local" | "server"; risk: "low" | "med" | "high" };
};

export type Policy = {
  name: string;
  when: (ctx: PolicyContext) => boolean;
  propose: (ctx: PolicyContext) => ProposedAction[];
};

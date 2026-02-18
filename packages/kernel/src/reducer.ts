import type {
  FinancialDrift,
  FocusCapacity,
  Friction,
  HabitHealth,
  KernelEvent,
  LifeMode,
  LifeState,
  LoadState,
  Momentum,
} from "./types";

const DEFAULT_STATE: LifeState = {
  day: new Date().toISOString().split("T")[0] ?? "",
  mode: "maintain",
  focusCapacity: "medium",
  load: "balanced",
  momentum: "steady",
  friction: "medium",
  habitHealth: "stable",
  financialDrift: "ok",
  planQuality: "none",
  plannedMinutes: 0,
  freeMinutes: 480,
  completedMinutes: 0,
  completionRate: 0,
  streakScore: 50,
  backlogPressure: 0,
  spendVsIntent: 1.0,
  reasons: [],
};

export function createInitialState(day: string): LifeState {
  return { ...DEFAULT_STATE, day, reasons: [] };
}

export function reduce(prevState: LifeState, event: KernelEvent): LifeState {
  const state: LifeState = { ...prevState };
  const reasons = [...state.reasons];

  switch (event.type) {
    case "TASK_CREATED": {
      state.backlogPressure = Math.min(100, state.backlogPressure + 5);
      reasons.push({ code: "TASK_CREATED", detail: `New task ${event.taskId}` });
      break;
    }
    case "TASK_COMPLETED": {
      state.completedMinutes += 30;
      state.completionRate =
        state.plannedMinutes > 0 ? state.completedMinutes / state.plannedMinutes : 0;
      state.backlogPressure = Math.max(0, state.backlogPressure - 3);
      reasons.push({ code: "TASK_DONE", detail: `Completed task ${event.taskId}` });
      break;
    }
    case "TASK_DELETED": {
      state.backlogPressure = Math.max(0, state.backlogPressure - 5);
      reasons.push({ code: "TASK_REMOVED", detail: `Deleted task ${event.taskId}` });
      break;
    }
    case "PLAN_SET": {
      const count = event.top3TaskIds.length;
      state.planQuality = count === 3 ? "clear" : count > 0 ? "rough" : "none";
      state.plannedMinutes = count * 30;
      reasons.push({ code: "PLAN_SET", detail: `Set ${count} priorities` });
      break;
    }
    case "CAL_BLOCK_ADDED": {
      const duration = Math.max(0, event.endMin - event.startMin);
      state.plannedMinutes += duration;
      reasons.push({ code: "BLOCK_ADDED", detail: `Scheduled ${duration} min block` });
      break;
    }
    case "CAL_BLOCK_FINISHED": {
      if (event.completed) {
        state.completedMinutes += 30;
      }
      break;
    }
    case "CAL_BLOCK_REMOVED": {
      state.plannedMinutes = Math.max(0, state.plannedMinutes - 30);
      reasons.push({ code: "BLOCK_REMOVED", detail: "Calendar block removed" });
      break;
    }
    case "HABIT_DONE": {
      state.streakScore = Math.min(100, state.streakScore + 5);
      reasons.push({ code: "HABIT_DONE", detail: `Habit ${event.habitId} completed` });
      break;
    }
    case "HABIT_MISSED": {
      state.streakScore = Math.max(0, state.streakScore - 10);
      reasons.push({ code: "HABIT_MISSED", detail: `Habit ${event.habitId} missed` });
      break;
    }
    case "EXPENSE_ADDED": {
      state.spendVsIntent = Math.max(1, state.spendVsIntent + event.amount / 1000);
      reasons.push({ code: "EXPENSE_ADDED", detail: `${event.amount} added to spending` });
      break;
    }
    case "COACHING_FEEDBACK": {
      reasons.push({
        code: "FEEDBACK",
        detail: `Suggestion ${event.action}`,
      });
      break;
    }
    case "SESSION_START": {
      reasons.push({ code: "SESSION_START", detail: "Session started" });
      break;
    }
    case "SESSION_END": {
      reasons.push({ code: "SESSION_END", detail: "Session ended" });
      break;
    }
    case "TASK_RESCHEDULED":
      reasons.push({ code: "TASK_RESCHEDULED", detail: `Rescheduled task ${event.taskId}` });
      break;
    default:
      break;
  }

  computeDerivedMetrics(state, reasons);

  return { ...state, reasons };
}

function computeDerivedMetrics(state: LifeState, reasons: LifeState["reasons"]): void {
  const loadRatio = state.plannedMinutes / Math.max(1, state.freeMinutes);
  state.load = computeLoadState(loadRatio);
  if (state.load === "overloaded") {
    reasons.push({
      code: "OVERLOAD",
      detail: `Planning ${Math.round(loadRatio * 100)}% of free time`,
    });
  }

  state.momentum = computeMomentum(state.completedMinutes);
  state.habitHealth = computeHabitHealth(state.streakScore, reasons);
  state.financialDrift = computeFinancialDrift(state.spendVsIntent, reasons);
  state.focusCapacity = computeFocusCapacity(state.load, state.completionRate);
  state.friction = computeFriction(state.momentum);
  state.mode = computeLifeMode(state);
}

function computeLoadState(loadRatio: number): LoadState {
  if (loadRatio < 0.7) return "underloaded";
  if (loadRatio <= 1.05) return "balanced";
  return "overloaded";
}

function computeMomentum(completedMinutes: number): Momentum {
  if (completedMinutes <= 30) return "stalled";
  if (completedMinutes <= 120) return "steady";
  return "strong";
}

function computeHabitHealth(score: number, reasons: LifeState["reasons"]): HabitHealth {
  if (score < 40) {
    reasons.push({ code: "HABIT_FRAGILE", detail: "Habit completion is low" });
    return "fragile";
  }
  if (score <= 75) return "stable";
  return "strong";
}

function computeFinancialDrift(value: number, reasons: LifeState["reasons"]): FinancialDrift {
  if (value > 1.15) {
    reasons.push({ code: "FINANCIAL_RISK", detail: "Spending ahead of plan" });
    return "risk";
  }
  if (value > 1.0) return "watch";
  return "ok";
}

function computeFocusCapacity(load: LoadState, completionRate: number): FocusCapacity {
  if (load === "overloaded" && completionRate < 0.4) return "low";
  if (completionRate > 0.75 && load === "balanced") return "high";
  return "medium";
}

function computeFriction(momentum: Momentum): Friction {
  if (momentum === "stalled") return "high";
  if (momentum === "strong") return "low";
  return "medium";
}

function computeLifeMode(state: LifeState): LifeMode {
  if (
    (state.load === "overloaded" &&
      (state.focusCapacity === "low" || state.focusCapacity === "very_low")) ||
    state.habitHealth === "fragile"
  ) {
    return "recovery";
  }

  if (state.load === "balanced" && state.momentum === "steady") {
    return "maintain";
  }

  if (
    state.load === "balanced" &&
    state.momentum === "strong" &&
    (state.habitHealth === "stable" || state.habitHealth === "strong")
  ) {
    return "build";
  }

  return "maintain";
}

export type { LifeState };

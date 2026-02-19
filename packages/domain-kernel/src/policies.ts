import type { KernelSuggestion, LifeState, FinancialState } from "./types";

export type PolicyContext = {
  lastPlanResetAt?: number;
  planResetCountToday: number;
  smallestPausedTask?: { taskId: string; title: string; estimateMin: number };
  stableDaysCount: number;
  exitedRecoveryRecently: boolean;
  remainingRoomMin: number;
  tinyWinTask?: { taskId: string; title: string; estimateMin: number } | null;
  boundaries?: {
    isLateNight: boolean;
    isRestWindow: boolean;
    isFocusProtection: boolean;
  };
  financialState?: FinancialState;
};

const PLAN_RESET_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BOUNDARIES = {
  isLateNight: false,
  isRestWindow: false,
  isFocusProtection: false,
};

function applyBoundaryFilters(
  suggestions: KernelSuggestion[],
  boundaries: typeof DEFAULT_BOUNDARIES,
): KernelSuggestion[] {
  if (boundaries.isLateNight) {
    const allowed = new Set(["MICRO_RECOVERY_PROTOCOL", "DAILY_REVIEW_QUESTION"]);
    return suggestions.filter((suggestion) => allowed.has(suggestion.type));
  }

  if (boundaries.isRestWindow) {
    const allowed = new Set(["MICRO_RECOVERY_PROTOCOL", "DAILY_REVIEW_QUESTION"]);
    return suggestions.filter((suggestion) => allowed.has(suggestion.type));
  }

  if (boundaries.isFocusProtection) {
    const blocked = new Set(["GENTLE_RETURN", "TINY_WIN"]);
    return suggestions.filter((suggestion) => !blocked.has(suggestion.type));
  }

  return suggestions;
}

export function runPolicies(state: LifeState, context?: PolicyContext): KernelSuggestion[] {
  const out: KernelSuggestion[] = [];
  const day = state.day;
  const lastPlanResetAt = context?.lastPlanResetAt ?? 0;
  const planResetCountToday = context?.planResetCountToday ?? 0;
  const smallestPausedTask = context?.smallestPausedTask;
  const stableDaysCount = context?.stableDaysCount ?? 0;
  const exitedRecoveryRecently = context?.exitedRecoveryRecently ?? false;
  const remainingRoomMin = context?.remainingRoomMin ?? 0;
  const tinyWinTask = context?.tinyWinTask ?? null;
  const boundaries = context?.boundaries ?? DEFAULT_BOUNDARIES;
  const resetCooldownActive = Date.now() - lastPlanResetAt < PLAN_RESET_COOLDOWN_MS;

  if (state.mode === "recovery") {
    const tinyWinPayload = tinyWinTask
      ? {
          kind: "task" as const,
          taskId: tinyWinTask.taskId,
          title: tinyWinTask.title,
          estimateMin: tinyWinTask.estimateMin,
        }
      : {
          kind: "action" as const,
          title: "Do one tiny reset",
          estimateMin: 5,
        };

    out.push({
      day,
      type: "MICRO_RECOVERY_PROTOCOL",
      priority: 5,
      reason: {
        code: "SAFE_MODE",
        detail: "Recovery mode is active. Keep it gentle and protect momentum.",
      },
      payload: {
        tinyWin: tinyWinPayload,
        rest: { title: "Take a short rest", minutes: 15 },
        reflection: {
          question:
            "What’s one thing you need right now—less pressure, more clarity, or more rest?",
        },
      },
      status: "new",
      cooldownKey: "micro_recovery",
    });

    return applyBoundaryFilters(out, boundaries).slice(0, 1);
  }

  if (state.load === "overloaded" && !resetCooldownActive) {
    const suggestRest = planResetCountToday >= 3;
    out.push({
      day,
      type: "PLAN_RESET",
      priority: 5,
      reason: {
        code: "OVERLOAD_GUARD",
        detail: suggestRest
          ? "Multiple resets detected. A rest plan might be kinder today."
          : "Plan load is heavier than available time and energy.",
      },
      payload: suggestRest
        ? { mode: "rest", suggestedMinutes: 10 }
        : { mode: "reset", keepCount: 1 },
      status: "new",
      cooldownKey: "plan_reset",
    });
  }

  if (state.momentum === "stalled") {
    out.push({
      day,
      type: "TINY_WIN",
      priority: 3,
      reason: {
        code: "MOMENTUM_BUILDER",
        detail: "A small win can restart momentum.",
      },
      payload: { maxMinutes: 10 },
      status: "new",
      cooldownKey: "tiny_win",
    });
  }

  const hasWins = (state.completedTasksCount ?? 0) >= 2;
  const hasStability = stableDaysCount >= 2;
  const hasRoom = smallestPausedTask ? remainingRoomMin >= smallestPausedTask.estimateMin : false;
  const canGentleReturn =
    state.load !== "overloaded" && hasRoom && (hasStability || exitedRecoveryRecently || hasWins);
  if (canGentleReturn && smallestPausedTask) {
    const detail = hasStability
      ? "Steady for 2 days. Consider a gentle return for one small task."
      : exitedRecoveryRecently
        ? "Recovery just ended. Consider a gentle return for one small task."
        : hasWins
          ? "Momentum is back. Consider a gentle return for one small task."
          : "Room exists today. Consider a gentle return for one small task.";

    out.push({
      day,
      type: "GENTLE_RETURN",
      priority: 4,
      reason: {
        code: "GENTLE_RETURN",
        detail,
      },
      payload: {
        taskId: smallestPausedTask.taskId,
        title: smallestPausedTask.title,
        estimateMin: smallestPausedTask.estimateMin,
      },
      status: "new",
      cooldownKey: "gentle_return",
    });
  }

  out.push({
    day,
    type: "DAILY_REVIEW_QUESTION",
    priority: 2,
    reason: {
      code: "DAILY_REVIEW",
      detail: "Gentle reflection helps reset without shame.",
    },
    payload: {
      question: "What's one small thing that counted today?",
    },
    status: "new",
    cooldownKey: "daily_review",
  });

  const financialState = context?.financialState ?? state.financialState;
  if (financialState) {
    if (financialState.drift === "risk") {
      const overBy = financialState.monthlySpend - financialState.monthlyBudget;
      out.push({
        day,
        type: "BUDGET_WARNING",
        priority: 5,
        reason: {
          code: "OVER_BUDGET",
          detail: `You've gone $${overBy.toFixed(0)} over budget this month.`,
        },
        payload: {
          spent: financialState.monthlySpend,
          budget: financialState.monthlyBudget,
          overBy: overBy,
          categories: Array.from(financialState.byCategory.entries()),
        },
        status: "new",
        cooldownKey: "budget_warning",
      });
    } else if (financialState.drift === "watch") {
      const remaining = financialState.monthlyBudget - financialState.monthlySpend;
      const daysLeft =
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() -
        new Date().getDate();
      const dailyAllowance = remaining / Math.max(1, daysLeft);
      out.push({
        day,
        type: "BUDGET_WARNING",
        priority: 4,
        reason: {
          code: "APPROACHING_LIMIT",
          detail: `$${dailyAllowance.toFixed(0)} daily to stay on track.`,
        },
        payload: {
          spent: financialState.monthlySpend,
          budget: financialState.monthlyBudget,
          remaining,
          dailyAllowance,
        },
        status: "new",
        cooldownKey: "budget_warning",
      });
    }

    if (financialState.patterns.length > 0) {
      const pattern = financialState.patterns[0]!;
      if (pattern.type === "late_night" || pattern.type === "rapid_fire") {
        out.push({
          day,
          type: "SPENDING_ALERT",
          priority: 3,
          reason: {
            code: "SPENDING_PATTERN",
            detail: pattern.detail,
          },
          payload: {
            pattern: pattern.type,
            detail: pattern.detail,
          },
          status: "new",
          cooldownKey: "spending_alert",
        });
      }
    }

    if (financialState.disciplineScore < 60 && financialState.disciplineScore >= 40) {
      const potentialSavings = financialState.monthlySpend * 0.1;
      out.push({
        day,
        type: "MICRO_CORRECTION",
        priority: 2,
        reason: {
          code: "DISCIPLINE_OPPORTUNITY",
          detail: `Small changes could save ~$${potentialSavings.toFixed(0)}/month.`,
        },
        payload: {
          disciplineScore: financialState.disciplineScore,
          potentialSavings,
          suggestion: "Try one small swap this week - like bringing lunch one day.",
        },
        status: "new",
        cooldownKey: "micro_correction",
      });
    }
  }

  return applyBoundaryFilters(out, boundaries)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}

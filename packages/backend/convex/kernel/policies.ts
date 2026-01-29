import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";

type PolicyContext = {
  lastPlanResetAt?: number;
  planResetCountToday: number;
};

const PLAN_RESET_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export function runPolicies(state: LifeState, context?: PolicyContext): KernelSuggestion[] {
  const out: KernelSuggestion[] = [];
  const day = state.day;
  const lastPlanResetAt = context?.lastPlanResetAt ?? 0;
  const planResetCountToday = context?.planResetCountToday ?? 0;
  const resetCooldownActive = Date.now() - lastPlanResetAt < PLAN_RESET_COOLDOWN_MS;

  if (state.load === "overloaded" && !resetCooldownActive) {
    const suggestRest = planResetCountToday >= 3;
    out.push({
      day,
      type: "PLAN_RESET",
      priority: 5,
      reason: {
        code: "OVERLOAD_GUARD",
        detail: suggestRest
          ? "You've reset a few times. A rest plan might be kinder today."
          : "Your plan is heavier than your available time/energy.",
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
      priority: 4,
      reason: {
        code: "MOMENTUM_BUILDER",
        detail: "A small win can restart momentum.",
      },
      payload: { maxMinutes: 10 },
      status: "new",
      cooldownKey: "tiny_win",
    });
  }

  out.push({
    day,
    type: "DAILY_REVIEW_QUESTION",
    priority: 2,
    reason: {
      code: "DAILY_REVIEW",
      detail: "Gentle reflection helps you reset without shame.",
    },
    payload: { question: "What's one small thing you did today that counts?" },
    status: "new",
    cooldownKey: "daily_review",
  });

  return out.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

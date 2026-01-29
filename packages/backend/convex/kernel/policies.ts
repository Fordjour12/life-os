import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";

export function runPolicies(state: LifeState): KernelSuggestion[] {
  const out: KernelSuggestion[] = [];
  const day = state.day;

  if (state.load === "overloaded") {
    out.push({
      day,
      type: "PLAN_RESET",
      priority: 5,
      reason: {
        code: "OVERLOAD_GUARD",
        detail: "Your plan is heavier than your available time/energy.",
      },
      payload: { keepCount: 1 },
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

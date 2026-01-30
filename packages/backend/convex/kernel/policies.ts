import type { KernelSuggestion, LifeState } from "../../../../src/kernel/types";

type PolicyContext = {
  lastPlanResetAt?: number;
  planResetCountToday: number;
  smallestPausedTask?: { taskId: string; title: string; estimateMin: number };
  stableDaysCount: number;
  exitedRecoveryRecently: boolean;
  remainingRoomMin: number;
  tinyWinTask?: { taskId: string; title: string; estimateMin: number } | null;
};

const PLAN_RESET_COOLDOWN_MS = 6 * 60 * 60 * 1000;

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
        detail: "You’re in recovery mode. Let’s keep it gentle and protect momentum.",
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

    return out.slice(0, 1);
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
  const hasRoom = smallestPausedTask
    ? remainingRoomMin >= smallestPausedTask.estimateMin
    : false;
  const canGentleReturn =
    state.load !== "overloaded" && hasRoom && (hasStability || exitedRecoveryRecently || hasWins);
  if (canGentleReturn && smallestPausedTask) {
    const detail = hasStability
      ? "You've been steady for 2 days. Want to gently bring back one small task?"
      : exitedRecoveryRecently
        ? "You're out of recovery. Want to gently bring back one small task?"
        : hasWins
          ? "Nice—momentum is back. Want to gently bring back one small task?"
          : "You have room today. Want to gently bring back one small task?";
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
      detail: "Gentle reflection helps you reset without shame.",
    },
    payload: { question: "What's one small thing you did today that counts?" },
    status: "new",
    cooldownKey: "daily_review",
  });

  return out.sort((a, b) => b.priority - a.priority).slice(0, 3);
}

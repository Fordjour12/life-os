import type { FocusCapacity, KernelEvent, LifeMode, LifeState, LoadState, Momentum } from "./types";

const DEFAULT_FREE_MINUTES = 240;

export function computeDailyState(
  day: string,
  events: KernelEvent[],
  options?: {
    freeMinutes?: number;
    effectiveFreeMinutes?: number;
    focusMinutes?: number;
    busyMinutes?: number;
  },
): LifeState {
  let completed = 0;
  let completedTasksCount = 0;
  let planned = 0;
  let latestPlanVersion = -1;
  let latestPlanTs = 0;
  let hadPlanReset = false;

  for (const event of events) {
    if (event.type === "TASK_COMPLETED") {
      completed += event.meta.estimateMin;
      completedTasksCount += 1;
    }
    if (event.type === "PLAN_SET" && event.meta.day === day) {
      const version = Number(event.meta.version ?? 0);
      const shouldReplace =
        version > latestPlanVersion || (version === latestPlanVersion && event.ts > latestPlanTs);
      if (shouldReplace) {
        latestPlanVersion = version;
        latestPlanTs = event.ts;
        planned = Array.isArray(event.meta.focusItems)
          ? event.meta.focusItems.reduce(
              (sum: number, item: { estimatedMinutes?: number }) =>
                sum + (Number(item.estimatedMinutes) || 0),
              0,
            )
          : (event.meta.plannedMinutes ?? planned);
      }
      if (event.meta.reason === "reset" || event.meta.reason === "recovery") {
        hadPlanReset = true;
      }
    }
    if (event.type === "PLAN_RESET_APPLIED") {
      hadPlanReset = true;
    }
  }

  const freeMinutes = Number.isFinite(options?.freeMinutes)
    ? Math.max(0, Number(options?.freeMinutes))
    : DEFAULT_FREE_MINUTES;
  const effectiveFreeMinutes = Number.isFinite(options?.effectiveFreeMinutes)
    ? Math.max(0, Number(options?.effectiveFreeMinutes))
    : freeMinutes;
  const focusMinutes = Number.isFinite(options?.focusMinutes)
    ? Math.max(0, Number(options?.focusMinutes))
    : 0;
  const busyMinutes = Number.isFinite(options?.busyMinutes)
    ? Math.max(0, Number(options?.busyMinutes))
    : 0;
  const ratio = planned / Math.max(1, effectiveFreeMinutes);

  let load: LoadState = "balanced";
  if (ratio < 0.7) load = "underloaded";
  else if (ratio > 1.05) load = "overloaded";

  let momentum: Momentum = "stalled";
  if (completed >= 25 && completed < 75) momentum = "steady";
  if (completed >= 75) momentum = "strong";

  let focusCapacity: FocusCapacity = "medium";
  if (load === "overloaded" && completed < 25) focusCapacity = "low";
  if (completed >= 75) focusCapacity = "high";

  let stabilityScore = 50;
  if (load === "balanced") stabilityScore += 20;
  if (completedTasksCount >= 1) stabilityScore += 15;
  if (focusCapacity === "medium" || focusCapacity === "high") stabilityScore += 15;
  if (load === "overloaded") stabilityScore -= 20;
  stabilityScore = Math.max(0, Math.min(100, stabilityScore));

  let mode: LifeMode = "maintain";
  const reasons: LifeState["reasons"] = [];

  if (load === "overloaded" && focusCapacity === "low") {
    mode = "recovery";
    reasons.push({
      code: "MODE_TO_RECOVERY",
      detail: "Overloaded plan + low capacity signals",
    });
  }

  if (load === "overloaded")
    reasons.push({
      code: "OVERLOAD",
      detail: "Planned time exceeds available time",
    });
  if (momentum === "stalled")
    reasons.push({
      code: "MOMENTUM_LOW",
      detail: "No meaningful progress detected yet",
    });
  if (hadPlanReset)
    reasons.push({
      code: "PLAN_RESET",
      detail: "Plan was softened to protect recovery and momentum.",
    });

  return {
    day,
    mode,
    plannedMinutes: planned,
    completedMinutes: completed,
    completedTasksCount,
    stabilityScore,
    freeMinutes,
    effectiveFreeMinutes,
    focusMinutes,
    busyMinutes,
    load,
    momentum,
    focusCapacity,
    habitHealth: "stable",
    financialDrift: "ok",
    backlogPressure: 0,
    reasons,
  };
}

import type {
  FocusCapacity,
  KernelEvent,
  LifeMode,
  LifeState,
  LoadState,
  Momentum,
} from "../../../../src/kernel/types";

const DEFAULT_FREE_MINUTES = 240;

export function computeDailyState(day: string, events: KernelEvent[]): LifeState {
  let completed = 0;
  let planned = 0;
  let latestPlanVersion = -1;
  let latestPlanTs = 0;
  let hadPlanReset = false;

  for (const event of events) {
    if (event.type === "TASK_COMPLETED") completed += event.meta.estimateMin;
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

  const freeMinutes = DEFAULT_FREE_MINUTES;
  const ratio = planned / Math.max(1, freeMinutes);

  let load: LoadState = "balanced";
  if (ratio < 0.7) load = "underloaded";
  else if (ratio > 1.05) load = "overloaded";

  let momentum: Momentum = "stalled";
  if (completed >= 25 && completed < 75) momentum = "steady";
  if (completed >= 75) momentum = "strong";

  let focusCapacity: FocusCapacity = "medium";
  if (load === "overloaded" && completed < 25) focusCapacity = "low";
  if (completed >= 75) focusCapacity = "high";

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
    freeMinutes,
    load,
    momentum,
    focusCapacity,
    reasons,
  };
}

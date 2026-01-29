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

  for (const event of events) {
    if (event.type === "TASK_CREATED") planned += event.meta.estimateMin;
    if (event.type === "TASK_COMPLETED") completed += event.meta.estimateMin;
    if (event.type === "PLAN_SET") planned = event.meta.plannedMinutes ?? planned;
    if (event.type === "PLAN_RESET_APPLIED") planned = event.meta.plannedMinutes;
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

import type {
  FocusCapacity,
  KernelEvent,
  LifeMode,
  LifeState,
  LoadState,
  Momentum,
  FinancialDrift,
  SpendingPattern,
  FinancialState,
} from "./types";

const DEFAULT_FREE_MINUTES = 240;

function computeFinancialState(
  events: KernelEvent[],
  budgets: Map<string, number> = new Map(),
  now: number = Date.now(),
): { drift: FinancialDrift; financialState: FinancialState } {
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartTs = monthStart.getTime();

  const monthEvents = events.filter((e) => e.type === "EXPENSE_ADDED" && e.ts >= monthStartTs);

  const byCategory = new Map<string, number>();
  let totalSpent = 0;

  for (const event of monthEvents) {
    if (event.type !== "EXPENSE_ADDED") continue;
    const meta = event.meta as { amount: number; category: string };
    const category = meta.category || "other";
    const current = byCategory.get(category) || 0;
    byCategory.set(category, current + meta.amount);
    totalSpent += meta.amount;
  }

  const totalBudget = Array.from(budgets.values()).reduce((a, b) => a + b, 0);
  const nowDate = new Date(now);
  const daysInMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
  const dayOfMonth = nowDate.getDate();
  const dailyAverage = totalSpent / Math.max(1, dayOfMonth);
  const projectedTotal = dailyAverage * daysInMonth;

  let drift: FinancialDrift = "ok";
  if (totalBudget > 0) {
    const spentRatio = totalSpent / totalBudget;
    if (spentRatio > 1) drift = "risk";
    else if (spentRatio >= 0.8) drift = "watch";
  }

  const patterns: SpendingPattern[] = [];
  const recentEvents = monthEvents.filter((e) => e.ts >= now - 7 * 24 * 60 * 60 * 1000);
  const categoryTotals = new Map<string, number>();
  for (const event of recentEvents) {
    if (event.type !== "EXPENSE_ADDED") continue;
    const meta = event.meta as { amount: number; category: string };
    const cat = meta.category || "other";
    categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + meta.amount);
  }

  for (const [cat, spent] of categoryTotals) {
    const budget = budgets.get(cat) || totalBudget / Math.max(1, budgets.size) || 500;
    if (spent > budget * 0.5 && budget > 0) {
      patterns.push({
        type: "spike",
        category: cat,
        detail: `High spending in ${cat} this week`,
      });
    }
  }

  const lateNightEvents = monthEvents.filter((e) => {
    const hour = new Date(e.ts).getHours();
    return e.type === "EXPENSE_ADDED" && (hour >= 23 || hour <= 4);
  });
  if (lateNightEvents.length >= 2) {
    patterns.push({
      type: "late_night",
      detail: `${lateNightEvents.length} late-night transactions this month`,
    });
  }

  const today = new Date(now).toDateString();
  const todayEvents = monthEvents.filter((e) => new Date(e.ts).toDateString() === today);
  if (todayEvents.length >= 3) {
    patterns.push({
      type: "rapid_fire",
      detail: `${todayEvents.length} purchases today`,
    });
  }

  let disciplineScore = 50;
  if (totalBudget > 0) {
    const budgetAdherence = Math.max(0, 1 - totalSpent / totalBudget);
    const consistency = Math.min(1, monthEvents.length / 10);
    const trendVal = projectedTotal <= totalBudget ? 1 : 0;
    disciplineScore = Math.round(budgetAdherence * 40 + consistency * 30 + trendVal * 30);
  }

  let trend: "improving" | "stable" | "worsening" = "stable";
  if (totalBudget > 0 && totalSpent > 0) {
    const projectedRatio = projectedTotal / totalBudget;
    const currentRatio = totalSpent / totalBudget;
    if (currentRatio < 0.7 && projectedRatio < currentRatio + 0.1) trend = "improving";
    else if (projectedRatio > 1.2) trend = "worsening";
  }

  return {
    drift,
    financialState: {
      drift,
      disciplineScore,
      monthlySpend: totalSpent,
      monthlyBudget: totalBudget,
      dailyAverage,
      trend,
      patterns,
      byCategory,
    },
  };
}

export function computeDailyState(
  day: string,
  events: KernelEvent[],
  options?: {
    freeMinutes?: number;
    effectiveFreeMinutes?: number;
    focusMinutes?: number;
    busyMinutes?: number;
    budgets?: Map<string, number>;
    monthStartTs?: number;
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

  const budgets = options?.budgets || new Map();
  const { drift, financialState } = computeFinancialState(events, budgets);

  if (drift === "watch") {
    reasons.push({
      code: "FINANCIAL_WATCH",
      detail: "Approaching budget limit",
    });
  }
  if (drift === "risk") {
    reasons.push({
      code: "FINANCIAL_RISK",
      detail: "Over budget - review spending",
    });
  }

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
    financialDrift: drift,
    financialState,
    backlogPressure: 0,
    reasons,
  };
}

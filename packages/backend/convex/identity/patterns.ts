import { v } from "convex/values";

import { query } from "../_generated/server";
import { isSafeCopy } from "./guardrails";

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

type WindowKey = "week" | "month";

type PatternInsight = {
  id: string;
  window: WindowKey;
  signal: string;
  observation: string;
  confidence: "low" | "medium";
  evidenceCount: number;
};

type DriftSignal = {
  id: string;
  type: "CHAOS" | "OVERLOAD_LOOP" | "AVOIDANCE";
  observation: string;
  suggestion?: string;
};

type LifeStateLike = {
  mode?: string;
  load?: string;
  momentum?: string;
};

function getUserId(): string {
  return "user_me";
}

function formatYYYYMMDD(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getWindowRange(window: WindowKey) {
  const days = window === "month" ? 30 : 7;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - (days - 1));
  return {
    startDay: formatYYYYMMDD(start),
    endDay: formatYYYYMMDD(end),
    startTs: start.getTime(),
    endTs: end.getTime() + MILLISECONDS_IN_DAY,
  };
}

function getDayFromTs(ts: number) {
  return formatYYYYMMDD(new Date(ts));
}

function getLoad(state: LifeStateLike | null | undefined) {
  if (!state || typeof state !== "object") return null;
  const load = state.load;
  return load === "balanced" || load === "overloaded" || load === "underloaded" ? load : null;
}

function getMomentum(state: LifeStateLike | null | undefined) {
  if (!state || typeof state !== "object") return null;
  const momentum = state.momentum;
  return momentum === "stalled" || momentum === "steady" || momentum === "strong" ? momentum : null;
}

function clampInsights(items: PatternInsight[]) {
  return items.slice(0, 3);
}

function clampSignals(items: DriftSignal[]) {
  return items.slice(0, 3);
}

function isSafeInsight(item: PatternInsight) {
  return isSafeCopy(item.observation);
}

function isSafeSignal(item: DriftSignal) {
  if (!isSafeCopy(item.observation)) return false;
  if (item.suggestion && !isSafeCopy(item.suggestion)) return false;
  return true;
}

export const getPatternInsights = query({
  args: {
    window: v.optional(v.union(v.literal("week"), v.literal("month"))),
  },
  handler: async (ctx, { window }) => {
    const userId = getUserId();
    const windowKey = window ?? "week";
    const { startDay, endDay, startTs, endTs } = getWindowRange(windowKey);

    const stateDocs = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const windowStates = stateDocs
      .filter((entry) => entry.day >= startDay && entry.day <= endDay)
      .map((entry) => ({ day: entry.day, state: entry.state as LifeStateLike }));

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const windowEvents = events.filter((event) => event.ts >= startTs && event.ts < endTs);

    const completionsByDay = new Map<string, number>();
    const tinyWinsByDay = new Map<string, number>();
    for (const event of windowEvents) {
      if (event.type !== "TASK_COMPLETED") continue;
      const estimateMin = Number((event.meta as { estimateMin?: number })?.estimateMin ?? 0);
      const day = getDayFromTs(event.ts);
      completionsByDay.set(day, (completionsByDay.get(day) ?? 0) + 1);
      if (Number.isFinite(estimateMin) && estimateMin <= 10) {
        tinyWinsByDay.set(day, (tinyWinsByDay.get(day) ?? 0) + 1);
      }
    }

    let overloadedDays = 0;
    let balancedDays = 0;
    let overloadedCompletions = 0;
    let balancedCompletions = 0;

    for (const entry of windowStates) {
      const load = getLoad(entry.state);
      const completed = completionsByDay.get(entry.day) ?? 0;
      if (load === "overloaded") {
        overloadedDays += 1;
        overloadedCompletions += completed;
      }
      if (load === "balanced") {
        balancedDays += 1;
        balancedCompletions += completed;
      }
    }

    const insights: PatternInsight[] = [];

    if (overloadedDays >= 2 && balancedDays >= 2) {
      const overloadedAvg = overloadedCompletions / overloadedDays;
      const balancedAvg = balancedCompletions / balancedDays;
      if (balancedAvg - overloadedAvg >= 0.5) {
        const confidence = balancedAvg - overloadedAvg >= 1 ? "medium" : "low";
        insights.push({
          id: `overload-completion-${windowKey}`,
          window: windowKey,
          signal: "overload_completion_gap",
          observation: "Tasks were harder to complete on overloaded days.",
          confidence,
          evidenceCount: overloadedDays,
        });
      }
    }

    const sortedStates = [...windowStates].sort((a, b) => a.day.localeCompare(b.day));
    const stateByDay = new Map(sortedStates.map((entry) => [entry.day, entry.state]));
    let recoveryLift = 0;
    for (let index = 0; index < sortedStates.length - 1; index += 1) {
      const current = sortedStates[index];
      const next = sortedStates[index + 1];
      if (!current || !next) continue;
      if (current.state?.mode === "recovery" && getMomentum(next.state) !== "stalled") {
        recoveryLift += 1;
      }
    }
    if (recoveryLift >= 2) {
      insights.push({
        id: `recovery-lift-${windowKey}`,
        window: windowKey,
        signal: "recovery_momentum_lift",
        observation: "Momentum tended to return after recovery days.",
        confidence: "low",
        evidenceCount: recoveryLift,
      });
    }

    const tinyWinDays = [...tinyWinsByDay.keys()].sort();
    let tinyWinLift = 0;
    for (const day of tinyWinDays) {
      const nextDay = formatYYYYMMDD(
        new Date(new Date(`${day}T00:00:00Z`).getTime() + MILLISECONDS_IN_DAY),
      );
      const nextState = stateByDay.get(nextDay);
      if (nextState && getMomentum(nextState) && getMomentum(nextState) !== "stalled") {
        tinyWinLift += 1;
      }
    }
    if (tinyWinLift >= 2) {
      insights.push({
        id: `tinywin-lift-${windowKey}`,
        window: windowKey,
        signal: "tinywin_momentum_lift",
        observation: "Momentum often lifted after small wins.",
        confidence: "low",
        evidenceCount: tinyWinLift,
      });
    }

    return clampInsights(insights.filter(isSafeInsight));
  },
});

export const getDriftSignals = query({
  args: {
    window: v.optional(v.union(v.literal("week"), v.literal("month"))),
  },
  handler: async (ctx, { window }) => {
    const userId = getUserId();
    const windowKey = window ?? "month";
    const { startDay, endDay, startTs, endTs } = getWindowRange(windowKey);

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const windowEvents = events.filter((event) => event.ts >= startTs && event.ts < endTs);

    const lateNightDays = new Set<string>();
    for (const event of windowEvents) {
      const hour = new Date(event.ts).getUTCHours();
      if (hour >= 23 || hour <= 4) {
        lateNightDays.add(getDayFromTs(event.ts));
      }
    }

    const planResets = windowEvents.filter((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    }).length;

    const tinyWins = windowEvents.filter((event) => {
      if (event.type !== "TASK_COMPLETED") return false;
      const estimateMin = Number((event.meta as { estimateMin?: number })?.estimateMin ?? 0);
      return Number.isFinite(estimateMin) && estimateMin <= 10;
    }).length;

    const gentleReturns = windowEvents.filter((event) => {
      if (event.type !== "TASK_RESUMED") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "gentle_return";
    }).length;

    const stateDocs = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const windowStates = stateDocs
      .filter((entry) => entry.day >= startDay && entry.day <= endDay)
      .map((entry) => ({ day: entry.day, state: entry.state as LifeStateLike }));
    const stateByDay = new Map(windowStates.map((entry) => [entry.day, entry.state]));

    const overloadedDays = windowStates.filter(
      (entry) => getLoad(entry.state) === "overloaded",
    ).length;

    const journalEntries = await ctx.db
      .query("journalEntries")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();

    const windowEntries = journalEntries.filter(
      (entry) => entry.createdAt >= startTs && entry.createdAt < endTs,
    );

    const clutterWords = ["messy", "dirty", "chaos", "clutter", "pile", "overwhelmed"];
    let clutterMentions = 0;
    for (const entry of windowEntries) {
      const text = entry.text?.toLowerCase();
      if (!text) continue;
      if (clutterWords.some((word) => text.includes(word))) {
        clutterMentions += 1;
      }
    }

    const signals: DriftSignal[] = [];

    if (lateNightDays.size >= 3) {
      signals.push({
        id: `late-night-${windowKey}`,
        type: "CHAOS",
        observation: `Late-night activity showed up on ${lateNightDays.size} days.`,
        suggestion: "Would you like to protect one shutdown boundary this week?",
      });
    }

    if (planResets >= 2 && overloadedDays >= 3) {
      signals.push({
        id: `overload-loop-${windowKey}`,
        type: "OVERLOAD_LOOP",
        observation: "Overload and resets have been repeating in this window.",
        suggestion: "Would you like to protect one boundary for the next week?",
      });
    }

    const completionDays = windowEvents
      .filter((event) => event.type === "TASK_COMPLETED")
      .map((event) => getDayFromTs(event.ts))
      .sort();
    let gapOverloadCount = 0;
    for (let index = 1; index < completionDays.length; index += 1) {
      const prev = completionDays[index - 1];
      const next = completionDays[index];
      if (!prev || !next) continue;
      const gapMs =
        new Date(`${next}T00:00:00Z`).getTime() - new Date(`${prev}T00:00:00Z`).getTime();
      const gapDays = Math.floor(gapMs / MILLISECONDS_IN_DAY);
      if (gapDays >= 3) {
        const nextState = stateByDay.get(next);
        if (getLoad(nextState) === "overloaded") {
          gapOverloadCount += 1;
        }
      }
    }
    if (gapOverloadCount >= 1) {
      signals.push({
        id: `gap-overload-${windowKey}`,
        type: "OVERLOAD_LOOP",
        observation: "Long gaps were followed by overloaded days.",
        suggestion: "Would you like a softer re-entry after quiet gaps?",
      });
    }

    if (tinyWins >= 5 && gentleReturns === 0) {
      signals.push({
        id: `tinywins-no-returns-${windowKey}`,
        type: "AVOIDANCE",
        observation: "Small wins showed up without any gentle returns.",
        suggestion: "Would one gentle return make the week feel lighter?",
      });
    }

    if (clutterMentions >= 2) {
      signals.push({
        id: `clutter-language-${windowKey}`,
        type: "AVOIDANCE",
        observation: "Clutter language showed up in journal notes.",
        suggestion: "Would you like a single tiny reset this week?",
      });
    }

    return clampSignals(signals.filter(isSafeSignal));
  },
});

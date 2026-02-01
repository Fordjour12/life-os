import { v } from "convex/values";

import type { LifeState } from "../../../../src/kernel/types";
import { api } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import { filterSafeStrings, isSafeCopy } from "./guardrails";

const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

function formatYYYYMMDD(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getISOWeekIdFromDate(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const year = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / MILLISECONDS_IN_DAY + 1) / 7);
  return `${year}-${String(week).padStart(2, "0")}`;
}

function getISOWeekStartDate(weekId: string): Date {
  const [yearPart, weekPart] = weekId.split("-");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    throw new Error("Week must be YYYY-WW");
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const weekStart = new Date(week1Monday);
  weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

function getDefaultWeekId(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return getISOWeekIdFromDate(date);
}

const allowedMomenta = new Set(["stalled", "steady", "strong"]);

function getMomentum(state: LifeState | null | undefined): LifeState["momentum"] | null {
  if (!state || typeof state !== "object") return null;
  const momentum = (state as LifeState).momentum;
  return allowedMomenta.has(momentum) ? momentum : null;
}

function getLoad(state: LifeState | null | undefined): LifeState["load"] | null {
  if (!state || typeof state !== "object") return null;
  const load = (state as LifeState).load;
  return load === "balanced" || load === "overloaded" || load === "underloaded" ? load : null;
}

export const generateWeeklyReview = mutation({
  args: {
    week: v.optional(v.string()),
  },
  handler: async (ctx, { week }) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;
    const weekId = week ?? getDefaultWeekId();
    if (!/^\d{4}-\d{2}$/.test(weekId)) {
      throw new Error("Week must be YYYY-WW");
    }

    const weekStart = getISOWeekStartDate(weekId);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setUTCDate(weekStart.getUTCDate() + 7);

    const startDay = formatYYYYMMDD(weekStart);
    const endDay = formatYYYYMMDD(new Date(weekEndExclusive.getTime() - MILLISECONDS_IN_DAY));

    const stateDocs = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const weekStates = stateDocs
      .filter((entry) => entry.day >= startDay && entry.day <= endDay)
      .map((entry) => ({ day: entry.day, state: entry.state as LifeState }));

    const recoveryDays = weekStates.filter((entry) => entry.state?.mode === "recovery").length;
    const balancedDays = weekStates.filter((entry) => getLoad(entry.state) === "balanced").length;

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const weekEvents = events.filter(
      (event) => event.ts >= weekStart.getTime() && event.ts < weekEndExclusive.getTime(),
    );

    const tinyWins = weekEvents.filter((event) => {
      if (event.type !== "TASK_COMPLETED") return false;
      const estimateMin = Number((event.meta as { estimateMin?: number })?.estimateMin ?? 0);
      return Number.isFinite(estimateMin) && estimateMin <= 10;
    }).length;

    const planResets = weekEvents.filter((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    }).length;

    const plannedDays = weekStates.filter((entry) => (entry.state?.plannedMinutes ?? 0) > 0);
    const onTrackDays = plannedDays.filter((entry) => {
      const planned = entry.state?.plannedMinutes ?? 0;
      const completed = entry.state?.completedMinutes ?? 0;
      if (planned <= 0) return false;
      return completed >= planned * 0.8;
    }).length;
    const plannedDaysCount = plannedDays.length;
    const onTrackRatio = plannedDaysCount > 0 ? onTrackDays / plannedDaysCount : 0;

    const highlights: string[] = [];

    const sortedStates = [...weekStates].sort((a, b) => a.day.localeCompare(b.day));
    let momentumLift = 0;
    for (let index = 1; index < sortedStates.length; index += 1) {
      const prev = sortedStates[index - 1]?.state;
      const next = sortedStates[index]?.state;
      if (getMomentum(prev) === "stalled" && getMomentum(next) && getMomentum(next) !== "stalled") {
        momentumLift += 1;
      }
    }
    if (momentumLift > 0) {
      highlights.push("Momentum tended to return after small wins.");
    }

    const restCount = weekEvents.filter((event) => {
      if (event.type === "REST_ACCEPTED") return true;
      if (event.type !== "RECOVERY_PROTOCOL_USED") return false;
      return Boolean((event.meta as { didRest?: boolean })?.didRest);
    }).length;
    if (restCount > 0) {
      highlights.push("Rest days were followed by steadier momentum.");
    }

    const gentleReturns = weekEvents.filter((event) => {
      if (event.type !== "TASK_RESUMED") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "gentle_return";
    }).length;
    if (gentleReturns > 0) {
      highlights.push("Gentle returns helped re-enter paused tasks.");
    }
    if (plannedDaysCount >= 2 && onTrackRatio >= 0.7) {
      highlights.push("Planned focus mostly matched completed effort.");
    }

    const frictionPoints: string[] = [];
    const overloadedDays = weekStates.filter(
      (entry) => getLoad(entry.state) === "overloaded",
    ).length;
    if (overloadedDays > 0) {
      frictionPoints.push(
        `Overload showed up on ${overloadedDays} day${overloadedDays === 1 ? "" : "s"}.`,
      );
    }
    if (planResets > 0) {
      frictionPoints.push("Plan resets were used to protect capacity.");
    }
    if (plannedDaysCount >= 2 && onTrackRatio <= 0.3) {
      frictionPoints.push("Planned focus often exceeded what was completed.");
    }

    const reflectionQuestion = "What would you like to protect next week?";

    const safeHighlights = filterSafeStrings(highlights).slice(0, 2);
    const safeFriction = filterSafeStrings(frictionPoints);
    const safeQuestion = isSafeCopy(reflectionQuestion)
      ? reflectionQuestion
      : "What would you like to protect next week?";

    const facts = {
      recoveryDays,
      balancedDays,
      tinyWins,
      planResets,
    };

    const existing = await ctx.db
      .query("weeklyReviews")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("week", weekId))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        facts,
        highlights: safeHighlights,
        frictionPoints: safeFriction,
        reflectionQuestion: safeQuestion,
        createdAt: now,
      });
      return { ok: true, week: weekId, updated: true };
    }

    await ctx.db.insert("weeklyReviews", {
      userId,
      week: weekId,
      facts,
      highlights: safeHighlights,
      frictionPoints: safeFriction,
      reflectionQuestion: safeQuestion,
      createdAt: now,
    });

    return { ok: true, week: weekId, created: true };
  },
});

export const getWeeklyReview = query({
  args: {
    week: v.optional(v.string()),
  },
  handler: async (ctx, { week }) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;
    if (week) {
      return ctx.db
        .query("weeklyReviews")
        .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("week", week))
        .first();
    }

    const all = await ctx.db
      .query("weeklyReviews")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();

    return all.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  },
});

import { v } from "convex/values";

import type { KernelEvent } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import { mutation } from "../_generated/server";

import { runPolicies } from "./policies";
import { computeDailyState } from "./reducer";

function getUserId(): string {
  return "user_me";
}

export const applyPlanReset = mutation({
  args: {
    day: v.string(),
    keepCount: v.optional(v.union(v.literal(1), v.literal(2))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, { day, keepCount, idempotencyKey }) => {
    const userId = getUserId();
    const now = Date.now();
    const keepN = keepCount ?? 1;

    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) =>
        q.eq("userId", userId).eq("idempotencyKey", idempotencyKey),
      )
      .first();

    if (existing) {
      return { ok: true, deduped: true };
    }

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const sorted = [...activeTasks].sort((a, b) => {
      if (a.estimateMin !== b.estimateMin) return a.estimateMin - b.estimateMin;
      return (a.priority ?? 2) - (b.priority ?? 2);
    });

    const kept = sorted.slice(0, keepN);
    const paused = sorted.slice(keepN);

    for (const task of paused) {
      await ctx.db.patch(task._id, {
        status: "paused",
        pausedAt: now,
        pauseReason: "plan_reset",
      });

      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "TASK_PAUSED",
        meta: { taskId: task._id, reason: "plan_reset" },
        idempotencyKey: `${idempotencyKey}:pause:${task._id}`,
      });
    }

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "PLAN_RESET_APPLIED",
      meta: {
        day,
        keptTaskIds: kept.map((task) => task._id),
        pausedTaskIds: paused.map((task) => task._id),
      },
      idempotencyKey,
    });

    const dayEvents = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const kernelEvents = dayEvents.map((event) => ({
      type: event.type as KernelEvent["type"],
      ts: event.ts,
      meta: event.meta,
    })) as KernelEvent[];

    const state = computeDailyState(day, kernelEvents);

    const existingState = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    if (existingState) {
      await ctx.db.patch(existingState._id, { state, updatedAt: now });
    } else {
      await ctx.db.insert("stateDaily", { userId, day, state, updatedAt: now });
    }

    const suggestions = runPolicies(state);

    const existingSugs = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    for (const suggestion of existingSugs) {
      if (suggestion.status === "new") {
        await ctx.db.patch(suggestion._id, { status: "expired", updatedAt: now });
      }
    }

    for (const suggestion of suggestions) {
      await ctx.db.insert("suggestions", {
        userId,
        day: suggestion.day,
        type: suggestion.type,
        priority: suggestion.priority,
        reason: suggestion.reason,
        payload: suggestion.payload,
        status: suggestion.status,
        cooldownKey: suggestion.cooldownKey,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      ok: true,
      keptTaskIds: kept.map((task) => task._id as Id<"tasks">),
      pausedTaskIds: paused.map((task) => task._id as Id<"tasks">),
    };
  },
});

import { v } from "convex/values";

import { mutation } from "../_generated/server";

function getUserId(): string {
  return "user_me";
}

export const resumeTask = mutation({
  args: {
    taskId: v.id("tasks"),
    reason: v.optional(v.union(v.literal("manual"), v.literal("gentle_return"))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, { taskId, reason, idempotencyKey }) => {
    const userId = getUserId();
    const now = Date.now();
    const why = reason ?? "manual";

    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) => q.eq("userId", userId).eq("idempotencyKey", idempotencyKey))
      .first();

    if (existing) {
      return { ok: true, deduped: true };
    }

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    if (task.status !== "paused") {
      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "TASK_RESUMED",
        meta: { taskId, reason: why },
        idempotencyKey,
      });
      return { ok: true, already: true };
    }

    await ctx.db.patch(taskId, {
      status: "active",
      pausedAt: undefined,
      pauseReason: undefined,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "TASK_RESUMED",
      meta: { taskId, reason: why },
      idempotencyKey,
    });

    return { ok: true };
  },
});

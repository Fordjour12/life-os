import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { mutation } from "../_generated/server";
import { requireAuthUser } from "../auth";

export const createTask = mutation({
  args: {
    title: v.string(),
    estimateMin: v.number(),
    priority: v.number(),
    notes: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const now = Date.now();
    const title = args.title.trim();

    if (!title) {
      throw new Error("Task title is required");
    }

    if (!Number.isFinite(args.estimateMin) || args.estimateMin <= 0) {
      throw new Error("Task estimate must be a positive number");
    }

    if (![1, 2, 3].includes(args.priority)) {
      throw new Error("Task priority must be 1, 2, or 3");
    }

    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) =>
        q.eq("userId", userId).eq("idempotencyKey", args.idempotencyKey),
      )
      .first();

    if (existing) {
      const existingTaskId = (existing.meta as { taskId?: Id<"tasks"> }).taskId;
      if (existingTaskId) {
        return { taskId: existingTaskId, deduped: true };
      }
      throw new Error("Idempotency key already used");
    }

    const taskId = await ctx.db.insert("tasks", {
      userId,
      title,
      notes: args.notes,
      estimateMin: args.estimateMin,
      priority: args.priority,
      status: "active",
      createdAt: now,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "TASK_CREATED",
      meta: { taskId, estimateMin: args.estimateMin },
      idempotencyKey: args.idempotencyKey,
    });

    return { taskId };
  },
});

export const completeTask = mutation({
  args: {
    taskId: v.id("tasks"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, { taskId, idempotencyKey }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const now = Date.now();

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

    if (task.status === "completed") {
      return { ok: true };
    }

    await ctx.db.patch(taskId, {
      status: "completed",
      completedAt: now,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "TASK_COMPLETED",
      meta: { taskId, estimateMin: task.estimateMin },
      idempotencyKey,
    });

    return { ok: true };
  },
});

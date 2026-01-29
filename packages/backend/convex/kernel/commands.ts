import { v } from "convex/values";

import type { KernelEvent } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";

import { computeDailyState } from "./reducer";
import { runPolicies } from "./policies";

function getTodayYYYYMMDD() {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getUserId(): string {
  return "user_me";
}

export const executeCommand = mutation({
  args: {
    command: v.any(),
  },
  handler: async (ctx, { command }) => {
    const userId = getUserId();
    const now = Date.now();

    if (!command?.cmd || !command?.input || !command?.idempotencyKey) {
      throw new Error("Invalid command shape");
    }

    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) =>
        q.eq("userId", userId).eq("idempotencyKey", command.idempotencyKey),
      )
      .first();
    if (existing) {
      return { ok: true, deduped: true };
    }

    let eventType = "";
    let meta: Record<string, unknown> = {};
    let day = getTodayYYYYMMDD();

    if (command.cmd === "create_task") {
      const title = String(command.input.title ?? "").trim();
      const estimateMin = Number(command.input.estimateMin ?? 0);
      const priority = Number(command.input.priority ?? 2);
      const notes = command.input.notes ? String(command.input.notes) : undefined;

      if (!title) {
        throw new Error("Task title is required");
      }

      if (!Number.isFinite(estimateMin) || estimateMin <= 0) {
        throw new Error("Task estimate must be a positive number");
      }

      if (![1, 2, 3].includes(priority)) {
        throw new Error("Task priority must be 1, 2, or 3");
      }

      const taskId = await ctx.db.insert("tasks", {
        userId,
        title,
        notes,
        estimateMin,
        priority,
        status: "active",
        createdAt: now,
      });

      eventType = "TASK_CREATED";
      meta = { taskId, estimateMin };
    } else if (command.cmd === "complete_task") {
      const taskId = command.input.taskId as Id<"tasks">;
      const task = await ctx.db.get(taskId);

      if (!task || task.userId !== userId) {
        throw new Error("Task not found");
      }

      if (task.status === "completed") {
        return { ok: true, alreadyCompleted: true };
      }

      await ctx.db.patch(taskId, {
        status: "completed",
        completedAt: now,
      });

      eventType = "TASK_COMPLETED";
      meta = { taskId, estimateMin: task.estimateMin };
    } else if (command.cmd === "set_daily_plan") {
      const top3TaskIds = command.input.top3TaskIds as string[];
      const plannedTasks = await Promise.all(
        top3TaskIds.map(async (taskId) => ctx.db.get(taskId as Id<"tasks">)),
      );
      for (const task of plannedTasks) {
        if (!task || task.userId !== userId) {
          throw new Error("Task not found for daily plan");
        }
      }
      const plannedMinutes = plannedTasks.reduce(
        (total, task) => total + (task?.estimateMin ?? 0),
        0,
      );

      eventType = "PLAN_SET";
      meta = { day: command.input.day, top3TaskIds, plannedMinutes };
      day = command.input.day;
    } else if (command.cmd === "submit_feedback") {
      eventType = "SUGGESTION_FEEDBACK";
      meta = {
        suggestionId: command.input.suggestionId,
        vote: command.input.vote,
      };
    } else {
      throw new Error("Unknown command");
    }

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: eventType,
      meta,
      idempotencyKey: command.idempotencyKey,
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

    return { ok: true, state, suggestionsCount: suggestions.length };
  },
});

export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const userId = getUserId();
    const day = getTodayYYYYMMDD();

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    return {
      day,
      state: stateDoc?.state ?? null,
      suggestions: suggestions
        .filter((suggestion) => suggestion.status === "new")
        .sort((a, b) => b.priority - a.priority),
    };
  },
});

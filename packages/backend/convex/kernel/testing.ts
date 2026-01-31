import { mutation } from "../_generated/server";
import { v } from "convex/values";

function getUserId(): string {
  return "user_me";
}

function isTestTitle(title?: string) {
  return Boolean(title && title.startsWith("[TEST]"));
}

export const clearTestData = mutation({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();

    const blocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();
    const testBlocks = blocks.filter((block) => isTestTitle(block.title));

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();
    const testTasks = tasks.filter((task) => isTestTitle(task.title));

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const testTaskIds = new Set(testTasks.map((task) => String(task._id)));
    const testBlockIds = new Set(testBlocks.map((block) => String(block._id)));

    const testEvents = events.filter((event) => {
      if (event.type === "TASK_CREATED" || event.type === "TASK_COMPLETED") {
        const taskId = String((event.meta as { taskId?: string })?.taskId ?? "");
        return testTaskIds.has(taskId);
      }
      if (event.type === "TASK_PAUSED" || event.type === "TASK_RESUMED") {
        const taskId = String((event.meta as { taskId?: string })?.taskId ?? "");
        return testTaskIds.has(taskId);
      }
      if (event.type === "CAL_BLOCK_ADDED" || event.type === "CAL_BLOCK_UPDATED") {
        const blockId = String((event.meta as { blockId?: string })?.blockId ?? "");
        return testBlockIds.has(blockId);
      }
      if (event.type === "CAL_BLOCK_REMOVED") {
        const blockId = String((event.meta as { blockId?: string })?.blockId ?? "");
        return testBlockIds.has(blockId);
      }
      if (event.type === "PLAN_SET" || event.type === "PLAN_RESET_APPLIED") {
        const metaDay = String((event.meta as { day?: string })?.day ?? "");
        return metaDay === day;
      }
      if (event.type === "HABIT_DONE" || event.type === "HABIT_MISSED") {
        const habitId = String((event.meta as { habitId?: string })?.habitId ?? "");
        return habitId.startsWith("test-");
      }
      if (event.type === "EXPENSE_ADDED") {
        const category = String((event.meta as { category?: string })?.category ?? "");
        return category === "test";
      }
      return false;
    });

    for (const block of testBlocks) {
      await ctx.db.delete(block._id);
    }

    for (const task of testTasks) {
      await ctx.db.delete(task._id);
    }

    for (const event of testEvents) {
      await ctx.db.delete(event._id);
    }

    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();
    for (const suggestion of suggestions) {
      await ctx.db.delete(suggestion._id);
    }

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();
    if (stateDoc) {
      await ctx.db.delete(stateDoc._id);
    }

    return {
      ok: true,
      deletedBlocks: testBlocks.length,
      deletedTasks: testTasks.length,
      deletedEvents: testEvents.length,
      deletedSuggestions: suggestions.length,
      deletedState: Boolean(stateDoc),
    };
  },
});

export const clearTestBlocks = mutation({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();

    const blocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();
    const testBlocks = blocks.filter((block) => isTestTitle(block.title));

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();
    const testBlockIds = new Set(testBlocks.map((block) => String(block._id)));
    const testEvents = events.filter((event) => {
      if (event.type === "CAL_BLOCK_ADDED" || event.type === "CAL_BLOCK_UPDATED") {
        const blockId = String((event.meta as { blockId?: string })?.blockId ?? "");
        return testBlockIds.has(blockId);
      }
      if (event.type === "CAL_BLOCK_REMOVED") {
        const blockId = String((event.meta as { blockId?: string })?.blockId ?? "");
        return testBlockIds.has(blockId);
      }
      return false;
    });

    for (const block of testBlocks) {
      await ctx.db.delete(block._id);
    }

    for (const event of testEvents) {
      await ctx.db.delete(event._id);
    }

    return {
      ok: true,
      deletedBlocks: testBlocks.length,
      deletedEvents: testEvents.length,
    };
  },
});

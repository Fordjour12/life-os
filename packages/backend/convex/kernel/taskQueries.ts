import { query } from "../_generated/server";
import { api } from "../_generated/api";

export const getActiveTasks = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;

    return ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
  },
});

export const getPausedTasks = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;

    const paused = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();

    return paused.sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0));
  },
});

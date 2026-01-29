import { query } from "../_generated/server";

function getUserId(): string {
  return "user_me";
}

export const getActiveTasks = query({
  args: {},
  handler: async (ctx) => {
    const userId = getUserId();

    return ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();
  },
});

export const getPausedTasks = query({
  args: {},
  handler: async (ctx) => {
    const userId = getUserId();

    return ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();
  },
});

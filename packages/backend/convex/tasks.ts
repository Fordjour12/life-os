import { query } from "./_generated/server";
import { api } from "./_generated/api";

export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;

    return ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .collect();
  },
});

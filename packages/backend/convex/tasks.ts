import { query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

type AuthUser = {
  _id: { tableName: "user"; id: string };
  _creationTime: number;
};

export const listOpen = query({
  args: {},
  handler: async (ctx): Promise<Doc<"tasks">[]> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser) as AuthUser | null;
    if (!user) throw new Error("Not authenticated");
    const userId: string = user._id.id;

    return ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .collect();
  },
});

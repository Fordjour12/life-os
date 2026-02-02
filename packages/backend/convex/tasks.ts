import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAuthUser } from "./auth";

export const listOpen = query({
  args: {},
  handler: async (ctx): Promise<Doc<"tasks">[]> => {
    const user = await requireAuthUser(ctx);
    const userId: string = user._id;

    return ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .order("desc")
      .collect();
  },
});

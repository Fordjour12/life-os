import { v } from "convex/values";

import { query } from "../_generated/server";
import { requireAuthUser } from "../auth";
import { normalizeOffsetMinutes } from "./stabilization";

const suggestionStatuses = ["new", "accepted", "downvoted", "ignored", "expired"] as const;

const statusGroups = {
  new: ["new"],
  handled: ["accepted", "downvoted", "ignored", "expired"],
  all: suggestionStatuses,
} as const;

function formatYYYYMMDDWithOffset(ts: number, tzOffsetMinutes: number) {
  const shifted = new Date(ts + tzOffsetMinutes * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getTodayYYYYMMDDWithOffset(tzOffsetMinutes: number) {
  return formatYYYYMMDDWithOffset(Date.now(), tzOffsetMinutes);
}

function shiftDay(day: string, deltaDays: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const getSuggestions = query({
  args: {
    mode: v.union(v.literal("today"), v.literal("recent"), v.literal("queue")),
    status: v.optional(v.union(v.literal("new"), v.literal("handled"), v.literal("all"))),
    daysBack: v.optional(v.number()),
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { mode, status, daysBack, tzOffsetMinutes }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const offset = normalizeOffsetMinutes(tzOffsetMinutes);
    const today = getTodayYYYYMMDDWithOffset(offset);
    const statusKey = status ?? "new";
    const statuses = statusGroups[statusKey];

    const buckets = await Promise.all(
      statuses.map((currentStatus) =>
        ctx.db
          .query("suggestions")
          .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", currentStatus))
          .collect(),
      ),
    );
    let suggestions = buckets.flat();

    if (mode === "today") {
      suggestions = suggestions.filter((suggestion) => suggestion.day === today);
    } else {
      const defaultDaysBack = mode === "recent" ? 7 : 30;
      const windowDays = Math.max(1, Math.min(daysBack ?? defaultDaysBack, 60));
      const startDay = shiftDay(today, -(windowDays - 1));
      suggestions = suggestions.filter(
        (suggestion) => suggestion.day >= startDay && suggestion.day <= today,
      );
    }

    const sorted = suggestions.sort((a, b) => {
      if (a.day !== b.day) return b.day.localeCompare(a.day);
      if (a.priority !== b.priority) return b.priority - a.priority;
      return b.createdAt - a.createdAt;
    });

    return sorted.map((suggestion) => ({
      id: suggestion._id,
      day: suggestion.day,
      type: suggestion.type,
      priority: suggestion.priority,
      reason: suggestion.reason,
      payload: suggestion.payload,
      status: suggestion.status,
      createdAt: suggestion.createdAt,
    }));
  },
});

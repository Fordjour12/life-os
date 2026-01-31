import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const cacheSuggestions = internalMutation({
  args: {
    userId: v.string(),
    day: v.string(),
    suggestions: v.array(v.any()),
    modelUsed: v.string(),
    requestTokens: v.optional(v.number()),
    responseTokens: v.optional(v.number()),
  },
  handler: async (ctx, { userId, day, suggestions, modelUsed, requestTokens, responseTokens }) => {
    const existing = await ctx.db
      .query("aiSuggestionCache")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        suggestions,
        modelUsed,
        requestTokens,
        responseTokens,
        createdAt: now,
      });
    } else {
      await ctx.db.insert("aiSuggestionCache", {
        userId,
        day,
        suggestions,
        modelUsed,
        requestTokens,
        responseTokens,
        createdAt: now,
      });
    }
  },
});

export const getCache = internalQuery({
  args: {
    userId: v.string(),
    day: v.string(),
  },
  handler: async (ctx, { userId, day }) => {
    return await ctx.db
      .query("aiSuggestionCache")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();
  },
});

export const logRequest = internalMutation({
  args: {
    userId: v.string(),
    day: v.string(),
    success: v.boolean(),
    modelUsed: v.string(),
    errorMessage: v.optional(v.string()),
    durationMs: v.number(),
  },
  handler: async (ctx, { userId, day, success, modelUsed, errorMessage, durationMs }) => {
    await ctx.db.insert("aiRequestLog", {
      userId,
      day,
      success,
      modelUsed,
      errorMessage,
      durationMs,
      createdAt: Date.now(),
    });
  },
});

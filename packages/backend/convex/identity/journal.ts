import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireAuthUser } from "../auth";
import { isSafeCopy } from "./guardrails";

function getTodayYYYYMMDD() {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const prompts = [
  "What felt heavy today?",
  "What helped, even a little?",
  "Anything you want to unload here?",
];

function pickPrompt(day: string) {
  const safePrompts = prompts.filter(isSafeCopy);
  const source = safePrompts.length > 0 ? safePrompts : prompts;
  const seed = day.split("-").reduce((sum, part) => sum + Number(part || 0), 0);
  return source[seed % source.length] ?? source[0];
}

export const getJournalPrompt: ReturnType<typeof query> = query({
  args: {
    day: v.optional(v.string()),
  },
  handler: async (ctx: QueryCtx, { day }: { day?: string }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();

    const skip = await ctx.db
      .query("journalSkips")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", targetDay))
      .first();

    if (skip) {
      return { day: targetDay, prompt: pickPrompt(targetDay), reason: "quiet", quiet: true };
    }

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", targetDay))
      .first();

    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", targetDay))
      .collect();

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const hasReflectionSuggestion = suggestions.some(
      (suggestion) => suggestion.type === "DAILY_REVIEW_QUESTION" && suggestion.status === "new",
    );
    const recoveryMode =
      stateDoc?.state && (stateDoc.state as { mode?: string }).mode === "recovery";
    const hadPlanReset = events.some((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    });
    const usedMicroRecovery = events.some((event) => event.type === "RECOVERY_PROTOCOL_USED");

    const shouldPrompt = Boolean(
      hasReflectionSuggestion || recoveryMode || hadPlanReset || usedMicroRecovery,
    );

    if (!shouldPrompt) {
      return { day: targetDay, prompt: null, reason: null, quiet: false };
    }

    return {
      day: targetDay,
      prompt: pickPrompt(targetDay),
      reason: hasReflectionSuggestion
        ? "reflection"
        : recoveryMode
          ? "recovery"
          : hadPlanReset
            ? "plan_reset"
            : "micro_recovery",
      quiet: false,
    };
  },
});

export const getJournalSkipForDay: ReturnType<typeof query> = query({
  args: {
    day: v.optional(v.string()),
  },
  handler: async (ctx: QueryCtx, { day }: { day?: string }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();

    return ctx.db
      .query("journalSkips")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", targetDay))
      .first();
  },
});

export const createJournalEntry: ReturnType<typeof mutation> = mutation({
  args: {
    day: v.string(),
    text: v.optional(v.string()),
    mood: v.optional(
      v.union(v.literal("low"), v.literal("neutral"), v.literal("ok"), v.literal("good")),
    ),
  },
  handler: async (
    ctx: MutationCtx,
    {
      day,
      text,
      mood,
    }: {
      day: string;
      text?: string;
      mood?: "low" | "neutral" | "ok" | "good";
    },
  ) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const trimmed = text?.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error("Day must be YYYY-MM-DD");
    }

    if (!trimmed && !mood) {
      throw new Error("Journal entry needs text or mood");
    }

    const now = Date.now();
    const entryId = await ctx.db.insert("journalEntries", {
      userId,
      day,
      text: trimmed,
      mood,
      createdAt: now,
    });

    return { ok: true, entryId };
  },
});

export const createJournalSkip: ReturnType<typeof mutation> = mutation({
  args: {
    day: v.string(),
  },
  handler: async (ctx: MutationCtx, { day }: { day: string }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error("Day must be YYYY-MM-DD");
    }

    const existing = await ctx.db
      .query("journalSkips")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    if (existing) {
      return { ok: true, skipped: true };
    }

    const now = Date.now();
    const skipId = await ctx.db.insert("journalSkips", {
      userId,
      day,
      createdAt: now,
    });

    return { ok: true, skipId };
  },
});

export const getJournalEntriesForDay: ReturnType<typeof query> = query({
  args: {
    day: v.optional(v.string()),
  },
  handler: async (ctx: QueryCtx, { day }: { day?: string }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();

    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", targetDay))
      .collect();

    return entries.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getRecentJournalEntries: ReturnType<typeof query> = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, { limit }: { limit?: number }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const cap = Math.max(1, Math.min(50, Math.floor(limit ?? 20)));

    const entries = await ctx.db
      .query("journalEntries")
      .withIndex("by_user_created", (q) => q.eq("userId", userId))
      .collect();

    return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, cap);
  },
});

export const deleteJournalEntry: ReturnType<typeof mutation> = mutation({
  args: {
    entryId: v.id("journalEntries"),
  },
  handler: async (ctx: MutationCtx, { entryId }: { entryId: Id<"journalEntries"> }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const typedEntryId = entryId as Id<"journalEntries">;
    const entry = await ctx.db.get(typedEntryId);

    if (!entry || entry.userId !== userId) {
      throw new Error("Journal entry not found");
    }

    await ctx.db.delete(typedEntryId);
    return { ok: true };
  },
});

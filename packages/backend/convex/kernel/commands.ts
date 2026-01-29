import { v } from "convex/values";

import { mutation, query } from "../_generated/server";

import type { KernelEvent } from "../../../../src/kernel/types";

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

    if (command.cmd === "complete_task") {
      eventType = "TASK_COMPLETED";
      meta = { taskId: command.input.taskId };
    } else if (command.cmd === "set_daily_plan") {
      eventType = "PLAN_SET";
      meta = { day: command.input.day, top3TaskIds: command.input.top3TaskIds };
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

    const kernelEvents: KernelEvent[] = dayEvents.map((event) => ({
      type: event.type,
      ts: event.ts,
      meta: event.meta,
    }));

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

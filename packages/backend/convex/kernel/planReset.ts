import { v } from "convex/values";

import type { KernelEvent } from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { internal } from "../_generated/api";
import { mutation } from "../_generated/server";

import { sanitizeSuggestionCopy } from "../identity/guardrails";
import { runPolicies } from "./policies";
import { computeDailyState } from "./reducer";
import {
  DAILY_SUGGESTION_CAP,
  getBoundaryFlagsFromBlocks,
  getTimeMetricsFromBlocks,
  normalizeOffsetMinutes,
} from "./stabilization";

function daysBetween(fromDay: string, toDay: string) {
  const fromDate = new Date(`${fromDay}T00:00:00Z`);
  const toDate = new Date(`${toDay}T00:00:00Z`);
  const diff = toDate.getTime() - fromDate.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function shiftDay(day: string, deltaDays: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const applyPlanReset = mutation({
  args: {
    day: v.string(),
    keepCount: v.optional(v.union(v.literal(1), v.literal(2))),
    idempotencyKey: v.string(),
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { day, keepCount, idempotencyKey, tzOffsetMinutes }) => {
    const user = await ctx.runQuery(api.auth.getCurrentUser);
    if (!user) throw new Error("Not authenticated");
    const userId = user._id;
    const now = Date.now();
    const keepN = keepCount ?? 1;
    const offset = normalizeOffsetMinutes(tzOffsetMinutes);

    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) => q.eq("userId", userId).eq("idempotencyKey", idempotencyKey))
      .first();

    if (existing) {
      return { ok: true, deduped: true };
    }

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const sorted = [...activeTasks].sort((a, b) => {
      if (a.estimateMin !== b.estimateMin) return a.estimateMin - b.estimateMin;
      return (a.priority ?? 2) - (b.priority ?? 2);
    });

    const kept = sorted.slice(0, keepN);
    const paused = sorted.slice(keepN);

    for (const task of paused) {
      await ctx.db.patch(task._id, {
        status: "paused",
        pausedAt: now,
        pauseReason: "plan_reset",
      });

      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "TASK_PAUSED",
        meta: { taskId: task._id, reason: "plan_reset" },
        idempotencyKey: `${idempotencyKey}:pause:${task._id}`,
      });
    }

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "PLAN_RESET_APPLIED",
      meta: {
        day,
        keptTaskIds: kept.map((task) => task._id),
        pausedTaskIds: paused.map((task) => task._id),
      },
      idempotencyKey,
    });

    const dayEvents = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const kernelEvents = dayEvents.map((event) => ({
      type: event.type as KernelEvent["type"],
      ts: event.ts,
      meta: event.meta,
    })) as KernelEvent[];

    const blocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();
    const timeMetrics = getTimeMetricsFromBlocks(blocks);
    const boundaries = getBoundaryFlagsFromBlocks(blocks, now, offset);
    const state = computeDailyState(day, kernelEvents, timeMetrics);

    const activeTasksAfterReset = kept;

    const under10 = activeTasksAfterReset
      .filter((task) => (task.estimateMin ?? 0) <= 10)
      .sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0))[0];
    const smallestActive =
      activeTasksAfterReset.sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0))[0] ?? null;
    const tinyWinTask = under10 ?? smallestActive ?? null;

    if (state.mode === "recovery") {
      for (const task of activeTasksAfterReset) {
        if (tinyWinTask && task._id === tinyWinTask._id) continue;
        await ctx.db.patch(task._id, {
          status: "paused",
          pausedAt: now,
          pauseReason: "micro_recovery",
        });

        await ctx.db.insert("events", {
          userId,
          ts: now,
          type: "TASK_PAUSED",
          meta: { taskId: task._id, reason: "micro_recovery" },
          idempotencyKey: `${idempotencyKey}:micro_pause:${task._id}`,
        });
      }
    }

    const existingState = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    if (existingState) {
      await ctx.db.patch(existingState._id, { state, updatedAt: now });
    } else {
      await ctx.db.insert("stateDaily", { userId, day, state, updatedAt: now });
    }

    const remainingRoomMin = Math.max(0, (state.freeMinutes ?? 0) - (state.plannedMinutes ?? 0));

    const stateHistory = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const stateByDay = new Map(stateHistory.map((entry) => [entry.day, entry.state]));
    const priorDays = [shiftDay(day, -1), shiftDay(day, -2), shiftDay(day, -3)];
    let stableDaysCount = 0;
    for (const priorDay of priorDays) {
      const priorState = stateByDay.get(priorDay) as { stabilityScore?: number } | undefined;
      if (priorState?.stabilityScore && priorState.stabilityScore >= 60) {
        stableDaysCount += 1;
      }
    }

    const yesterdayState = stateByDay.get(shiftDay(day, -1)) as { mode?: string } | undefined;
    const exitedRecoveryRecently = yesterdayState?.mode === "recovery" && state.mode !== "recovery";

    const pausedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const recentEvents = dayEvents.filter((event) => now - event.ts < SEVEN_DAYS);
    const recentlyResumedTaskIds = new Set<string>();
    for (const event of recentEvents) {
      if (event.type === "TASK_RESUMED") {
        const taskId = String((event.meta as { taskId?: string })?.taskId ?? "");
        if (taskId) recentlyResumedTaskIds.add(taskId);
      }
    }

    const prefs = await ctx.db
      .query("userKernelPrefs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const lastGentleReturnTaskId = prefs?.lastGentleReturnTaskId
      ? String(prefs.lastGentleReturnTaskId)
      : null;

    const suggestionStatuses = ["new", "accepted", "downvoted", "ignored", "expired"] as const;
    const suggestionBuckets = await Promise.all(
      suggestionStatuses.map((status) =>
        ctx.db
          .query("suggestions")
          .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", status))
          .collect(),
      ),
    );
    const allSuggestions = suggestionBuckets.flat();

    const recentlySuggestedTaskIds = new Set<string>();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const suggestionIdToTaskId = new Map<string, string>();
    const suggestedCountByTask = new Map<string, number>();
    for (const suggestion of allSuggestions) {
      if (suggestion.type !== "GENTLE_RETURN") continue;
      const taskId = String((suggestion.payload as { taskId?: string })?.taskId ?? "");
      if (taskId) {
        suggestionIdToTaskId.set(suggestion._id, taskId);
        if (now - suggestion.createdAt < THIRTY_DAYS) {
          suggestedCountByTask.set(taskId, (suggestedCountByTask.get(taskId) ?? 0) + 1);
        }
        if (now - suggestion.createdAt < SEVEN_DAYS) {
          recentlySuggestedTaskIds.add(taskId);
        }
      }
    }

    const feedbackEvents = dayEvents.filter(
      (event) => event.type === "SUGGESTION_FEEDBACK" && now - event.ts < THIRTY_DAYS,
    );
    const negativeCountByTask = new Map<string, number>();
    for (const event of feedbackEvents) {
      const meta = event.meta as { suggestionId?: string; vote?: string };
      const suggestionId = String(meta?.suggestionId ?? "");
      const taskId = suggestionIdToTaskId.get(suggestionId);
      if (!taskId) continue;
      if (meta?.vote === "down" || meta?.vote === "ignore") {
        negativeCountByTask.set(taskId, (negativeCountByTask.get(taskId) ?? 0) + 1);
      }
    }

    const roomCandidates = pausedTasks.filter(
      (task) => (task.estimateMin ?? 0) <= remainingRoomMin,
    );
    const eligibleCandidates = roomCandidates.filter((task) => {
      const taskId = String(task._id);
      if (lastGentleReturnTaskId && taskId === lastGentleReturnTaskId) return false;
      if (recentlySuggestedTaskIds.has(taskId)) return false;
      if (recentlyResumedTaskIds.has(taskId)) return false;
      return true;
    });

    const scoredCandidates = eligibleCandidates
      .map((task) => {
        const taskId = String(task._id);
        const suggestedCount = suggestedCountByTask.get(taskId) ?? 0;
        const negativeCount = negativeCountByTask.get(taskId) ?? 0;
        const isResistant = suggestedCount >= 3 && negativeCount >= 2;
        const penalty = isResistant ? 1000 : 0;
        return { task, score: (task.estimateMin ?? 0) + penalty };
      })
      .sort((a, b) =>
        a.score !== b.score ? a.score - b.score : a.task.estimateMin - b.task.estimateMin,
      );

    const rotated = scoredCandidates[0]?.task ?? null;
    const smallest =
      roomCandidates.sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0))[0] ?? null;
    const chosen = rotated ?? smallest;

    const suggestions = runPolicies(state, {
      lastPlanResetAt: now,
      planResetCountToday: 1,
      stableDaysCount,
      exitedRecoveryRecently,
      remainingRoomMin,
      tinyWinTask: tinyWinTask
        ? {
            taskId: tinyWinTask._id,
            title: tinyWinTask.title,
            estimateMin: tinyWinTask.estimateMin,
          }
        : null,
      smallestPausedTask: chosen
        ? {
            taskId: chosen._id,
            title: chosen.title,
            estimateMin: chosen.estimateMin,
          }
        : undefined,
      boundaries,
    });

    const existingSugs = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const existingNewCount = existingSugs.filter(
      (suggestion) => suggestion.status === "new",
    ).length;
    if (existingNewCount > 0) {
      return {
        ok: true,
        keptTaskIds: kept.map((task) => task._id as Id<"tasks">),
        pausedTaskIds: paused.map((task) => task._id as Id<"tasks">),
      };
    }

    const remainingSuggestionSlots = Math.max(0, DAILY_SUGGESTION_CAP - existingSugs.length);
    if (remainingSuggestionSlots === 0) {
      return {
        ok: true,
        keptTaskIds: kept.map((task) => task._id as Id<"tasks">),
        pausedTaskIds: paused.map((task) => task._id as Id<"tasks">),
      };
    }
    const cappedSuggestions = suggestions.slice(0, remainingSuggestionSlots);

    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const recentlySuggested = (cooldownKey?: string) => {
      if (!cooldownKey) return false;

      return existingSugs.some(
        (suggestion) =>
          suggestion.cooldownKey === cooldownKey && now - suggestion.createdAt < TWELVE_HOURS,
      );
    };

    for (const suggestion of existingSugs) {
      if (suggestion.status === "new") {
        await ctx.db.patch(suggestion._id, { status: "expired", updatedAt: now });
      }
    }

    for (const suggestion of cappedSuggestions) {
      if (recentlySuggested(suggestion.cooldownKey)) {
        continue;
      }

      const safeSuggestion = sanitizeSuggestionCopy(suggestion);

      await ctx.db.insert("suggestions", {
        userId,
        day: safeSuggestion.day,
        type: safeSuggestion.type,
        priority: safeSuggestion.priority,
        reason: safeSuggestion.reason,
        payload: safeSuggestion.payload,
        status: safeSuggestion.status,
        cooldownKey: safeSuggestion.cooldownKey,
        createdAt: now,
        updatedAt: now,
      });

      if (safeSuggestion.type === "GENTLE_RETURN") {
        const taskId = (safeSuggestion.payload as { taskId?: Id<"tasks"> })?.taskId;
        if (taskId) {
          if (prefs) {
            await ctx.db.patch(prefs._id, {
              lastGentleReturnTaskId: taskId,
              updatedAt: now,
            });
          } else {
            await ctx.db.insert("userKernelPrefs", {
              userId,
              lastGentleReturnTaskId: taskId,
              updatedAt: now,
            });
          }
        }
      }
    }

    await ctx.scheduler.runAfter(0, internal.kernel.vexAgents.generateAiSuggestions, {
      day,
      tzOffsetMinutes: offset,
      source: "applyPlanReset",
    });

    return {
      ok: true,
      keptTaskIds: kept.map((task) => task._id as Id<"tasks">),
      pausedTaskIds: paused.map((task) => task._id as Id<"tasks">),
    };
  },
});

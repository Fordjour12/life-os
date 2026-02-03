import { v } from "convex/values";

import type {
  KernelEvent,
  LifeState,
  PlannerState,
  PlanSetReason,
} from "../../../../src/kernel/types";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { mutation, query } from "../_generated/server";
import { requireAuthUser } from "../auth";
import { computeDailyState } from "./reducer";
import { sanitizeSuggestionCopy } from "../identity/guardrails";
import { runPolicies } from "./policies";
import {
  DAILY_SUGGESTION_CAP,
  getBoundaryFlagsFromBlocks,
  getTimeMetricsFromBlocks,
  normalizeOffsetMinutes,
} from "./stabilization";

function getTodayYYYYMMDD() {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

function formatYYYYMMDD(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetween(fromDay: string, toDay: string) {
  const fromDate = new Date(`${fromDay}T00:00:00Z`);
  const toDate = new Date(`${toDay}T00:00:00Z`);
  const diff = toDate.getTime() - fromDate.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function shiftDay(day: string, deltaDays: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatYYYYMMDD(date);
}

const TRACKED_EVENT_TYPES = new Set(["HABIT_DONE", "HABIT_MISSED", "EXPENSE_ADDED"]);

function getDailyEvents(
  events: Array<{ ts: number; type: string; meta: unknown }>,
  day: string,
  tzOffsetMinutes: number,
) {
  return events.filter((event) => formatYYYYMMDDWithOffset(event.ts, tzOffsetMinutes) === day);
}

function summarizeEvents(events: Array<{ type: string }>) {
  let habitDone = 0;
  let habitMissed = 0;
  let expenseAdded = 0;
  for (const event of events) {
    if (event.type === "HABIT_DONE") habitDone += 1;
    if (event.type === "HABIT_MISSED") habitMissed += 1;
    if (event.type === "EXPENSE_ADDED") expenseAdded += 1;
  }
  return { habitDone, habitMissed, expenseAdded };
}

const planReasons: PlanSetReason[] = ["initial", "adjust", "reset", "recovery", "return"];

export const executeCommand = mutation({
  args: {
    command: v.any(),
  },
  handler: async (ctx, { command }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const now = Date.now();
    const tzOffsetMinutes = normalizeOffsetMinutes(command?.tzOffsetMinutes);

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
    let day = getTodayYYYYMMDDWithOffset(tzOffsetMinutes);

    if (command.cmd === "create_task") {
      const title = String(command.input.title ?? "").trim();
      const estimateMin = Number(command.input.estimateMin ?? 0);
      const priority = Number(command.input.priority ?? 2);
      const notes = command.input.notes ? String(command.input.notes) : undefined;

      if (!title) {
        throw new Error("Task title is required");
      }

      if (!Number.isFinite(estimateMin) || estimateMin <= 0) {
        throw new Error("Task estimate must be a positive number");
      }

      if (![1, 2, 3].includes(priority)) {
        throw new Error("Task priority must be 1, 2, or 3");
      }

      const taskId = await ctx.db.insert("tasks", {
        userId,
        title,
        notes,
        estimateMin,
        priority,
        status: "active",
        createdAt: now,
      });

      eventType = "TASK_CREATED";
      meta = { taskId, estimateMin };
    } else if (command.cmd === "complete_task") {
      const taskId = command.input.taskId as Id<"tasks">;
      const task = await ctx.db.get(taskId);

      if (!task || task.userId !== userId) {
        throw new Error("Task not found");
      }

      if (task.status === "completed") {
        return { ok: true, alreadyCompleted: true };
      }

      await ctx.db.patch(taskId, {
        status: "completed",
        completedAt: now,
      });

      eventType = "TASK_COMPLETED";
      meta = { taskId, estimateMin: task.estimateMin };
    } else if (command.cmd === "accept_rest") {
      const minutes = Number(command.input.minutes ?? 0);
      const dayInput = String(command.input.day ?? "").trim();

      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error("Rest minutes must be a positive number");
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayInput)) {
        throw new Error("Rest day must be YYYY-MM-DD");
      }

      eventType = "REST_ACCEPTED";
      meta = { minutes };
      day = dayInput;
    } else if (command.cmd === "set_daily_plan") {
      const allowedEstimates = [10, 25, 45, 60];
      const dayInput = String(command.input.day ?? "").trim();
      const rawItems = Array.isArray(command.input.focusItems)
        ? (command.input.focusItems as Array<{
            id?: string;
            label?: string;
            estimatedMinutes?: number;
          }>)
        : [];
      const reasonInput = String(command.input.reason ?? "").trim() as PlanSetReason;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayInput)) {
        throw new Error("Plan day must be YYYY-MM-DD");
      }

      const normalizeEstimate = (value: number) => {
        if (!Number.isFinite(value)) return 25;
        return allowedEstimates.reduce((closest, estimate) =>
          Math.abs(estimate - value) < Math.abs(closest - value) ? estimate : closest,
        );
      };

      const focusItems = rawItems
        .slice(0, 3)
        .map((item, index) => {
          const label = String(item?.label ?? "").trim();
          if (!label) return null;
          const estimatedMinutes = normalizeEstimate(Number(item?.estimatedMinutes ?? 0));
          const id = String(item?.id ?? "").trim() || `focus-${now}-${index}`;
          return { id, label, estimatedMinutes };
        })
        .filter((item): item is { id: string; label: string; estimatedMinutes: number } =>
          Boolean(item),
        );

      if (focusItems.length === 0) {
        throw new Error("Daily plan needs at least one focus item");
      }

      const existingPlans = await ctx.db
        .query("events")
        .withIndex("by_user_ts", (q) => q.eq("userId", userId))
        .collect();

      let latestVersion = 0;
      for (const event of existingPlans) {
        if (event.type !== "PLAN_SET") continue;
        const meta = event.meta as { day?: string; version?: number };
        if (meta?.day !== dayInput) continue;
        const version = Number(meta.version ?? 0);
        if (version > latestVersion) latestVersion = version;
      }

      const reason: PlanSetReason = planReasons.includes(reasonInput)
        ? reasonInput
        : latestVersion === 0
          ? "initial"
          : "adjust";
      const version = latestVersion + 1;

      eventType = "PLAN_SET";
      meta = { day: dayInput, focusItems, version, reason };
      day = dayInput;
    } else if (command.cmd === "apply_plan_reset") {
      const keepCount = command.input.keepCount as 1 | 2 | undefined;
      const keepN = keepCount ?? 1;

      if (![1, 2].includes(keepN)) {
        throw new Error("Plan reset keep count must be 1 or 2");
      }

      const activeTasks = await ctx.db
        .query("tasks")
        .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
        .collect();
      day = command.input.day;

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
          idempotencyKey: `${command.idempotencyKey}:pause:${task._id}`,
        });
      }

      eventType = "PLAN_RESET_APPLIED";
      meta = {
        day,
        keptTaskIds: kept.map((task) => task._id),
        pausedTaskIds: paused.map((task) => task._id),
      };
    } else if (command.cmd === "submit_feedback") {
      eventType = "SUGGESTION_FEEDBACK";
      meta = {
        suggestionId: command.input.suggestionId,
        vote: command.input.vote,
      };
    } else if (command.cmd === "log_habit") {
      const habitId = String(command.input.habitId ?? "").trim();
      const status = String(command.input.status ?? "").trim();
      const note = command.input.note ? String(command.input.note).trim() : undefined;

      if (!habitId) {
        throw new Error("Habit id is required");
      }

      if (status !== "done" && status !== "missed") {
        throw new Error("Habit status must be 'done' or 'missed'");
      }

      eventType = status === "done" ? "HABIT_DONE" : "HABIT_MISSED";
      meta = note ? { habitId, note } : { habitId };
    } else if (command.cmd === "add_expense") {
      const amount = Number(command.input.amount ?? 0);
      const category = String(command.input.category ?? "").trim();
      const note = command.input.note ? String(command.input.note).trim() : undefined;

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Expense amount must be a positive number");
      }

      if (!category) {
        throw new Error("Expense category is required");
      }

      eventType = "EXPENSE_ADDED";
      meta = note ? { amount, category, note } : { amount, category };
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

    if (command.cmd === "accept_rest") {
      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "RECOVERY_PROTOCOL_USED",
        meta: { day, didTinyWin: false, didRest: true },
        idempotencyKey: `${command.idempotencyKey}:protocol`,
      });
    }

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
    const state = computeDailyState(day, kernelEvents, timeMetrics);

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const under10 = activeTasks
      .filter((task) => (task.estimateMin ?? 0) <= 10)
      .sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0))[0];
    const smallestActive =
      activeTasks.sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0))[0] ?? null;
    const tinyWinTask = under10 ?? smallestActive ?? null;

    if (state.mode === "recovery") {
      for (const task of activeTasks) {
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
          idempotencyKey: `${command.idempotencyKey}:micro_pause:${task._id}`,
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

    let planResetCountToday = 0;
    let lastPlanResetAt = 0;
    for (const event of dayEvents) {
      if (event.type === "PLAN_SET") {
        const meta = event.meta as { day?: string; reason?: PlanSetReason };
        if (meta?.day === day && (meta.reason === "reset" || meta.reason === "recovery")) {
          planResetCountToday += 1;
          if (event.ts > lastPlanResetAt) lastPlanResetAt = event.ts;
        }
      }
      if (event.type === "PLAN_RESET_APPLIED") {
        const meta = event.meta as { day?: string };
        if (meta?.day === day) {
          planResetCountToday += 1;
          if (event.ts > lastPlanResetAt) lastPlanResetAt = event.ts;
        }
      }
    }

    const remainingRoomMin = Math.max(0, (state.freeMinutes ?? 0) - (state.plannedMinutes ?? 0));

    const stateHistory = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const stateByDay = new Map(stateHistory.map((entry) => [entry.day, entry.state as LifeState]));
    const priorDays = [shiftDay(day, -1), shiftDay(day, -2), shiftDay(day, -3)];
    let stableDaysCount = 0;
    for (const priorDay of priorDays) {
      const priorState = stateByDay.get(priorDay);
      if (priorState?.stabilityScore && priorState.stabilityScore >= 60) {
        stableDaysCount += 1;
      }
    }

    const yesterdayState = stateByDay.get(shiftDay(day, -1));
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

    const boundaries = getBoundaryFlagsFromBlocks(blocks, now, tzOffsetMinutes);
    const suggestions = runPolicies(state, {
      lastPlanResetAt,
      planResetCountToday,
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
      return { ok: true, state, suggestionsCount: 0 };
    }

    const remainingSuggestionSlots = Math.max(0, DAILY_SUGGESTION_CAP - existingSugs.length);
    if (remainingSuggestionSlots === 0) {
      return { ok: true, state, suggestionsCount: 0 };
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
        await ctx.db.patch(suggestion._id, {
          status: "expired",
          updatedAt: now,
        });
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

    const scheduleAction: any = "generateAiSuggestions";
    await ctx.scheduler.runAfter(0, scheduleAction, {
      day,
      tzOffsetMinutes,
      source: "executeCommand",
    });

    return { ok: true, state, suggestionsCount: cappedSuggestions.length };
  },
});

export const getToday = query({
  args: {
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx: QueryCtx, { tzOffsetMinutes }: { tzOffsetMinutes?: number }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const offset = normalizeOffsetMinutes(tzOffsetMinutes);
    const day = getTodayYYYYMMDDWithOffset(offset);

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const suggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    let plan: {
      day: string;
      version: number;
      reason: PlanSetReason;
      focusItems: Array<{
        id: string;
        label: string;
        estimatedMinutes: number;
      }>;
    } | null = null;
    let latestPlanVersion = -1;
    let latestPlanTs = 0;
    for (const event of events) {
      if (event.type !== "PLAN_SET") continue;
      const meta = event.meta as {
        day?: string;
        version?: number;
        reason?: PlanSetReason;
        focusItems?: Array<{
          id?: string;
          label?: string;
          estimatedMinutes?: number;
        }>;
      };
      if (meta?.day !== day || !Array.isArray(meta.focusItems)) continue;
      const version = Number(meta.version ?? 0);
      const shouldReplace =
        version > latestPlanVersion || (version === latestPlanVersion && event.ts > latestPlanTs);
      if (!shouldReplace) continue;
      const focusItems = meta.focusItems
        .map((item) => ({
          id: String(item?.id ?? "").trim(),
          label: String(item?.label ?? "").trim(),
          estimatedMinutes: Number(item?.estimatedMinutes ?? 0),
        }))
        .filter((item) => item.id && item.label && Number.isFinite(item.estimatedMinutes));
      plan = {
        day,
        version,
        reason: meta.reason && planReasons.includes(meta.reason) ? meta.reason : "initial",
        focusItems,
      };
      latestPlanVersion = version;
      latestPlanTs = event.ts;
    }

    const hasTodayEvents = events.some(
      (event) => formatYYYYMMDDWithOffset(event.ts, offset) === day,
    );
    const lastEventDay = events
      .map((event) => formatYYYYMMDDWithOffset(event.ts, offset))
      .filter((eventDay) => eventDay < day)
      .sort();
    const lastEventDayValue = lastEventDay.length ? lastEventDay[lastEventDay.length - 1] : null;
    const returning =
      Boolean(lastEventDayValue) &&
      hasTodayEvents &&
      daysBetween(lastEventDayValue as string, day) >= 3;

    const lifeState = stateDoc?.state ?? null;
    let plannerState: PlannerState = "NO_PLAN";
    if (returning) {
      plannerState = "RETURNING";
    } else if (lifeState?.mode === "recovery") {
      plannerState = "RECOVERY";
    } else if (!plan) {
      plannerState = "NO_PLAN";
    } else if (lifeState?.load === "overloaded") {
      plannerState = "OVERLOADED";
    } else if (lifeState?.momentum === "stalled") {
      plannerState = "STALLED";
    } else {
      plannerState = "PLANNED_OK";
    }

    const todayEvents = getDailyEvents(events, day, offset).filter((event) =>
      TRACKED_EVENT_TYPES.has(event.type),
    );

    return {
      day,
      state: lifeState,
      plan,
      plannerState,
      eventSummary: summarizeEvents(todayEvents),
      dailyEvents: todayEvents.map((event) => ({
        type: event.type,
        ts: event.ts,
        meta: event.meta,
      })),
      suggestions: suggestions
        .filter((suggestion) => suggestion.status === "new")
        .sort((a, b) => b.priority - a.priority),
    };
  },
});

export const getEventsForDay = query({
  args: {
    day: v.optional(v.string()),
    types: v.optional(v.array(v.string())),
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (
    ctx: QueryCtx,
    { day, types, tzOffsetMinutes }: { day?: string; types?: string[]; tzOffsetMinutes?: number },
  ) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const offset = normalizeOffsetMinutes(tzOffsetMinutes);
    const targetDay = day ?? getTodayYYYYMMDDWithOffset(offset);
    const typeFilter = new Set(types ?? []);

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    return events
      .filter((event) => formatYYYYMMDDWithOffset(event.ts, offset) === targetDay)
      .filter((event) => (typeFilter.size ? typeFilter.has(event.type) : true))
      .map((event) => ({
        id: event._id,
        type: event.type,
        ts: event.ts,
        meta: event.meta,
      }));
  },
});

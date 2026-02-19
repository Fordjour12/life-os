import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../auth";
import type {
  NextStepRawData,
  RecoveryProtocolRawData,
  WeeklyPlanRawData,
  AiSuggestRawData,
} from "./typesVex";
import type { LifeState } from "@life-os/domain-kernel";

const suggestionValidator = v.object({
  day: v.string(),
  type: v.string(),
  priority: v.number(),
  reason: v.object({
    code: v.string(),
    detail: v.string(),
  }),
  payload: v.any(),
  status: v.string(),
  cooldownKey: v.optional(v.string()),
});

export const getNextStepRawData = internalQuery({
  args: {
    taskId: v.id("tasks"),
    day: v.string(),
  },
  handler: async (ctx, { taskId, day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const task = await ctx.db.get(taskId);
    const safeTask =
      task && task.userId === userId
        ? {
            _id: task._id,
            title: task.title,
            estimateMin: task.estimateMin,
            priority: task.priority ?? undefined,
            status: task.status,
          }
        : null;

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const recentEvents = events
      .filter((event) => now - event.ts < SEVEN_DAYS)
      .slice(-40)
      .map((event) => ({ ts: event.ts, type: event.type, meta: event.meta }));

    return {
      task: safeTask,
      stateDoc: stateDoc ? { state: stateDoc.state as LifeState } : null,
      events: recentEvents,
    } as NextStepRawData;
  },
});

export const getRecoveryProtocolRawData = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const calendarBlocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const recentEvents = events
      .filter((event) => now - event.ts < SEVEN_DAYS)
      .slice(-40)
      .map((event) => ({ ts: event.ts, type: event.type, meta: event.meta }));

    return {
      stateDoc: stateDoc ? { state: stateDoc.state as LifeState } : null,
      calendarBlocks: calendarBlocks.map((block) => ({
        startMin: block.startMin,
        endMin: block.endMin,
        kind: block.kind,
      })),
      events: recentEvents,
    } as RecoveryProtocolRawData;
  },
});

export const getWeeklyPlanRawData = internalQuery({
  args: {
    startDay: v.string(),
    endDay: v.string(),
  },
  handler: async (ctx, { startDay, endDay }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const pausedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();

    const stateDocs = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();

    const calendarBlocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();
    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const latestPlanByDay = new Map<
      string,
      {
        day: string;
        version: number;
        ts: number;
        focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
      }
    >();
    for (const event of events) {
      if (event.type !== "PLAN_SET") continue;
      const meta = event.meta as
        | {
            day?: string;
            version?: number;
            focusItems?: Array<{ id?: string; label?: string; estimatedMinutes?: number }>;
          }
        | undefined;
      if (!meta?.day || !Array.isArray(meta.focusItems)) continue;
      if (meta.day < startDay || meta.day > endDay) continue;
      const version = Number(meta.version ?? 0);
      const focusItems = meta.focusItems
        .map((item, index) => {
          const label = String(item?.label ?? "").trim();
          if (!label) return null;
          const estimatedMinutes = Number(item?.estimatedMinutes ?? 0);
          if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) return null;
          const id = String(item?.id ?? "").trim() || `focus-${meta.day}-${index}`;
          return { id, label, estimatedMinutes };
        })
        .filter((item): item is { id: string; label: string; estimatedMinutes: number } =>
          Boolean(item),
        );
      if (!focusItems.length) continue;
      const existing = latestPlanByDay.get(meta.day);
      if (
        !existing ||
        version > existing.version ||
        (version === existing.version && event.ts > existing.ts)
      ) {
        latestPlanByDay.set(meta.day, {
          day: meta.day,
          version,
          ts: event.ts,
          focusItems,
        });
      }
    }

    return {
      activeTasks: activeTasks.map((task) => ({
        title: task.title,
        estimateMin: task.estimateMin,
        priority: task.priority ?? undefined,
      })),
      pausedTasks: pausedTasks.map((task) => ({
        title: task.title,
        estimateMin: task.estimateMin,
        priority: task.priority ?? undefined,
      })),
      stateDocs: stateDocs
        .filter((entry) => entry.day >= startDay && entry.day <= endDay)
        .map((entry) => ({ day: entry.day, state: entry.state as LifeState })),
      calendarBlocks: calendarBlocks
        .filter((block) => block.day >= startDay && block.day <= endDay)
        .map((block) => ({
          day: block.day,
          startMin: block.startMin,
          endMin: block.endMin,
          kind: block.kind,
        })),
      existingPlans: Array.from(latestPlanByDay.values()).map((plan) => ({
        day: plan.day,
        version: plan.version,
        focusItems: plan.focusItems,
      })),
    } as WeeklyPlanRawData;
  },
});

export const getAiSuggestRawData = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const stateDoc = await ctx.db
      .query("stateDaily")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .first();

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
      .collect();

    const pausedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "paused"))
      .collect();

    const calendarBlocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    const existingSuggestions = await ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();

    return {
      stateDoc,
      events,
      activeTasks,
      pausedTasks,
      calendarBlocks,
      existingSuggestions,
    } as AiSuggestRawData;
  },
});

export const getSuggestionsForDay = internalQuery({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    return ctx.db
      .query("suggestions")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .collect();
  },
});

export const insertSuggestion = internalMutation({
  args: {
    suggestion: suggestionValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, { suggestion, createdAt, updatedAt }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    await ctx.db.insert("suggestions", {
      userId,
      day: suggestion.day,
      type: suggestion.type,
      priority: suggestion.priority,
      reason: suggestion.reason,
      payload: suggestion.payload,
      status: suggestion.status,
      cooldownKey: suggestion.cooldownKey,
      createdAt,
      updatedAt,
    });
  },
});

export const getExpenses = internalQuery({
  args: {
    startDay: v.string(),
    endDay: v.string(),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { startDay, endDay, category }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const expenses = events
      .filter((event) => {
        if (event.type !== "EXPENSE_ADDED") return false;
        const meta = event.meta as { amount?: number; category?: string };
        const eventDay = new Date(event.ts).toISOString().split("T")[0].replace(/-/g, "");
        if (eventDay < startDay || eventDay > endDay) return false;
        if (category && meta.category !== category) return false;
        return true;
      })
      .map((event) => {
        const meta = event.meta as { amount: number; category: string; note?: string };
        const day = new Date(event.ts).toISOString().split("T")[0].replace(/-/g, "");
        return {
          id: event._id,
          ts: event.ts,
          day,
          amount: meta.amount,
          category: meta.category,
          note: meta.note,
        };
      })
      .sort((a, b) => b.ts - a.ts);

    return expenses;
  },
});

export const getBudgets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user_category", (q) => q.eq("userId", userId))
      .collect();

    return budgets.map((b) => ({
      category: b.category,
      monthlyLimit: b.monthlyLimit,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  },
});

export const getFinancialSummary = internalQuery({
  args: {
    month: v.string(),
  },
  handler: async (ctx, { month }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;

    const startDay = `${month}-01`;
    const endDay = `${month}-31`;

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", userId))
      .collect();

    const budgets = await ctx.db
      .query("budgets")
      .withIndex("by_user_category", (q) => q.eq("userId", userId))
      .collect();

    const budgetMap = new Map(budgets.map((b) => [b.category, b.monthlyLimit]));

    const categorySpending = new Map<string, number>();

    for (const event of events) {
      if (event.type !== "EXPENSE_ADDED") continue;
      const meta = event.meta as { amount: number; category: string };
      const eventDay = new Date(event.ts).toISOString().split("T")[0].replace(/-/g, "");
      if (eventDay < startDay || eventDay > endDay) continue;

      const current = categorySpending.get(meta.category) || 0;
      categorySpending.set(meta.category, current + meta.amount);
    }

    const byCategory = Array.from(categorySpending.entries()).map(([category, spent]) => ({
      category,
      spent,
      budget: budgetMap.get(category) || 0,
      remaining: (budgetMap.get(category) || 0) - spent,
    }));

    const totalSpent = Array.from(categorySpending.values()).reduce((a, b) => a + b, 0);
    const totalBudget = Array.from(budgetMap.values()).reduce((a, b) => a + b, 0);

    return {
      month,
      byCategory,
      totalSpent,
      totalBudget,
      totalRemaining: totalBudget - totalSpent,
    };
  },
});

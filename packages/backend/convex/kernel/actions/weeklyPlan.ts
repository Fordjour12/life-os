import { action } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../../auth";
import { suggestionAgent } from "../agents";
import {
  getISOWeekStartDate,
  formatYYYYMMDD,
  getDefaultWeekId,
  normalizePlanEstimate,
} from "../helpers";
import { normalizeWeeklyPlanDraft } from "../validators";
import type { WeeklyPlanRawData, WeeklyPlanDraft } from "../typesVex";

const DAY_MINUTES = 24 * 60;
const PLANNING_WINDOW_START = 7 * 60;
const PLANNING_WINDOW_END = 22 * 60;
const BLOCKING_KINDS = new Set(["busy", "rest", "personal"]);

function getBusyMinutesForDay(blocks: WeeklyPlanRawData["calendarBlocks"], day: string) {
  return blocks
    .filter((block) => block.day === day && block.kind === "busy")
    .reduce((sum, block) => sum + Math.max(0, block.endMin - block.startMin), 0);
}

function pickEstimateAtMost(limit: number) {
  if (limit >= 60) return 60;
  if (limit >= 45) return 45;
  if (limit >= 25) return 25;
  if (limit >= 10) return 10;
  return 0;
}

function getPlanBudget(raw: WeeklyPlanRawData, day: string, busyMinutes: number) {
  const state = raw.stateDocs.find((entry) => entry.day === day)?.state;
  const effective = Number(state?.effectiveFreeMinutes ?? NaN);
  if (Number.isFinite(effective) && effective > 0) {
    return Math.max(10, Math.round(effective));
  }
  const free = Number(state?.freeMinutes ?? NaN);
  if (Number.isFinite(free) && free > 0) {
    return Math.max(10, Math.round(free));
  }
  return Math.max(10, 480 - busyMinutes);
}

function getPlanningWindows(raw: WeeklyPlanRawData, day: string) {
  const dayBlocks = raw.calendarBlocks
    .filter((block) => block.day === day && BLOCKING_KINDS.has(block.kind))
    .map((block) => ({
      start: Math.max(0, Math.min(DAY_MINUTES, block.startMin)),
      end: Math.max(0, Math.min(DAY_MINUTES, block.endMin)),
    }))
    .filter((block) => block.end > block.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const block of dayBlocks) {
    const previous = merged[merged.length - 1];
    if (!previous || block.start > previous.end) {
      merged.push({ start: block.start, end: block.end });
      continue;
    }
    previous.end = Math.max(previous.end, block.end);
  }

  const windows: Array<{ start: number; end: number }> = [];
  let cursor = PLANNING_WINDOW_START;
  for (const block of merged) {
    if (block.end <= PLANNING_WINDOW_START) continue;
    if (block.start >= PLANNING_WINDOW_END) break;
    const clippedStart = Math.max(block.start, PLANNING_WINDOW_START);
    const clippedEnd = Math.min(block.end, PLANNING_WINDOW_END);
    if (clippedStart > cursor) {
      windows.push({ start: cursor, end: clippedStart });
    }
    cursor = Math.max(cursor, clippedEnd);
  }
  if (cursor < PLANNING_WINDOW_END) {
    windows.push({ start: cursor, end: PLANNING_WINDOW_END });
  }
  return windows.filter((window) => window.end > window.start);
}

function applyAdaptiveReplan(
  dayPlan: WeeklyPlanDraft["days"][number],
  budgetMinutes: number,
) {
  const totalPlanned = dayPlan.focusItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  if (totalPlanned <= budgetMinutes) {
    return dayPlan;
  }

  let remaining = budgetMinutes;
  const adjustedItems: WeeklyPlanDraft["days"][number]["focusItems"] = [];
  for (const item of dayPlan.focusItems) {
    if (remaining < 10) break;
    const boundedTarget = Math.min(item.estimatedMinutes, remaining);
    const estimate = pickEstimateAtMost(boundedTarget);
    if (estimate <= 0) continue;
    adjustedItems.push({
      ...item,
      estimatedMinutes: normalizePlanEstimate(estimate),
    });
    remaining -= estimate;
  }

  if (!adjustedItems.length) {
    adjustedItems.push({
      id: `focus-${dayPlan.day}-recovery`,
      label: "Rest & recovery",
      estimatedMinutes: 10,
    });
  }

  return {
    ...dayPlan,
    focusItems: adjustedItems,
    adjustment: {
      code: "adaptive_replan",
      detail: `Adjusted to ${budgetMinutes} available minutes so the day stays realistic.`,
    },
  };
}

function withReservations(
  dayPlan: WeeklyPlanDraft["days"][number],
  windows: Array<{ start: number; end: number }>,
) {
  const mutableWindows = windows.map((window) => ({ ...window }));
  const reservations: NonNullable<WeeklyPlanDraft["days"][number]["reservations"]> = [];

  for (const item of dayPlan.focusItems) {
    const index = mutableWindows.findIndex((window) => window.end - window.start >= item.estimatedMinutes);
    if (index < 0) {
      reservations.push({
        itemId: item.id,
        label: item.label,
        status: "unplaced",
      });
      continue;
    }

    const window = mutableWindows[index];
    const startMin = window.start;
    const endMin = startMin + item.estimatedMinutes;
    window.start = endMin;
    reservations.push({
      itemId: item.id,
      label: item.label,
      startMin,
      endMin,
      status: "reserved",
    });
  }

  return reservations;
}

function enrichWeeklyDraft(draft: WeeklyPlanDraft, raw: WeeklyPlanRawData) {
  const existingPlanDays = new Set(raw.existingPlans.map((plan) => plan.day));
  return {
    ...draft,
    days: draft.days.map((dayPlan) => {
      const busyMinutes = getBusyMinutesForDay(raw.calendarBlocks, dayPlan.day);
      if (existingPlanDays.has(dayPlan.day)) {
        return {
          ...dayPlan,
          conflict: {
            code: "existing_plan",
            detail: "A plan already exists for this day. Review before replacing it.",
          },
        };
      }

      const budgetMinutes = getPlanBudget(raw, dayPlan.day, busyMinutes);
      const adapted = applyAdaptiveReplan(dayPlan, budgetMinutes);
      const reservations = withReservations(adapted, getPlanningWindows(raw, dayPlan.day));
      const hasUnplaced = reservations.some((reservation) => reservation.status === "unplaced");
      if (busyMinutes >= 9 * 60) {
        return {
          ...adapted,
          reservations,
          conflict: {
            code: "busy_day",
            detail: "This day already has heavy calendar load. Keep changes very small.",
          },
        };
      }

      if (hasUnplaced) {
        return {
          ...adapted,
          reservations,
          conflict: {
            code: "no_slot",
            detail: "Not enough open time slots for all suggested items.",
          },
        };
      }

      return {
        ...adapted,
        reservations,
      };
    }),
  } as WeeklyPlanDraft;
}

export const generateWeeklyPlanDraft = action({
  args: {
    week: v.optional(v.string()),
  },
  handler: async (ctx, { week }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const weekId = week ?? getDefaultWeekId();
    if (!/^\d{4}-\d{2}$/.test(weekId)) {
      throw new Error("Week must be YYYY-WW");
    }

    const weekStart = getISOWeekStartDate(weekId);
    const weekEndExclusive = new Date(weekStart);
    weekEndExclusive.setUTCDate(weekStart.getUTCDate() + 7);

    const startDay = formatYYYYMMDD(weekStart);
    const endDay = formatYYYYMMDD(new Date(weekEndExclusive.getTime() - 24 * 60 * 60 * 1000));

    const raw = (await (ctx.runQuery as any)("kernel/vexAgents/getWeeklyPlanRawData", {
      startDay,
      endDay,
    })) as WeeklyPlanRawData;

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(weekStart.getUTCDate() + index);
      return formatYYYYMMDD(date);
    });

    const activeTasks = raw.activeTasks
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2))
      .slice(0, 7);

    const { safeCopy } = await import("../../identity/guardrails");

    const fallbackDays = days.map((day, index) => {
      const task = activeTasks[index % Math.max(activeTasks.length, 1)];
      const label = task?.title ?? "Recovery & reset";
      return {
        day,
        focusItems: [
          {
            id: `focus-${day}-0`,
            label: safeCopy(label, "Recovery & reset"),
            estimatedMinutes: normalizePlanEstimate(task?.estimateMin ?? 25),
          },
        ],
        reason: {
          code: "draft",
          detail: "Drafted to keep the week light and consistent.",
        },
      };
    });

    const fallback: WeeklyPlanDraft = {
      week: weekId,
      days: fallbackDays,
      reason: {
        code: "draft",
        detail: "Drafted to balance load across the week.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return {
        status: "success",
        source: "fallback",
        draft: enrichWeeklyDraft(fallback, raw),
      } as const;
    }

    try {
      const { threadId } = await suggestionAgent.createThread(ctx, {
        userId,
        title: `weekly-plan:${weekId}`,
      });

      const prompt = `You are generating a weekly plan draft.

WEEK:
- Week ID: ${weekId}
- Days: ${JSON.stringify(days)}

TASKS:
- Active: ${JSON.stringify(raw.activeTasks)}
- Paused: ${JSON.stringify(raw.pausedTasks)}
- Existing Plans: ${JSON.stringify(raw.existingPlans)}

STATE SNAPSHOTS:
${JSON.stringify(raw.stateDocs)}

CALENDAR BLOCKS:
${JSON.stringify(raw.calendarBlocks)}

RULES:
1. Return JSON only.
2. Provide 1-3 focus items per day.
3. Keep total planned minutes gentle; avoid overload.
4. If rest is needed, use a single focus item labeled "Rest & recovery".
5. Each day must include a reason { code, detail }.
6. Include a top-level reason for the week.
7. If a day already has an existing plan, do not overwrite it with heavy work.

OUTPUT FORMAT:
{ "week": "${weekId}", "days": [{ "day": "YYYY-MM-DD", "focusItems": [{ "id": string, "label": string, "estimatedMinutes": number }], "reason": { "code": string, "detail": string } }], "reason": { "code": string, "detail": string } }`;

      const result = await suggestionAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof suggestionAgent.generateText>[2]);

      if (!result.text) {
        return {
          status: "success",
          source: "fallback",
          draft: enrichWeeklyDraft(fallback, raw),
        } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = enrichWeeklyDraft(normalizeWeeklyPlanDraft(parsed, fallback), raw);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Weekly plan AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: enrichWeeklyDraft(fallback, raw),
      } as const;
    }
  },
});

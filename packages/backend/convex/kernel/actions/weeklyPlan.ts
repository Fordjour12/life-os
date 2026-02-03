import type { LifeState } from "../../../../../src/kernel/types";
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

    const raw = (await (ctx.runQuery as any)("kernel/queries:getWeeklyPlanRawData", {
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
        draft: fallback,
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

OUTPUT FORMAT:
{ "week": "${weekId}", "days": [{ "day": "YYYY-MM-DD", "focusItems": [{ "id": string, "label": string, "estimatedMinutes": number }], "reason": { "code": string, "detail": string } }], "reason": { "code": string, "detail": string } }`;

      const result = await suggestionAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof suggestionAgent.generateText>[2]);

      if (!result.text) {
        return {
          status: "success",
          source: "fallback",
          draft: fallback,
        } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeWeeklyPlanDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Weekly plan AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
      } as const;
    }
  },
});

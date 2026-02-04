import { v } from "convex/values";

import { action } from "../../_generated/server";
import { requireAuthUser } from "../../auth";
import { suggestionAgent } from "../agents";
import { normalizePlanEstimate, truncate } from "../helpers";
import { normalizeDailyPlanDraft } from "../validators";
import type { DailyPlanDraft, WeeklyPlanRawData } from "../typesVex";

export const generateDailyPlanDraft = action({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      throw new Error("Day must be YYYY-MM-DD");
    }

    const raw = (await (ctx.runQuery as any)("kernel/queries:getWeeklyPlanRawData", {
      startDay: day,
      endDay: day,
    })) as WeeklyPlanRawData;

    const activeTasks = raw.activeTasks
      .sort((a, b) => (a.priority ?? 2) - (b.priority ?? 2))
      .slice(0, 3);

    const { safeCopy } = await import("../../identity/guardrails");
    const fallbackItems = activeTasks.length
      ? activeTasks.map((task, index) => ({
          id: `focus-${day}-${index}`,
          label: safeCopy(task.title ?? "Focus block", "Focus block"),
          estimatedMinutes: normalizePlanEstimate(task.estimateMin ?? 25),
        }))
      : [
          {
            id: `focus-${day}-0`,
            label: safeCopy("Recovery & reset", "Recovery & reset"),
            estimatedMinutes: 25,
          },
        ];

    const fallback: DailyPlanDraft = {
      day,
      focusItems: fallbackItems,
      reason: {
        code: "draft",
        detail: "Drafted to keep today light and steady.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return { status: "success", source: "fallback", draft: fallback } as const;
    }

    try {
      const { threadId } = await suggestionAgent.createThread(ctx, {
        userId,
        title: `daily-plan:${day}`,
      });

      const context = truncate({
        day,
        stateDocs: raw.stateDocs,
        activeTasks: raw.activeTasks,
        pausedTasks: raw.pausedTasks,
        calendarBlocks: raw.calendarBlocks,
      });

      const prompt = `You are generating a daily plan draft for ${day}.

CONTEXT:
${JSON.stringify(context, null, 2)}

RULES:
1. Return JSON only.
2. Provide 1-3 focus items.
3. Keep total planned minutes gentle; avoid overload.
4. If rest is needed, use a single focus item labeled "Rest & recovery".
5. Include a reason with { code, detail } explaining why this plan fits today.

OUTPUT FORMAT:
{ "day": "${day}", "focusItems": [{ "id": string, "label": string, "estimatedMinutes": number }], "reason": { "code": string, "detail": string } }`;

      const result = await suggestionAgent.generateText(
        ctx,
        { threadId, userId },
        {
          prompt,
        } as Parameters<typeof suggestionAgent.generateText>[2],
      );

      if (!result.text) {
        return { status: "success", source: "fallback", draft: fallback } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeDailyPlanDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Daily plan AI error:", error);
      return { status: "success", source: "fallback", draft: fallback } as const;
    }
  },
});

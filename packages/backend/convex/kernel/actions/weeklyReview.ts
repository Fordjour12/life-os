import type { LifeState } from "../../../../../src/kernel/types";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../../auth";
import { weeklyReviewAgent } from "../agents";
import { getISOWeekStartDate, formatYYYYMMDD, getDefaultWeekId } from "../helpers";
import { getMomentum, getLoad, normalizeWeeklyReviewDraft } from "../validators";
import type { WeeklyReviewRawData, WeeklyReviewDraft } from "../typesVex";

export const generateWeeklyReviewDraft = action({
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

    const raw = (await (ctx.runQuery as any)("kernel/queries:getWeeklyReviewRawData", {
      startDay,
      endDay,
      weekStartMs: weekStart.getTime(),
      weekEndMs: weekEndExclusive.getTime(),
    })) as WeeklyReviewRawData;

    const weekStates = raw.stateDocs.map((entry) => ({
      day: entry.day,
      state: entry.state as LifeState,
    }));

    const recoveryDays = weekStates.filter((entry) => entry.state?.mode === "recovery").length;
    const balancedDays = weekStates.filter((entry) => getLoad(entry.state) === "balanced").length;

    const weekEvents = raw.events;

    const tinyWins = weekEvents.filter((event) => {
      if (event.type !== "TASK_COMPLETED") return false;
      const estimateMin = Number((event.meta as { estimateMin?: number })?.estimateMin ?? 0);
      return Number.isFinite(estimateMin) && estimateMin <= 10;
    }).length;

    const planResets = weekEvents.filter((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    }).length;

    const plannedDays = weekStates.filter((entry) => (entry.state?.plannedMinutes ?? 0) > 0);
    const onTrackDays = plannedDays.filter((entry) => {
      const planned = entry.state?.plannedMinutes ?? 0;
      const completed = entry.state?.completedMinutes ?? 0;
      if (planned <= 0) return false;
      return completed >= planned * 0.8;
    }).length;
    const plannedDaysCount = plannedDays.length;
    const onTrackRatio = plannedDaysCount > 0 ? onTrackDays / plannedDaysCount : 0;

    const highlights: string[] = [];
    const sortedStates = [...weekStates].sort((a, b) => a.day.localeCompare(b.day));
    let momentumLift = 0;
    for (let index = 1; index < sortedStates.length; index += 1) {
      const prev = sortedStates[index - 1]?.state;
      const next = sortedStates[index]?.state;
      if (getMomentum(prev) === "stalled" && getMomentum(next) && getMomentum(next) !== "stalled") {
        momentumLift += 1;
      }
    }
    if (momentumLift > 0) {
      highlights.push("Momentum tended to return after small wins.");
    }

    const restCount = weekEvents.filter((event) => {
      if (event.type === "REST_ACCEPTED") return true;
      if (event.type !== "RECOVERY_PROTOCOL_USED") return false;
      return Boolean((event.meta as { didRest?: boolean })?.didRest);
    }).length;
    if (restCount > 0) {
      highlights.push("Rest days were followed by steadier momentum.");
    }

    const gentleReturns = weekEvents.filter((event) => {
      if (event.type !== "TASK_RESUMED") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "gentle_return";
    }).length;
    if (gentleReturns > 0) {
      highlights.push("Gentle returns helped re-enter paused tasks.");
    }
    if (plannedDaysCount >= 2 && onTrackRatio >= 0.7) {
      highlights.push("Planned focus mostly matched completed effort.");
    }

    const frictionPoints: string[] = [];
    const overloadedDays = weekStates.filter(
      (entry) => getLoad(entry.state) === "overloaded",
    ).length;
    if (overloadedDays > 0) {
      frictionPoints.push(
        `Overload showed up on ${overloadedDays} day${overloadedDays === 1 ? "" : "s"}.`,
      );
    }
    if (planResets > 0) {
      frictionPoints.push("Plan resets were used to protect capacity.");
    }
    if (plannedDaysCount >= 2 && onTrackRatio <= 0.3) {
      frictionPoints.push("Planned focus often exceeded what was completed.");
    }

    const reflectionQuestion = "What would you like to protect next week?";
    const { filterSafeStrings, isSafeCopy } = await import("../../identity/guardrails");
    const safeHighlights = filterSafeStrings(highlights).slice(0, 2);
    const safeFriction = filterSafeStrings(frictionPoints).slice(0, 3);
    const safeQuestion = isSafeCopy(reflectionQuestion)
      ? reflectionQuestion
      : "What would you like to protect next week?";

    const { safeCopy } = await import("../../identity/guardrails");
    const fallbackNarrative = safeCopy(
      "This week shows how small wins and rest help stabilize momentum.",
      "This week shows how small wins and rest help stabilize momentum.",
    );
    const fallback: WeeklyReviewDraft = {
      highlights: safeHighlights,
      frictionPoints: safeFriction,
      reflectionQuestion: safeQuestion,
      narrative: fallbackNarrative,
      reason: {
        code: "derived",
        detail: "Derived from your last week of patterns and events.",
      },
    };

    const aiEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!aiEnabled || !process.env.OPENROUTER_API_KEY) {
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
        week: weekId,
      } as const;
    }

    try {
      const { threadId } = await weeklyReviewAgent.createThread(ctx, {
        userId,
        title: `weekly-review:${weekId}`,
      });

      const prompt = `You are generating a weekly review draft.
CONTEXT:
- Week: ${weekId}
- Recovery days: ${recoveryDays}
- Balanced days: ${balancedDays}
- Tiny wins: ${tinyWins}
- Plan resets: ${planResets}
- Planned days: ${plannedDaysCount}
- On-track ratio: ${onTrackRatio.toFixed(2)}
- Highlights: ${JSON.stringify(safeHighlights)}
- Friction points: ${JSON.stringify(safeFriction)}

RULES:
1. Return JSON only.
2. Include at most 2 highlights and at most 3 friction points.
3. Keep tone supportive, no shame.
4. Provide a reflectionQuestion that is short and gentle.
5. Include a narrative summary in 1-2 sentences.
6. Include a reason with { code, detail } explaining why these insights fit.

OUTPUT FORMAT:
{ "highlights": string[], "frictionPoints": string[], "reflectionQuestion": string, "narrative": string, "reason": { "code": string, "detail": string } }`;

      const result = await weeklyReviewAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof weeklyReviewAgent.generateText>[2]);

      if (!result.text) {
        return {
          status: "success",
          source: "fallback",
          draft: fallback,
          week: weekId,
        } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeWeeklyReviewDraft(parsed, fallback);
      return { status: "success", source: "ai", draft, week: weekId } as const;
    } catch (error) {
      console.error("[vex-agents] Weekly review AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
        week: weekId,
      } as const;
    }
  },
});

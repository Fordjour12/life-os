import type { LifeState } from "../../../../../src/kernel/types";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../../auth";
import { suggestionAgent } from "../agents";
import { getTodayYYYYMMDD } from "../helpers";
import {
  normalizeNextStepDraft,
} from "../validators";
import type { NextStepRawData, NextStepDraft } from "../typesVex";

export const generateNextStepDraft = action({
  args: {
    taskId: v.id("tasks"),
    day: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();

    const raw = await (ctx.runQuery as any)(
      "kernel/vexAgents/getNextStepRawData",
      { taskId, day: targetDay }
    ) as NextStepRawData;

    if (!raw.task) {
      return { status: "error", reason: "task_not_found" } as const;
    }

    const fallback: NextStepDraft = {
      taskId: raw.task._id,
      step: "Open the task and write the very next physical action.",
      estimateMin: Math.max(
        5,
        Math.min(10, Math.round(raw.task.estimateMin / 2 || 10)),
      ),
      reason: {
        code: "micro_step",
        detail: "Small steps reduce decision load and build momentum.",
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
        title: `next-step:${taskId}`,
      });

      const prompt = `You are generating a next-step micro plan for a single task.

TASK:
- Title: ${raw.task.title}
- Estimate (min): ${raw.task.estimateMin}
- Status: ${raw.task.status}

STATE:
- Day: ${targetDay}
- Mode: ${(raw.stateDoc?.state as { mode?: string })?.mode ?? "unknown"}
- Load: ${(raw.stateDoc?.state as { load?: string })?.load ?? "unknown"}

RECENT EVENTS:
${JSON.stringify(raw.events)}

RULES:
1. Return JSON only.
2. Provide a single concrete step.
3. Keep it small (<= 10 minutes).
4. Tone is gentle, recovery-first.
5. Include a reason with { code, detail }.

OUTPUT FORMAT:
{ "step": string, "estimateMin": number, "reason": { "code": string, "detail": string } }`;

      const result = await suggestionAgent.generateText(
        ctx,
        { threadId, userId },
        {
          prompt,
        } as Parameters<typeof suggestionAgent.generateText>[2],
      );

      if (!result.text) {
        return {
          status: "success",
          source: "fallback",
          draft: fallback,
        } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeNextStepDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Next step AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
      } as const;
    }
  },
});

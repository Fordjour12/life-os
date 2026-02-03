import type { LifeState } from "../../../../../src/kernel/types";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../../auth";
import { journalAgent } from "../agents";
import { getTodayYYYYMMDD } from "../helpers";
import { normalizeRecoveryProtocolDraft } from "../validators";
import { getBoundaryFlagsFromBlocks, normalizeOffsetMinutes } from "../stabilization";
import type { RecoveryProtocolRawData, RecoveryProtocolDraft } from "../typesVex";

export const generateRecoveryProtocolDraft = action({
  args: {
    day: v.optional(v.string()),
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { day, tzOffsetMinutes }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();
    const offset = normalizeOffsetMinutes(tzOffsetMinutes ?? 0);

    const raw = (await (ctx.runQuery as any)("kernel/vexAgents/getRecoveryProtocolRawData", {
      day: targetDay,
    })) as RecoveryProtocolRawData;

    const boundaries = getBoundaryFlagsFromBlocks(raw.calendarBlocks, Date.now(), offset);

    const fallback: RecoveryProtocolDraft = {
      day: targetDay,
      title: "Recovery protocol",
      steps: ["Drink water.", "Slow breath for 2 minutes.", "Take 10 minutes of rest."],
      minutes: 15,
      reason: {
        code: "recovery",
        detail: "Lowering load helps stabilize energy and attention.",
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
      const { threadId } = await journalAgent.createThread(ctx, {
        userId,
        title: `recovery:${targetDay}`,
      });

      const prompt = `You are generating a brief recovery protocol.

CONTEXT:
- Day: ${targetDay}
- Mode: ${(raw.stateDoc?.state as { mode?: string })?.mode ?? "unknown"}
- Load: ${(raw.stateDoc?.state as { load?: string })?.load ?? "unknown"}
- Boundaries: ${JSON.stringify(boundaries)}
- Recent events: ${JSON.stringify(raw.events)}

RULES:
1. Return JSON only.
2. Provide a short title and 1-3 steps.
3. Steps must be gentle and doable within 20 minutes.
4. Include a reason with { code, detail }.

OUTPUT FORMAT:
{ "title": string, "steps": string[], "minutes": number, "reason": { "code": string, "detail": string } }`;

      const result = await journalAgent.generateText(ctx, { threadId, userId }, {
        prompt,
      } as Parameters<typeof journalAgent.generateText>[2]);

      if (!result.text) {
        return {
          status: "success",
          source: "fallback",
          draft: fallback,
        } as const;
      }

      const parsed = JSON.parse(result.text) as unknown;
      const draft = normalizeRecoveryProtocolDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Recovery AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
      } as const;
    }
  },
});

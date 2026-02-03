import type { LifeState } from "../../../../../src/kernel/types";
import { action } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../../auth";
import { journalAgent } from "../agents";
import { getTodayYYYYMMDD, truncate } from "../helpers";
import { pickPrompt, normalizeJournalPromptDraft, journalReasonDetails } from "../validators";
import type { JournalPromptRawData, JournalPromptDraft } from "../typesVex";

export const generateJournalPromptDraft = action({
  args: {
    day: v.optional(v.string()),
  },
  handler: async (ctx, { day }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();

    const raw = (await (ctx.runQuery as any)("kernel/vexAgents:getJournalPromptRawData", {
      day: targetDay,
    })) as JournalPromptRawData;

    if (raw.skip) {
      return {
        status: "success",
        source: "quiet",
        draft: {
          day: targetDay,
          prompt: pickPrompt(targetDay),
          reason: {
            code: "quiet",
            detail: journalReasonDetails.quiet,
          },
          quiet: true,
        },
      } as const;
    }

    const stateDoc = raw.stateDoc;
    const suggestions = raw.suggestions;
    const events = raw.events;

    const hasReflectionSuggestion = suggestions.some(
      (suggestion) => suggestion.type === "DAILY_REVIEW_QUESTION" && suggestion.status === "new",
    );
    const recoveryMode =
      stateDoc?.state && (stateDoc.state as { mode?: string }).mode === "recovery";
    const hadPlanReset = events.some((event) => {
      if (event.type === "PLAN_RESET_APPLIED") return true;
      if (event.type !== "PLAN_SET") return false;
      const reason = (event.meta as { reason?: string })?.reason;
      return reason === "reset" || reason === "recovery";
    });
    const usedMicroRecovery = events.some((event) => event.type === "RECOVERY_PROTOCOL_USED");

    const shouldPrompt = Boolean(
      hasReflectionSuggestion || recoveryMode || hadPlanReset || usedMicroRecovery,
    );

    if (!shouldPrompt) {
      return {
        status: "success",
        source: "quiet",
        draft: {
          day: targetDay,
          prompt: null,
          reason: null,
          quiet: false,
        },
      } as const;
    }

    const reasonCode = hasReflectionSuggestion
      ? "reflection"
      : recoveryMode
        ? "recovery"
        : hadPlanReset
          ? "plan_reset"
          : "micro_recovery";
    const fallback: JournalPromptDraft = {
      day: targetDay,
      prompt: pickPrompt(targetDay),
      reason: {
        code: reasonCode,
        detail: journalReasonDetails[reasonCode] ?? "A gentle check-in can help today.",
      },
      quiet: false,
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
        title: `journal:${targetDay}`,
      });

      const recentEvents = events
        .slice(-25)
        .map((event) => truncate({ type: event.type, ts: event.ts, meta: event.meta }));
      const prompt = `You are generating a single gentle journal prompt.

CONTEXT:
- Day: ${targetDay}
- Reason: ${reasonCode}
- Recovery mode: ${recoveryMode ? "yes" : "no"}
- Reflection suggested: ${hasReflectionSuggestion ? "yes" : "no"}
- Recent events: ${JSON.stringify(recentEvents)}

RULES:
1. Return JSON only.
2. Prompt must be a single short sentence.
3. Tone is gentle, recovery-first, no shame.
4. Include a reason object with { code, detail } using the provided reason code.

OUTPUT FORMAT:
{ "prompt": string, "reason": { "code": string, "detail": string }, "quiet": false }`;

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
      const draft = normalizeJournalPromptDraft(parsed, fallback);
      return { status: "success", source: "ai", draft } as const;
    } catch (error) {
      console.error("[vex-agents] Journal AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
      } as const;
    }
  },
});

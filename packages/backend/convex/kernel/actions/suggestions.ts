import { internalAction } from "../../_generated/server";
import { v } from "convex/values";
import { requireAuthUser } from "../../auth";
import { suggestionAgent } from "../agents";
import { buildAiContext, validateAiSuggestion } from "../validators";
import { DAILY_SUGGESTION_CAP } from "../stabilization";
import { sanitizeSuggestionCopy } from "../../identity/guardrails";
import type { AiSuggestRawData, AiSuggestContext, KernelSuggestion } from "../typesVex";
import type { ActionCtx } from "../../_generated/server";

async function callAiModel(
  ctx: ActionCtx,
  userId: string,
  context: AiSuggestContext,
): Promise<KernelSuggestion[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("[vex-agents] No OPENROUTER_API_KEY configured, skipping AI call");
    return [];
  }

  try {
    const { threadId } = await suggestionAgent.createThread(ctx, {
      userId,
      title: `ai-suggest:${context.day}`,
    });

    const prompt = `CONTEXT:
- Day: ${context.day}
- Current State: ${JSON.stringify(context.state, null, 2)}
- Active Tasks: ${context.tasks.active.length}
- Paused Tasks: ${context.tasks.paused.length}
- Has Plan: ${context.plan ? "Yes" : "No"}
- Boundaries: ${JSON.stringify(context.boundaries)}

RULES:
1. Only suggest up to ${DAILY_SUGGESTION_CAP} items total
2. Priority range: 1-5 (5 = highest)
3. Each suggestion must have a clear, kind reason
4. Never suggest anything that would shame the user
5. If in recovery mode, prioritize MICRO_RECOVERY_PROTOCOL
6. Respect boundaries (no TINY_WIN in late night)
7. Use existing cooldown keys to avoid repetition

ALLOWED SUGGESTION TYPES:
- PLAN_RESET: When overloaded, suggest resetting plan (mode: "reset" or "rest")
- TINY_WIN: Small 10-min task to build momentum
- DAILY_REVIEW_QUESTION: Gentle reflection prompt
- GENTLE_RETURN: Bring back a paused task when there's room
- MICRO_RECOVERY_PROTOCOL: Full recovery mode suggestion
- NEXT_STEP: Suggest next logical action

OUTPUT FORMAT: JSON array of suggestions with fields: day, type, priority, reason {code, detail}, payload, cooldownKey. Return JSON only, no extra text.

Generate suggestions based on:
${JSON.stringify(context, null, 2)}`;

    const result = await suggestionAgent.generateText(ctx, { threadId, userId }, {
      prompt,
    } as Parameters<typeof suggestionAgent.generateText>[2]);

    if (!result.text) {
      console.log("[vex-agents] Empty response from AI");
      return [];
    }

    const suggestions = JSON.parse(result.text) as unknown[];
    if (!Array.isArray(suggestions)) {
      console.log("[vex-agents] AI response not an array");
      return [];
    }

    return suggestions.map(validateAiSuggestion).filter((s): s is KernelSuggestion => s !== null);
  } catch (error) {
    console.error("[vex-agents] Error calling AI:", error);
    return [];
  }
}

export const generateAiSuggestions = internalAction({
  args: {
    day: v.string(),
    tzOffsetMinutes: v.optional(v.number()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, { day, tzOffsetMinutes, source }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const now = Date.now();

    const isEnabled = process.env.AI_SUGGESTIONS_ENABLED === "true";
    if (!isEnabled) {
      console.log(
        `[vex-agents] AI_SUGGESTIONS_ENABLED=false, skipping for user=${userId}, day=${day}`,
      );
      return { status: "skipped", reason: "feature_disabled" };
    }

    console.log(
      `[vex-agents] Starting generation: user=${userId}, day=${day}, source=${source ?? "unknown"}`,
    );

    try {
      const raw = (await (ctx.runQuery as any)("kernel/queries:getAiSuggestRawData", {
        day,
      })) as AiSuggestRawData;
      const context = buildAiContext(raw, day, tzOffsetMinutes ?? 0);
      if (!context) {
        console.log(`[vex-agents] No state found for day=${day}, skipping`);
        return { status: "skipped", reason: "no_state" };
      }

      const inputSize = JSON.stringify(context).length;
      console.log(`[vex-agents] Context built: input_size=${inputSize} chars`);

      const aiSuggestions = await callAiModel(ctx, userId, context);
      console.log(`[vex-agents] AI returned ${aiSuggestions.length} suggestions`);

      if (aiSuggestions.length === 0) {
        return { status: "success", count: 0 };
      }

      const existingSugs = (await (ctx.runQuery as any)("kernel/queries:getSuggestionsForDay", {
        day,
      })) as AiSuggestRawData["existingSuggestions"];

      const existingNewCount = existingSugs.filter((s) => s.status === "new").length;
      if (existingNewCount > 0) {
        console.log(
          `[vex-agents] Existing new suggestions found (${existingNewCount}), skipping insertion`,
        );
        return { status: "skipped", reason: "existing_new_suggestions" };
      }

      const remainingSlots = Math.max(0, DAILY_SUGGESTION_CAP - existingSugs.length);
      if (remainingSlots === 0) {
        console.log(`[vex-agents] Daily cap reached (${DAILY_SUGGESTION_CAP}), skipping insertion`);
        return { status: "skipped", reason: "daily_cap_reached" };
      }

      const TWELVE_HOURS = 12 * 60 * 60 * 1000;
      const recentlySuggested = (cooldownKey?: string) => {
        if (!cooldownKey) return false;
        return existingSugs.some(
          (s) => s.cooldownKey === cooldownKey && now - s.createdAt < TWELVE_HOURS,
        );
      };

      const cappedSuggestions = aiSuggestions.slice(0, remainingSlots);
      let insertedCount = 0;

      for (const suggestion of cappedSuggestions) {
        if (recentlySuggested(suggestion.cooldownKey)) {
          console.log(
            `[vex-agents] Skipping suggestion with cooldownKey=${suggestion.cooldownKey}`,
          );
          continue;
        }

        const safeSuggestion = sanitizeSuggestionCopy(suggestion);

        await (ctx.runMutation as any)("kernel/queries:insertSuggestion", {
          suggestion: safeSuggestion,
          createdAt: now,
          updatedAt: now,
        });

        insertedCount++;
        console.log(
          `[vex-agents] Inserted suggestion: type=${safeSuggestion.type}, priority=${safeSuggestion.priority}`,
        );
      }

      console.log(
        `[vex-agents] Completed: inserted=${insertedCount}, total_new=${existingSugs.length + insertedCount}`,
      );
      return { status: "success", count: insertedCount };
    } catch (error) {
      console.error(`[vex-agents] Error in generateAiSuggestions:`, error);
      return { status: "error", error: String(error) };
    }
  },
});

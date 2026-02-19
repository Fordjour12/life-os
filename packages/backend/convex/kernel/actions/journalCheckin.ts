import { action } from "../../_generated/server";
import { v } from "convex/values";

import { requireAuthUser } from "../../auth";
import { journalAgent } from "../agents";
import { getTodayYYYYMMDD } from "../helpers";

type Draft = {
  day: string;
  question: string;
  grade: {
    label: "A" | "B" | "C";
    score: number;
    reason: string;
  };
  improvements: string[];
  reason: {
    code: string;
    detail: string;
  };
};

function scoreToLabel(score: number): "A" | "B" | "C" {
  if (score >= 80) return "A";
  if (score >= 55) return "B";
  return "C";
}

function clampScore(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fallbackDraft(day: string): Draft {
  return {
    day,
    question: "What part of today felt supportive, and what felt heavy?",
    grade: {
      label: "B",
      score: 68,
      reason: "Today had mixed load. You kept movement and can simplify tomorrow.",
    },
    improvements: [
      "Pick one task under 15 minutes for your first win tomorrow.",
      "Schedule one explicit recovery block before your busiest hour.",
      "Reduce tomorrow's plan to 1-3 focus items.",
    ],
    reason: {
      code: "daily_reflection",
      detail: "A short review helps convert the day into clear next actions.",
    },
  };
}

function normalizeDraft(input: unknown, fallback: Draft): Draft {
  if (!input || typeof input !== "object") return fallback;
  const value = input as Record<string, unknown>;
  const question = typeof value.question === "string" ? value.question.trim() : "";
  const gradeValue = value.grade as { label?: unknown; score?: unknown; reason?: unknown } | undefined;
  const improvementsRaw = Array.isArray(value.improvements) ? value.improvements : [];

  const labelRaw = typeof gradeValue?.label === "string" ? gradeValue.label.toUpperCase() : "B";
  const inputLabel = labelRaw === "A" || labelRaw === "B" || labelRaw === "C" ? labelRaw : "B";
  const scoreNumber = Number(gradeValue?.score);
  const score = clampScore(scoreNumber, fallback.grade.score);
  const label = scoreToLabel(score);
  const gradeReason =
    typeof gradeValue?.reason === "string" && gradeValue.reason.trim().length > 0
      ? gradeValue.reason.trim()
      : fallback.grade.reason;

  const improvements = improvementsRaw
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .slice(0, 3);

  return {
    day: fallback.day,
    question: question || fallback.question,
    grade: {
      label: label ?? inputLabel,
      score,
      reason: gradeReason,
    },
    improvements: improvements.length ? improvements : fallback.improvements,
    reason: fallback.reason,
  };
}

export const generateDailyJournalCheckin = action({
  args: {
    day: v.optional(v.string()),
    tzOffsetMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { day, tzOffsetMinutes }) => {
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const targetDay = day ?? getTodayYYYYMMDD();

    const fallback = fallbackDraft(targetDay);

    const todayData = (await (ctx.runQuery as any)("kernel/commands:getToday", {
      tzOffsetMinutes: tzOffsetMinutes ?? 0,
    })) as
      | {
          day?: string;
          state?: {
            mode?: string;
            load?: string;
            momentum?: string;
            focusCapacity?: string;
          };
          eventSummary?: { habitDone?: number; habitMissed?: number; expenseAdded?: number };
          plan?: { focusItems?: Array<{ label?: string; estimatedMinutes?: number }> } | null;
        }
      | null;

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
        title: `journal-checkin:${targetDay}`,
      });

      const prompt = `You are creating a gentle daily check-in.

CONTEXT:
- Day: ${targetDay}
- Mode: ${todayData?.state?.mode ?? "unknown"}
- Load: ${todayData?.state?.load ?? "unknown"}
- Momentum: ${todayData?.state?.momentum ?? "unknown"}
- Focus capacity: ${todayData?.state?.focusCapacity ?? "unknown"}
- Event summary: ${JSON.stringify(todayData?.eventSummary ?? {})}
- Plan items: ${JSON.stringify(todayData?.plan?.focusItems ?? [])}

RULES:
1. Return JSON only.
2. Ask one open-ended journal question about the day.
3. Include a grade with label A/B/C and score 0-100.
4. Grade must be supportive, never shaming.
5. Provide 1-3 practical improvements for tomorrow.
6. Use this recovery-first rubric:
   - A (80-100): Day felt stable/supportive; progress happened even if imperfect.
   - B (55-79): Mixed day; some friction, but still recoverable with small adjustments.
   - C (0-54): High-friction day; focus on rest, load reduction, and one tiny next step.
7. Never use punitive language, blame, or "failure" framing.

OUTPUT FORMAT:
{
  "question": string,
  "grade": { "label": "A" | "B" | "C", "score": number, "reason": string },
  "improvements": string[]
}`;

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
      return {
        status: "success",
        source: "ai",
        draft: normalizeDraft(parsed, fallback),
      } as const;
    } catch (error) {
      console.error("[vex-agents] Journal checkin AI error:", error);
      return {
        status: "success",
        source: "fallback",
        draft: fallback,
      } as const;
    }
  },
});

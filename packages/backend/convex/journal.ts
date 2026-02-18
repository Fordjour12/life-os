import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAuthUser } from "./auth";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function assertDay(day: string) {
  if (!DAY_PATTERN.test(day)) throw new Error("Day must be YYYY-MM-DD");
}

function dayBounds(day: string) {
  const start = new Date(`${day}T00:00:00.000Z`).getTime();
  return { start, end: start + DAY_MS };
}

export const saveDailyCheckin = mutation({
  args: {
    day: v.string(),
    reflection: v.string(),
    gradeLabel: v.union(v.literal("A"), v.literal("B"), v.literal("C")),
    gradeScore: v.number(),
    gradeReason: v.string(),
    improvement: v.optional(v.string()),
    question: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDay(args.day);
    const user = await requireAuthUser(ctx);
    const userId = user._id;
    const now = Date.now();

    const trimmedReflection = args.reflection.trim();
    if (!trimmedReflection) {
      throw new Error("Reflection is required");
    }

    const idempotencyKey = args.idempotencyKey ?? `journal-checkin:${args.day}:${now}`;

    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) => q.eq("userId", userId).eq("idempotencyKey", idempotencyKey))
      .first();

    if (existing) {
      return { ok: true, deduped: true } as const;
    }

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "JOURNAL_CHECKIN_SAVED",
      meta: {
        day: args.day,
        reflection: trimmedReflection,
        grade: {
          label: args.gradeLabel,
          score: Math.max(0, Math.min(100, Math.round(args.gradeScore))),
          reason: args.gradeReason,
        },
        improvement: args.improvement,
        question: args.question,
      },
      idempotencyKey,
    });

    return { ok: true } as const;
  },
});

export const getDailyCheckins = query({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    assertDay(day);
    const user = await requireAuthUser(ctx);
    const { start, end } = dayBounds(day);

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", (q) => q.eq("userId", user._id).gte("ts", start).lt("ts", end))
      .collect();

    return events
      .filter((event) => event.type === "JOURNAL_CHECKIN_SAVED")
      .map((event) => {
        const meta = (event.meta ?? {}) as {
          day?: string;
          reflection?: string;
          grade?: { label?: "A" | "B" | "C"; score?: number; reason?: string };
          improvement?: string;
          question?: string;
        };

        return {
          _id: event._id,
          day: typeof meta.day === "string" ? meta.day : day,
          reflection: typeof meta.reflection === "string" ? meta.reflection : "",
          grade: {
            label: meta.grade?.label ?? "B",
            score: Number(meta.grade?.score ?? 0),
            reason: meta.grade?.reason ?? "",
          },
          improvement: typeof meta.improvement === "string" ? meta.improvement : undefined,
          question: typeof meta.question === "string" ? meta.question : undefined,
          createdAt: event.ts,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 7);
  },
});

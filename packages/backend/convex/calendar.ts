import { v } from "convex/values";

import { mutation, query } from "./_generated/server";

const DAILY_CAPACITY_MIN = 480;
const NON_FOCUS_WEIGHT = 0.6;
const MINUTES_PER_DAY = 24 * 60;

function getUserId(): string {
  return "user_me";
}

function assertDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error("Day must be YYYY-MM-DD");
  }
}

function assertMinutes(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > MINUTES_PER_DAY) {
    throw new Error(`${label} must be between 0 and 1440`);
  }
}

export const addBlock = mutation({
  args: {
    day: v.string(),
    startMin: v.number(),
    endMin: v.number(),
    kind: v.union(v.literal("busy"), v.literal("focus"), v.literal("rest"), v.literal("personal")),
    source: v.union(v.literal("manual"), v.literal("imported")),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = getUserId();
    const now = Date.now();

    const day = String(args.day).trim();
    assertDay(day);

    const startMin = Number(args.startMin);
    const endMin = Number(args.endMin);
    assertMinutes(startMin, "Start minute");
    assertMinutes(endMin, "End minute");
    if (endMin <= startMin) {
      throw new Error("End minute must be after start minute");
    }

    const title = args.title ? String(args.title).trim() : undefined;
    const notes = args.notes ? String(args.notes).trim() : undefined;
    const externalId = args.externalId ? String(args.externalId).trim() : undefined;

    const blockId = await ctx.db.insert("calendarBlocks", {
      userId,
      day,
      startMin,
      endMin,
      kind: args.kind,
      source: args.source,
      title,
      notes,
      externalId,
      createdAt: now,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "CAL_BLOCK_ADDED",
      meta: { blockId, day, startMin, endMin, kind: args.kind },
      idempotencyKey: `cal_block_added:${blockId}`,
    });

    return { ok: true, blockId };
  },
});

export const removeBlock = mutation({
  args: {
    blockId: v.id("calendarBlocks"),
  },
  handler: async (ctx, { blockId }) => {
    const userId = getUserId();
    const now = Date.now();

    const block = await ctx.db.get(blockId);
    if (!block || block.userId !== userId) {
      throw new Error("Calendar block not found");
    }

    await ctx.db.delete(blockId);

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "CAL_BLOCK_REMOVED",
      meta: { blockId },
      idempotencyKey: `cal_block_removed:${blockId}`,
    });

    return { ok: true };
  },
});

export const listBlocksForDay = query({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();
    const dayValue = String(day).trim();
    assertDay(dayValue);

    const blocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayValue))
      .collect();

    return blocks.sort((a, b) => a.startMin - b.startMin);
  },
});

export const getBlockById = query({
  args: {
    blockId: v.id("calendarBlocks"),
  },
  handler: async (ctx, { blockId }) => {
    const userId = getUserId();
    const block = await ctx.db.get(blockId);
    if (!block || block.userId !== userId) {
      throw new Error("Calendar block not found");
    }
    return block;
  },
});

export const updateBlock = mutation({
  args: {
    blockId: v.id("calendarBlocks"),
    day: v.string(),
    startMin: v.number(),
    endMin: v.number(),
    kind: v.union(v.literal("busy"), v.literal("focus"), v.literal("rest"), v.literal("personal")),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, { blockId, day, startMin, endMin, kind, title, notes, externalId }) => {
    const userId = getUserId();
    const now = Date.now();

    const block = await ctx.db.get(blockId);
    if (!block || block.userId !== userId) {
      throw new Error("Calendar block not found");
    }

    const dayValue = String(day).trim();
    assertDay(dayValue);

    assertMinutes(startMin, "Start minute");
    assertMinutes(endMin, "End minute");
    if (endMin <= startMin) {
      throw new Error("End minute must be after start minute");
    }

    const trimmedTitle = title ? String(title).trim() : undefined;
    const trimmedNotes = notes ? String(notes).trim() : undefined;
    const trimmedExternalId = externalId ? String(externalId).trim() : undefined;

    await ctx.db.patch(blockId, {
      day: dayValue,
      startMin,
      endMin,
      kind,
      title: trimmedTitle,
      notes: trimmedNotes,
      externalId: trimmedExternalId,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "CAL_BLOCK_UPDATED",
      meta: { blockId, day: dayValue, startMin, endMin, kind },
      idempotencyKey: `cal_block_updated:${blockId}:${now}`,
    });

    return { ok: true };
  },
});

export const importBlocks = mutation({
  args: {
    blocks: v.array(
      v.object({
        day: v.string(),
        startMin: v.number(),
        endMin: v.number(),
        kind: v.union(
          v.literal("busy"),
          v.literal("focus"),
          v.literal("rest"),
          v.literal("personal"),
        ),
        title: v.optional(v.string()),
        notes: v.optional(v.string()),
        externalId: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { blocks }) => {
    const userId = getUserId();
    const now = Date.now();

    let inserted = 0;
    let skipped = 0;

    for (const block of blocks) {
      const day = String(block.day).trim();
      assertDay(day);

      assertMinutes(block.startMin, "Start minute");
      assertMinutes(block.endMin, "End minute");
      if (block.endMin <= block.startMin) {
        skipped += 1;
        continue;
      }

      const externalId = block.externalId ? String(block.externalId).trim() : undefined;
      if (externalId) {
        const existing = await ctx.db
          .query("calendarBlocks")
          .withIndex("by_user_external", (q) => q.eq("userId", userId).eq("externalId", externalId))
          .first();
        if (existing) {
          skipped += 1;
          continue;
        }
      }

      const blockId = await ctx.db.insert("calendarBlocks", {
        userId,
        day,
        startMin: block.startMin,
        endMin: block.endMin,
        kind: block.kind,
        source: "imported",
        title: block.title ? String(block.title).trim() : undefined,
        notes: block.notes ? String(block.notes).trim() : undefined,
        externalId,
        createdAt: now,
      });

      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "CAL_BLOCK_ADDED",
        meta: { blockId, day, startMin: block.startMin, endMin: block.endMin, kind: block.kind },
        idempotencyKey: externalId
          ? `cal_block_imported:${externalId}`
          : `cal_block_imported:${blockId}`,
      });

      inserted += 1;
    }

    return { inserted, skipped };
  },
});

export const getFreeMinutesForDay = query({
  args: {
    day: v.string(),
  },
  handler: async (ctx, { day }) => {
    const userId = getUserId();
    const dayValue = String(day).trim();
    assertDay(dayValue);

    const blocks = await ctx.db
      .query("calendarBlocks")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", dayValue))
      .collect();

    const busyMinutes = blocks
      .filter((block) => block.kind === "busy")
      .reduce((total, block) => total + (block.endMin - block.startMin), 0);

    const focusMinutes = blocks
      .filter((block) => block.kind === "focus")
      .reduce((total, block) => total + (block.endMin - block.startMin), 0);

    const freeMinutes = Math.max(0, DAILY_CAPACITY_MIN - busyMinutes);
    const focusWithinFree = Math.min(freeMinutes, focusMinutes);
    const nonFocusFree = Math.max(0, freeMinutes - focusWithinFree);
    const effectiveFreeMinutes = Math.round(focusWithinFree + nonFocusFree * NON_FOCUS_WEIGHT);

    return {
      day: dayValue,
      freeMinutes,
      effectiveFreeMinutes,
      focusMinutes,
      busyMinutes,
      capacityMinutes: DAILY_CAPACITY_MIN,
    };
  },
});

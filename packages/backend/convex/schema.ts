import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  events: defineTable({
    userId: v.string(),
    ts: v.number(),
    type: v.string(),
    meta: v.any(),
    idempotencyKey: v.string(),
  })
    .index("by_user_ts", ["userId", "ts"])
    .index("by_user_idem", ["userId", "idempotencyKey"]),

  stateDaily: defineTable({
    userId: v.string(),
    day: v.string(),
    state: v.any(),
    updatedAt: v.number(),
  }).index("by_user_day", ["userId", "day"]),

  suggestions: defineTable({
    userId: v.string(),
    day: v.string(),
    type: v.string(),
    priority: v.number(),
    reason: v.any(),
    payload: v.any(),
    status: v.string(),
    cooldownKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_day", ["userId", "day"])
    .index("by_user_status", ["userId", "status"]),

  tasks: defineTable({
    userId: v.string(),
    title: v.string(),
    notes: v.optional(v.string()),
    estimateMin: v.number(),
    priority: v.number(),
    status: v.string(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
    pausedAt: v.optional(v.number()),
    pauseReason: v.optional(v.string()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_created", ["userId", "createdAt"]),

  userKernelPrefs: defineTable({
    userId: v.string(),
    lastGentleReturnTaskId: v.optional(v.id("tasks")),
    weeklyPlannerHardMode: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  calendarBlocks: defineTable({
    userId: v.string(),
    day: v.string(),
    startMin: v.number(),
    endMin: v.number(),
    kind: v.union(v.literal("busy"), v.literal("focus"), v.literal("rest"), v.literal("personal")),
    source: v.union(v.literal("manual"), v.literal("imported")),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    externalId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user_day", ["userId", "day"])
    .index("by_user_external", ["userId", "externalId"]),

  budgets: defineTable({
    userId: v.string(),
    category: v.string(),
    monthlyLimit: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_category", ["userId", "category"]),
});

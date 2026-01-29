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
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_created", ["userId", "createdAt"]),
});

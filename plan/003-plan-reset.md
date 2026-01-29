**Plan Reset** is the feature that turns your app from “tasks” into a real **Life OS**.

We’ll implement it as a **safe, gentle, reversible** flow:

- Detect overload → suggest Plan Reset
- User taps “Apply Plan Reset”
- System:
  - chooses **1–2 doable tasks** for today
  - **pauses** the rest (not deletes)
  - emits events so the kernel learns
  - updates state + suggestions

Below is the full build blueprint (Convex + RN).

---

# 1) Add task fields needed for Plan Reset

Update your task model to support “paused for today” and “carry later”.

### Update `tasks` table in `convex/schema.ts`

Add these optional fields:

```ts
pausedAt: v.optional(v.number()),
pauseReason: v.optional(v.string()), // "plan_reset"
```

So:

```ts
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
```

---

# 2) Add new kernel events for Plan Reset

Update your shared types `src/kernel/types.ts`:

```ts
export type KernelEvent =
  | {
      type: "TASK_CREATED";
      ts: number;
      meta: { taskId: string; estimateMin: number };
    }
  | {
      type: "TASK_COMPLETED";
      ts: number;
      meta: { taskId: string; estimateMin: number };
    }
  | {
      type: "TASK_PAUSED";
      ts: number;
      meta: { taskId: string; reason: "plan_reset" };
    }
  | {
      type: "PLAN_RESET_APPLIED";
      ts: number;
      meta: { day: string; keptTaskIds: string[]; pausedTaskIds: string[] };
    }
  | {
      type: "SUGGESTION_FEEDBACK";
      ts: number;
      meta: { suggestionId: string; vote: "up" | "down" | "ignore" };
    };
```

And add a new command type:

```ts
export type KernelCommand =
  | {
      cmd: "create_task";
      input: {
        title: string;
        estimateMin: number;
        priority: 1 | 2 | 3;
        notes?: string;
      };
      idempotencyKey: string;
    }
  | { cmd: "complete_task"; input: { taskId: string }; idempotencyKey: string }
  | {
      cmd: "apply_plan_reset";
      input: { day: string; keepCount?: 1 | 2 };
      idempotencyKey: string;
    }
  | {
      cmd: "submit_feedback";
      input: { suggestionId: string; vote: "up" | "down" | "ignore" };
      idempotencyKey: string;
    };
```

---

# 3) Implement “Apply Plan Reset” mutation in Convex

Create: `convex/kernel/planReset.ts`

This mutation:

- picks the easiest tasks (lowest estimate) or priority-weighted
- keeps 1–2 tasks
- pauses the rest
- emits events
- returns what it did

```ts
import { mutation } from "convex/server";
import { v } from "convex/values";

function getUserId() {
  return "user_me"; // replace with auth later
}

export const applyPlanReset = mutation({
  args: {
    day: v.string(), // YYYY-MM-DD
    keepCount: v.optional(v.union(v.literal(1), v.literal(2))),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, { day, keepCount, idempotencyKey }) => {
    const userId = getUserId();
    const now = Date.now();
    const keepN = keepCount ?? 1;

    // idempotency guard (reuse events table you already have)
    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) =>
        q.eq("userId", userId).eq("idempotencyKey", idempotencyKey),
      )
      .first();
    if (existing) return { ok: true, deduped: true };

    // Get active tasks
    const activeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .collect();

    if (activeTasks.length === 0) {
      // Still record that a reset was attempted (optional)
      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "PLAN_RESET_APPLIED",
        meta: { day, keptTaskIds: [], pausedTaskIds: [] },
        idempotencyKey,
      });
      return { ok: true, keptTaskIds: [], pausedTaskIds: [] };
    }

    // Sort by "doable first":
    // 1) smaller estimate first
    // 2) higher priority first (priority 1 is highest? here we treat 1 as highest)
    const sorted = [...activeTasks].sort((a, b) => {
      if (a.estimateMin !== b.estimateMin) return a.estimateMin - b.estimateMin;
      return (a.priority ?? 2) - (b.priority ?? 2);
    });

    const kept = sorted.slice(0, keepN);
    const paused = sorted.slice(keepN);

    // Pause the rest (gentle, reversible)
    for (const t of paused) {
      await ctx.db.patch(t._id, {
        status: "paused",
        pausedAt: now,
        pauseReason: "plan_reset",
      });

      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "TASK_PAUSED",
        meta: { taskId: t._id, reason: "plan_reset" },
        idempotencyKey: `${idempotencyKey}:pause:${t._id}`, // deterministic sub-keys
      });
    }

    // Emit Plan Reset applied event
    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "PLAN_RESET_APPLIED",
      meta: {
        day,
        keptTaskIds: kept.map((t) => t._id),
        pausedTaskIds: paused.map((t) => t._id),
      },
      idempotencyKey,
    });

    return {
      ok: true,
      keptTaskIds: kept.map((t) => t._id),
      pausedTaskIds: paused.map((t) => t._id),
    };
  },
});
```

---

# 4) Make the policy suggestion actually actionable

In your policies (`convex/kernel/policies.ts`), ensure the Plan Reset suggestion includes `keepCount`:

```ts
out.push({
  day,
  type: "PLAN_RESET",
  priority: 5,
  reason: {
    code: "OVERLOAD_GUARD",
    detail: "Your plan is heavier than your available time/energy.",
  },
  payload: { keepCount: 1 }, // or 2 if you want
  status: "new",
  cooldownKey: "plan_reset",
});
```

---

# 5) Hook Plan Reset into your kernel command entrypoint (optional clean path)

If you’re using a single `executeCommand()`, add a branch for `apply_plan_reset`:

```ts
else if (command.cmd === "apply_plan_reset") {
  // call applyPlanReset logic or inline it
}
```

But simplest for now: call `applyPlanReset` directly from the UI.

---

# 6) Update reducer so Plan Reset affects state (small but meaningful)

In `computeDailyState`:

- treat paused tasks as reducing planned load (later you’ll compute planned from active tasks anyway)
- for now, add a reason when plan reset occurs

```ts
if (e.type === "PLAN_RESET_APPLIED") {
  reasons.push({
    code: "PLAN_RESET",
    detail: "Plan was softened to protect recovery and momentum.",
  });
}
```

---

# 7) UI: Add “Apply Plan Reset” button on the suggestion card

In `today.tsx`, when you render suggestions, detect type `"PLAN_RESET"` and show a button.

```tsx
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

const applyPlanReset = useMutation(api.kernel.planReset.applyPlanReset);

...

{data.suggestions.map((s: any) => (
  <View key={s._id} style={{ padding: 10, borderWidth: 1, borderRadius: 10 }}>
    <Text style={{ fontWeight: "700" }}>{s.type}</Text>
    <Text>{s.reason?.detail}</Text>

    {s.type === "PLAN_RESET" && (
      <TouchableOpacity
        onPress={() => applyPlanReset({
          day: data.day,
          keepCount: s.payload?.keepCount ?? 1,
          idempotencyKey: idem(),
        })}
        style={{ marginTop: 10, padding: 10, borderWidth: 1, borderRadius: 10 }}
      >
        <Text>Apply Plan Reset</Text>
      </TouchableOpacity>
    )}
  </View>
))}
```

---

# 8) Add a “Paused tasks” view (so it feels gentle, not like deletion)

Create a query: `getPausedTasks` and show them collapsed.

### `convex/kernel/taskQueries.ts`

```ts
export const getPausedTasks = query({
  handler: async (ctx) => {
    const userId = "user_me";
    return await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "paused"),
      )
      .collect();
  },
});
```

In Tasks screen, show:

- Active tasks
- A collapsed section: “Paused for now (Plan Reset)”

This protects your “no shame” principle.

---

# What you get after Plan Reset

✅ “Bad day flow” exists
✅ System softens before pushing
✅ Tasks are never guilt objects
✅ Drift doesn’t turn into collapse
✅ Your app becomes a _recovery OS_, not a hustle app

---

## Next step (best next after Plan Reset)

Add **“Resume paused tasks”** (gentle return):

- `resume_task` mutation: paused → active
- Policy: “When recovery improves, offer to restore 1 paused task”

If you want, say: **“Implement Resume Tasks next.”**

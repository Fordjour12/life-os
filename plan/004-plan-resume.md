**Resume Paused Tasks** is the perfect follow-up because it completes the “return” loop (no shame, no pressure, gentle control).

We’ll do it in a way that matches your rules:

- **User stays in control**
- **One small step**
- **Reversible**
- **No guilt**

---

# ✅ What we’re building

## A) Manual resume (simple + necessary)

- User taps a paused task → **Resume**

## B) Smart “Gentle return” (optional policy)

- When recovery improves, suggest:

  > “Want to bring back 1 paused task?”

We’ll implement **A now**, and set you up for **B** cleanly.

---

# 1) Add a kernel event

Update `src/kernel/types.ts`:

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
      type: "TASK_RESUMED";
      ts: number;
      meta: { taskId: string; reason: "manual" | "gentle_return" };
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

---

# 2) Convex mutation: resume a paused task

Create: `convex/kernel/resumeTasks.ts`

```ts
import { mutation } from "convex/server";
import { v } from "convex/values";

function getUserId() {
  return "user_me"; // replace with auth later
}

export const resumeTask = mutation({
  args: {
    taskId: v.id("tasks"),
    reason: v.optional(
      v.union(v.literal("manual"), v.literal("gentle_return")),
    ),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, { taskId, reason, idempotencyKey }) => {
    const userId = getUserId();
    const now = Date.now();
    const why = reason ?? "manual";

    // Idempotency: if this key already exists, do nothing
    const existing = await ctx.db
      .query("events")
      .withIndex("by_user_idem", (q) =>
        q.eq("userId", userId).eq("idempotencyKey", idempotencyKey),
      )
      .first();
    if (existing) return { ok: true, deduped: true };

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) throw new Error("Task not found");

    // If already active/completed, treat as idempotent success
    if (task.status !== "paused") {
      await ctx.db.insert("events", {
        userId,
        ts: now,
        type: "TASK_RESUMED",
        meta: { taskId, reason: why },
        idempotencyKey,
      });
      return { ok: true, already: true };
    }

    await ctx.db.patch(taskId, {
      status: "active",
      pausedAt: undefined,
      pauseReason: undefined,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "TASK_RESUMED",
      meta: { taskId, reason: why },
      idempotencyKey,
    });

    return { ok: true };
  },
});
```

---

# 3) (Optional but recommended) Query: paused tasks only from plan reset

Update or add query in `convex/kernel/taskQueries.ts`:

```ts
export const getPausedTasks = query({
  handler: async (ctx) => {
    const userId = "user_me";
    const paused = await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "paused"),
      )
      .collect();

    // Sort: smallest first for “gentle return”
    return paused.sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0));
  },
});
```

---

# 4) UI: Show Paused section with Resume button

Update your `app/(tabs)/tasks.tsx` (add paused tasks list + resume).

```tsx
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Tasks() {
  const active = useQuery(api.kernel.taskQueries.getActiveTasks);
  const paused = useQuery(api.kernel.taskQueries.getPausedTasks);

  const createTask = useMutation(api.kernel.taskCommands.createTask);
  const completeTask = useMutation(api.kernel.taskCommands.completeTask);
  const resumeTask = useMutation(api.kernel.resumeTasks.resumeTask);

  const [title, setTitle] = useState("");

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Tasks</Text>

      {/* Add task */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Small, doable task…"
          style={{ flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 }}
        />
        <TouchableOpacity
          onPress={async () => {
            if (!title.trim()) return;
            await createTask({
              title,
              estimateMin: 25,
              priority: 2,
              idempotencyKey: idem(),
            });
            setTitle("");
          }}
          style={{ padding: 12, borderWidth: 1, borderRadius: 10 }}
        >
          <Text>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Active */}
      <Text style={{ fontWeight: "800", marginTop: 8 }}>Active</Text>
      {active?.map((task) => (
        <TouchableOpacity
          key={task._id}
          onPress={() =>
            completeTask({ taskId: task._id, idempotencyKey: idem() })
          }
          style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}
        >
          <Text style={{ fontWeight: "600" }}>{task.title}</Text>
          <Text>{task.estimateMin} min</Text>
        </TouchableOpacity>
      ))}

      {/* Paused */}
      <Text style={{ fontWeight: "800", marginTop: 12 }}>Paused for now</Text>
      {paused?.length ? (
        paused.map((task) => (
          <View
            key={task._id}
            style={{ padding: 12, borderWidth: 1, borderRadius: 12, gap: 6 }}
          >
            <Text style={{ fontWeight: "600" }}>{task.title}</Text>
            <Text>{task.estimateMin} min</Text>

            <TouchableOpacity
              onPress={() =>
                resumeTask({
                  taskId: task._id,
                  reason: "manual",
                  idempotencyKey: idem(),
                })
              }
              style={{
                padding: 10,
                borderWidth: 1,
                borderRadius: 10,
                alignSelf: "flex-start",
              }}
            >
              <Text>Resume</Text>
            </TouchableOpacity>
          </View>
        ))
      ) : (
        <Text>Nothing paused.</Text>
      )}
    </View>
  );
}
```

---

# 5) (Optional next) “Gentle Return” policy suggestion

Once you have state working, add a policy like:

**If** mode is `maintain/build` AND paused tasks exist
→ Suggest: “Resume 1 small task”

This keeps the system soft.

I won’t add it yet unless you want, because you asked specifically for “Resume Paused tasks”.

---

# ✅ Acceptance checklist (you can test today)

- Apply Plan Reset → most tasks become paused
- Tasks screen shows paused tasks
- Tap Resume → task becomes active again
- Kernel logs `TASK_RESUMED` event (for learning later)

---

If you want the next logical step after this, it’s:
**“Gentle Return” suggestion + auto-pick the smallest paused task** (still user-approved).

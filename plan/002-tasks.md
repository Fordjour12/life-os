# Tasks the first real domain

**Tasks are the right first real domain** — they feed _planning, state, momentum, overload, recovery_. Everything else hangs off them.

you'll do this in a **build-first way**:

1. What Tasks mean _in your Life OS_ (important)
2. Task model (minimal but future-proof)
3. Convex schema + mutations
4. Kernel integration (events → state)
5. React Native screens (Expo Router)
6. What _not_ to build yet

You can literally start coding from this.

---

## 1️⃣ What a “Task” is in _your_ Life OS

This is **not** a todo-list task.

A task is:

- a **unit of intent**
- with an **estimated energy/time cost**
- that feeds **momentum**, not guilt

### Design rules (from your principles)

- Tasks are allowed to be:
  - unfinished
  - abandoned
  - reduced

- Completing _any_ task counts
- Tasks never shame the user for existing too long

👉 Tasks are signals, not obligations.

---

## 2️⃣ Task model (keep it small)

### Task states (important)

Avoid “failed”.

```ts
type TaskStatus =
  | "active" // normal
  | "completed"
  | "paused" // intentionally stopped
  | "archived"; // no longer relevant
```

### Task schema (kernel-aligned)

```ts
type Task = {
  _id: string;
  userId: string;

  title: string;
  notes?: string;

  estimateMin: number; // energy/time signal
  priority: 1 | 2 | 3; // soft priority, not tyranny

  status: TaskStatus;

  createdAt: number;
  completedAt?: number;
};
```

**Why no due dates yet?**
Because due dates create pressure too early. We’ll add them _after_ recovery flows work.

---

## 3️⃣ Convex schema (add tasks table)

Update `convex/schema.ts`

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
})
  .index("by_user_status", ["userId", "status"])
  .index("by_user_created", ["userId", "createdAt"]),
```

---

## 4️⃣ Task commands (the only way to change tasks)

Create: `convex/kernel/taskCommands.ts`

### Create task

```ts
export const createTask = mutation({
  args: {
    title: v.string(),
    estimateMin: v.number(),
    priority: v.number(),
    notes: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = "user_me";
    const now = Date.now();

    const taskId = await ctx.db.insert("tasks", {
      userId,
      title: args.title,
      notes: args.notes,
      estimateMin: args.estimateMin,
      priority: args.priority,
      status: "active",
      createdAt: now,
    });

    // Emit kernel event
    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "TASK_CREATED",
      meta: { taskId, estimateMin: args.estimateMin },
      idempotencyKey: args.idempotencyKey,
    });

    return { taskId };
  },
});
```

### Complete task (real version of your demo)

```ts
export const completeTask = mutation({
  args: {
    taskId: v.id("tasks"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, { taskId, idempotencyKey }) => {
    const userId = "user_me";
    const now = Date.now();

    const task = await ctx.db.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error("Task not found");
    }

    if (task.status === "completed") {
      return { ok: true }; // idempotent
    }

    await ctx.db.patch(taskId, {
      status: "completed",
      completedAt: now,
    });

    await ctx.db.insert("events", {
      userId,
      ts: now,
      type: "TASK_COMPLETED",
      meta: { taskId, estimateMin: task.estimateMin },
      idempotencyKey,
    });

    return { ok: true };
  },
});
```

---

## 5️⃣ Kernel reducer update (now tasks matter)

Update `computeDailyState`:

```ts
if (e.type === "TASK_CREATED") {
  planned += e.meta.estimateMin;
}

if (e.type === "TASK_COMPLETED") {
  completed += e.meta.estimateMin;
}
```

Now:

- **plannedMinutes** = sum of task estimates
- **completedMinutes** = real progress
- overload + momentum become meaningful

This is a _huge_ upgrade for very little code.

---

## 6️⃣ Queries (what the UI needs)

Create: `convex/kernel/taskQueries.ts`

```ts
export const getActiveTasks = query({
  handler: async (ctx) => {
    const userId = "user_me";
    return await ctx.db
      .query("tasks")
      .withIndex("by_user_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .collect();
  },
});
```

---

## 7️⃣ React Native UI (Expo Router)

### Tasks screen

Create: `app/(tabs)/tasks.tsx`

```tsx
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Tasks() {
  const tasks = useQuery(api.kernel.taskQueries.getActiveTasks);
  const createTask = useMutation(api.kernel.taskCommands.createTask);
  const completeTask = useMutation(api.kernel.taskCommands.completeTask);

  const [title, setTitle] = useState("");

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Tasks</Text>

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

      {tasks?.map((task) => (
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
    </View>
  );
}
```

Add it to your tabs and you now have:

- real tasks
- real estimates
- real completion
- real kernel feedback

---

## 8️⃣ What you should _not_ add yet

❌ due dates
❌ deadlines
❌ task streaks
❌ priority overload
❌ task guilt metrics

Those come **after** Plan Reset + Recovery feel right.

---

## What you now have (this is big)

With just Tasks:

- Load becomes meaningful
- Momentum is real
- Overload Guard fires correctly
- Tiny Win suggestions feel accurate
- Recovery mode actually works

You’ve turned the kernel from a demo into a **living system**.

---

## Next best step (don’t skip this)

Next, we should implement **Plan Reset** properly:

- collapse tasks to 1–2
- optionally pause the rest
- emit a `PLAN_RESET_APPLIED` event

That’s the moment your app stops feeling like a todo app.

If you want, say:

> **“Implement Plan Reset next.”**

And we’ll do it clean, calm, and powerful.

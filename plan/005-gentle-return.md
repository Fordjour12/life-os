This is a **perfect “Life OS” move**: _soft, small, user-approved, comeback-focused._

We’ll implement **Gentle Return** as:

- A policy that appears only when it’s safe (not overloaded / not in recovery)
- It **auto-picks the smallest paused task**
- The user taps **“Resume this one”** (still in control)
- That creates a `TASK_RESUMED` event

Below are the exact changes.

---

# 1) Add a new suggestion type

Update `src/kernel/types.ts`:

```ts
export type KernelSuggestion = {
  day: string;
  type: "PLAN_RESET" | "TINY_WIN" | "DAILY_REVIEW_QUESTION" | "GENTLE_RETURN";
  priority: 1 | 2 | 3 | 4 | 5;
  reason: { code: string; detail: string };
  payload: Record<string, any>;
  status: "new" | "accepted" | "downvoted" | "ignored" | "expired";
  cooldownKey?: string;
};
```

---

# 2) Update the policy runner to accept “facts” (smallest paused task)

Update `convex/kernel/policies.ts` to accept an optional fact:

```ts
import type { LifeState, KernelSuggestion } from "../../src/kernel/types";

type PolicyFacts = {
  smallestPausedTask?: { taskId: string; title: string; estimateMin: number };
};

export function runPolicies(
  state: LifeState,
  facts: PolicyFacts = {},
): KernelSuggestion[] {
  const out: KernelSuggestion[] = [];
  const day = state.day;

  // Overload Guard → Plan Reset
  if (state.load === "overloaded") {
    out.push({
      day,
      type: "PLAN_RESET",
      priority: 5,
      reason: {
        code: "OVERLOAD_GUARD",
        detail: "Your plan is heavier than your available time/energy.",
      },
      payload: { keepCount: 1 },
      status: "new",
      cooldownKey: "plan_reset",
    });
  }

  // Gentle Return (only when NOT overloaded/recovery)
  const canGentleReturn =
    state.load !== "overloaded" && state.mode !== "recovery";

  if (canGentleReturn && facts.smallestPausedTask) {
    out.push({
      day,
      type: "GENTLE_RETURN",
      priority: 4,
      reason: {
        code: "GENTLE_RETURN",
        detail: "Want to gently bring back one small task?",
      },
      payload: {
        taskId: facts.smallestPausedTask.taskId,
        title: facts.smallestPausedTask.title,
        estimateMin: facts.smallestPausedTask.estimateMin,
      },
      status: "new",
      cooldownKey: "gentle_return",
    });
  }

  // Momentum Builder → Tiny win
  if (state.momentum === "stalled") {
    out.push({
      day,
      type: "TINY_WIN",
      priority: 3,
      reason: {
        code: "MOMENTUM_BUILDER",
        detail: "A small win can restart momentum.",
      },
      payload: { maxMinutes: 10 },
      status: "new",
      cooldownKey: "tiny_win",
    });
  }

  // Daily Review
  out.push({
    day,
    type: "DAILY_REVIEW_QUESTION",
    priority: 2,
    reason: {
      code: "DAILY_REVIEW",
      detail: "Gentle reflection helps you reset without shame.",
    },
    payload: { question: "What’s one small thing you did today that counts?" },
    status: "new",
    cooldownKey: "daily_review",
  });

  return out.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
```

---

# 3) Provide the “smallest paused task” fact inside `executeCommand`

In your `convex/kernel/commands.ts`, right before calling `runPolicies(...)`, fetch the smallest paused task:

```ts
// After computing `state`...

const pausedTasks = await ctx.db
  .query("tasks")
  .withIndex("by_user_status", (q) =>
    q.eq("userId", userId).eq("status", "paused"),
  )
  .collect();

const smallest = pausedTasks.sort(
  (a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0),
)[0];

const facts = smallest
  ? {
      smallestPausedTask: {
        taskId: smallest._id,
        title: smallest.title,
        estimateMin: smallest.estimateMin,
      },
    }
  : {};

const suggestions = runPolicies(state, facts);
```

Now “Gentle Return” can appear intelligently.

---

# 4) Add cooldown logic (simple MVP version)

Right now you expire all “new” suggestions on every command (which can be noisy). For Gentle Return, add a tiny guard:

When inserting suggestions, **skip if a suggestion with same cooldownKey exists in last ~12 hours**.

Add this before inserting each new suggestion in `executeCommand`:

```ts
const TWELVE_HOURS = 12 * 60 * 60 * 1000;

async function recentlySuggested(cooldownKey?: string) {
  if (!cooldownKey) return false;

  const recent = await ctx.db
    .query("suggestions")
    .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
    .collect();

  return recent.some(
    (s) => s.cooldownKey === cooldownKey && now - s.createdAt < TWELVE_HOURS,
  );
}
```

Then when inserting:

```ts
for (const s of suggestions) {
  if (await recentlySuggested(s.cooldownKey)) continue;

  await ctx.db.insert("suggestions", { ... });
}
```

(That’s enough to prevent spam.)

---

# 5) UI: Add “Resume this one” button for GENTLE_RETURN

In `today.tsx`, when rendering suggestions:

```tsx
const resumeTask = useMutation(api.kernel.resumeTasks.resumeTask);

...

{s.type === "GENTLE_RETURN" && (
  <TouchableOpacity
    onPress={() =>
      resumeTask({
        taskId: s.payload.taskId,
        reason: "gentle_return",
        idempotencyKey: idem(),
      })
    }
    style={{ marginTop: 10, padding: 10, borderWidth: 1, borderRadius: 10 }}
  >
    <Text>Resume: {s.payload.title} ({s.payload.estimateMin}m)</Text>
  </TouchableOpacity>
)}
```

That’s it: user-approved, smallest task, gentle comeback.

---

# ✅ Acceptance test (5 minutes)

1. Create 5 tasks (different estimates)
2. Apply Plan Reset (keepCount: 1) → most tasks become paused
3. Complete/adjust something so state is not overloaded
4. Today screen shows **Gentle Return** suggestion
5. Tap “Resume this one” → that task becomes active again

---

If you want the “next layer” after this, we can make Gentle Return even smarter:

- only suggest if the user has had **1–2 wins already**
- or if focusCapacity is medium/high
- and rotate tasks so it doesn’t always pick the same one

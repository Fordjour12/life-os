This turns Gentle Return from “always helpful” into “**helpful at the right time**” — which is what makes it feel like a Life OS.

Below is a clean, buildable “next layer” that adds:

1. **Gating**: only suggest after 1–2 wins OR medium/high capacity
2. **Rotation**: don’t keep suggesting the same paused task
3. **“Why” remains visible** (no hidden optimization)

---

## 1) Add the signals we need

### A) Track “wins” (completed tasks count) in state

Right now your reducer uses minutes. Add **completedTasksCount** (simple and stable).

In `computeDailyState(day, events)`:

```ts
let completedTasksCount = 0;

for (const e of events) {
  if (e.type === "TASK_COMPLETED") {
    completed += e.meta.estimateMin;
    completedTasksCount += 1;
  }
}
```

Add it to `LifeState`:

```ts
completedTasksCount: number;
```

Now you can gate on “wins” in a human way.

---

## 2) Smarter gating rules (when to show Gentle Return)

You proposed:

- only suggest if the user has **1–2 wins already**
- or if **focusCapacity is medium/high**

Let’s define this precisely:

### Gentle Return gate (recommended)

Show Gentle Return if:

- **not overloaded**
- **not in recovery**
- AND (
  - completedTasksCount >= 1 **OR**
  - focusCapacity ∈ { medium, high }
    )

This matches your principles: _soften first, return gently, don’t push on bad days._

---

## 3) Rotation: pick “smallest paused task” but not the same one

We’ll rotate using server history (Convex) so it works across devices:

### Rotation rule (recommended)

When choosing which paused task to suggest:

- avoid tasks suggested by Gentle Return in the last **7 days**
- avoid tasks that were resumed recently (optional)
- then pick the smallest remaining (doable-first)

This prevents the “stuck on the same task” problem.

---

## 4) Implement it cleanly (Convex)

### A) Build a fact: best paused task candidate (rotated)

In `executeCommand` (or wherever you compute suggestions), fetch:

- paused tasks
- recent Gentle Return suggestions (last 7 days)
- choose smallest paused task NOT recently suggested

#### Step 1: collect paused tasks

```ts
const pausedTasks = await ctx.db
  .query("tasks")
  .withIndex("by_user_status", (q) =>
    q.eq("userId", userId).eq("status", "paused"),
  )
  .collect();
```

#### Step 2: collect recently suggested taskIds for Gentle Return

Convex doesn’t do “last 7 days” super elegantly without an index on `createdAt`, but MVP is fine:

```ts
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const recentSuggestions = await ctx.db
  .query("suggestions")
  .withIndex("by_user_status", (q) =>
    q.eq("userId", userId).eq("status", "new"),
  )
  .collect();

const recentlySuggestedTaskIds = new Set<string>();

for (const s of recentSuggestions) {
  if (s.type === "GENTLE_RETURN" && now - s.createdAt < SEVEN_DAYS) {
    const tid = s.payload?.taskId;
    if (tid) recentlySuggestedTaskIds.add(tid);
  }
}
```

_(Later you can add an index on `createdAt` and query faster.)_

#### Step 3: choose rotated candidate

```ts
const candidates = pausedTasks
  .filter((t) => !recentlySuggestedTaskIds.has(String(t._id)))
  .sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0));

const rotated = candidates[0] ?? null;

// fallback: if everything was recently suggested, allow the smallest anyway
const smallest =
  pausedTasks.sort((a, b) => (a.estimateMin ?? 0) - (b.estimateMin ?? 0))[0] ??
  null;

const chosen = rotated ?? smallest;

const facts = chosen
  ? {
      smallestPausedTask: {
        taskId: chosen._id,
        title: chosen.title,
        estimateMin: chosen.estimateMin,
      },
    }
  : {};
```

Now you have rotation with a safe fallback.

---

## 5) Update policy gating (the “smarter” part)

In `runPolicies(state, facts)`:

```ts
const hasWinAlready = (state.completedTasksCount ?? 0) >= 1;
const hasCapacity =
  state.focusCapacity === "medium" || state.focusCapacity === "high";

const canGentleReturn =
  state.load !== "overloaded" &&
  state.mode !== "recovery" &&
  (hasWinAlready || hasCapacity);

if (canGentleReturn && facts.smallestPausedTask) {
  out.push({
    day,
    type: "GENTLE_RETURN",
    priority: 4,
    reason: {
      code: "GENTLE_RETURN",
      detail: hasWinAlready
        ? "Nice—momentum is back. Want to gently bring back one small task?"
        : "Your capacity looks okay. Want to gently bring back one small task?",
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
```

This is explainable and aligned.

---

## 6) Bonus: rotate even better (optional upgrade)

If you want rotation to be **perfect**, add 1 tiny table:

### `userKernelPrefs`

- userId
- lastGentleReturnTaskId (optional)
- updatedAt

Then when selecting candidates, exclude `lastGentleReturnTaskId` first, and update it when creating a Gentle Return suggestion. This rotates even if suggestions expire or get deleted.

Not required, but very clean.

---

## 7) UI stays the same (still user-approved)

You already have:

- suggestion shows the task
- button resumes it

That’s perfect. No change needed.

---

## Resulting behavior (what you’ll feel as a user)

- On a rough day: no Gentle Return pressure
- After you complete 1 small thing: “Want to bring back one small task?”
- It won’t keep nagging the same paused task
- The OS feels respectful and adaptive

---

If you want, the next “next layer” after _this_ is:

- Gentle Return only appears **after a streak of stability** (e.g., 2 steady days)
- OR based on “time remaining today” once calendar/freeMinutes is real

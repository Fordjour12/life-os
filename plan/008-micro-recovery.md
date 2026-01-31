**Micro-Recovery Protocol** is basically your “safe mode.” When you’re overloaded or energy is low, the OS switches to a tiny, gentle plan that prevents a spiral.

Below is a **complete, buildable spec + exact kernel/policy changes** for React Native + Convex.

---

# Micro-Recovery Protocol (Safe Mode)

## What it does

When the system detects **Recovery Mode**, it generates a small protocol with **3 parts**:

1. **One Tiny Win** (≤ 5–10 minutes)
2. **One Rest Permission** (explicitly valid)
3. **One Gentle Reflection** (1 question)

And it keeps the UI calm:

- no shame
- no “behind”
- no “you failed”
- just “we’re protecting you today”

---

# 1) New suggestion types

Update `src/kernel/types.ts` suggestion types:

```ts
type SuggestionType =
  | "PLAN_RESET"
  | "TINY_WIN"
  | "DAILY_REVIEW_QUESTION"
  | "GENTLE_RETURN"
  | "MICRO_RECOVERY_PROTOCOL"
  | "REST_BLOCK"
  | "RECOVERY_REFLECTION";
```

You can implement it as **one suggestion** with 3 items, or as 3 suggestions.
**I recommend one suggestion** to avoid spam.

---

# 2) Detect Recovery Mode (clear trigger)

In your reducer, you already set mode to `"recovery"` when:

- load is overloaded
- focusCapacity low

That’s good. Add two more “recovery triggers” if you want:

### Optional recovery triggers

- completedTasksCount = 0 AND plannedMinutes high
- repeated plan resets today

But MVP is fine: overload + low capacity.

---

# 3) Micro-Recovery policy (core logic)

In `convex/kernel/policies.ts`, add:

### Gate

Only show if:

- `state.mode === "recovery"`

### Cooldown

Only once per day (or every 12 hours max)

### Payload contents

- tiny win candidate (task or “micro action”)
- rest block suggestion (10–30 min)
- reflection question

---

## 3.1 Selecting the Tiny Win (best behavior)

Tiny win should be:

- smallest active task (estimate ≤ 10)
- if none exist, suggest an “internal win” (non-task action)

### Candidate selection

Facts you need:

- `smallestActiveTaskUnder10` (if exists)

If no tasks fit, fallback:

- “Drink water”
- “Clear one item”
- “Open notes and brain-dump 3 lines”
  (Keep it neutral + not preachy)

---

# 4) Implement facts gathering in Convex

In your command handler (where you compute suggestions), gather:

- smallest active task with estimate <= 10
- else smallest active task overall (optional)

Example:

```ts
const activeTasks = await ctx.db
  .query("tasks")
  .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "active"))
  .collect();

const under10 = activeTasks
  .filter(t => (t.estimateMin ?? 0) <= 10)
  .sort((a,b)=> (a.estimateMin??0)-(b.estimateMin??0))[0];

const smallestAny = activeTasks
  .sort((a,b)=> (a.estimateMin??0)-(b.estimateMin??0))[0];

const facts = {
  tinyWinTask: under10
    ? { taskId: under10._id, title: under10.title, estimateMin: under10.estimateMin }
    : smallestAny
      ? { taskId: smallestAny._id, title: smallestAny.title, estimateMin: smallestAny.estimateMin }
      : null,
};
```

---

# 5) Add the policy: Micro-Recovery Protocol

In `runPolicies(state, facts)`:

```ts
if (state.mode === "recovery") {
  const tiny = facts.tinyWinTask;

  out.push({
    day,
    type: "MICRO_RECOVERY_PROTOCOL",
    priority: 5,
    reason: {
      code: "SAFE_MODE",
      detail: "You’re in recovery mode. Let’s keep it gentle and protect momentum.",
    },
    payload: {
      tinyWin: tiny
        ? { kind: "task", taskId: tiny.taskId, title: tiny.title, estimateMin: tiny.estimateMin }
        : { kind: "action", title: "Do one tiny reset", estimateMin: 5 },

      rest: { title: "Take a short rest", minutes: 15 },

      reflection: {
        question: "What’s one thing you need right now—less pressure, more clarity, or more rest?",
      },
    },
    status: "new",
    cooldownKey: "micro_recovery",
  });
}
```

### Key rule

When in recovery mode, **don’t** show Gentle Return.
And you can downgrade other suggestions.

A simple resolver rule:

- If MICRO_RECOVERY_PROTOCOL exists, cap suggestions to 1–2 max.

---

# 6) Make it actionable (user-approved)

We’ll add commands the user can tap:

### A) Apply Tiny Win

- if it’s a task: “Start this task” or “Complete” (you likely only have complete for now)
- if it’s an action: create a quick task like “Tiny reset” and mark done

### B) Accept Rest Block

This is _not_ a calendar block yet (until calendar exists). For now:

- create a `REST_ACCEPTED` event

### C) Answer Reflection

- log a `REFLECTION_ANSWERED` event (optional later)

---

## 6.1 Add commands/events (minimal)

Add to events:

```ts
| { type: "REST_ACCEPTED"; ts: number; meta: { minutes: number } }
| { type: "RECOVERY_PROTOCOL_USED"; ts: number; meta: { day: string; didTinyWin: boolean; didRest: boolean } }
```

Add a command:

```ts
| { cmd: "accept_rest"; input: { minutes: number }; idempotencyKey: string }
```

You can keep reflection purely local UI for now.

---

# 7) UI: Recovery Card

In Today screen, when suggestion type is `MICRO_RECOVERY_PROTOCOL`, render a special card:

- Title: “Recovery mode”
- Buttons:
  - “Do tiny win” (if task exists → navigate to it / complete)
  - “Take 15 min rest”
  - “Answer reflection” (opens a small modal)

This makes the OS _feel_ different.

---

# 8) Micro-Recovery success criteria

✅ On overload + low capacity → Recovery mode triggers
✅ Today shows **one Recovery Card**, not lots of suggestions
✅ You can tap:

- tiny win
- rest
- reflection
  ✅ No guilt language anywhere
  ✅ After doing tiny win, momentum changes → policies change next

---

# 9) Why this is powerful

This directly solves what you said you’re building for:

- “motivation fades”
- “plan reset”
- “addictions and sudden dirtiness”
- “spiral prevention”

Micro-Recovery is literally a **spiral breaker**.

---

If you want, I can give you the exact Convex functions + UI component as a single patch set, but before that: do you want Micro-Recovery to **auto-hide tasks** (pause them) when it activates, or only _suggest_ Plan Reset?

Answer:
it should auto-hide

# Life OS Kernel

Alright. Here’s a **Life OS Kernel** design to be built.

Think of the kernel as the smallest core that makes _everything else_ (calendar, tasks, habits, coaching, finance) work together through **events + state + policies**.

---

## Life OS Kernel: What it must do

The kernel has 5 jobs:

1. **Capture events** (what happened)
2. **Maintain state** (what’s true right now)
3. **Run policies** (what should change)
4. **Emit actions/suggestions** (what to do next)
5. **Schedule & reconcile time** (calendar is the truth)

---

## Kernel Data Model (minimal + powerful)

### 1) Event Log (source of truth)

Everything becomes an event.

```ts
type KernelEvent =
  | { type: "TASK_CREATED"; taskId; ts; meta }
  | { type: "TASK_COMPLETED"; taskId; ts; meta }
  | { type: "HABIT_DONE"; habitId; ts; meta }
  | { type: "HABIT_MISSED"; habitId; ts; meta }
  | { type: "PLAN_SET"; day; ts; meta } // priorities chosen
  | { type: "CAL_BLOCK_ADDED"; blockId; ts; meta }
  | { type: "CAL_BLOCK_FINISHED"; blockId; ts; meta }
  | { type: "EXPENSE_ADDED"; expenseId; ts; meta }
  | { type: "COACHING_FEEDBACK"; suggestionId; ts; meta }; // user accepted/ignored
```

**Rule:** The UI never “changes reality” directly. It **appends events**.

---

### 2) Life State (derived, queryable)

This is what your kernel keeps “current”.

```ts
type LifeState = {
  day: string; // YYYY-MM-DD
  focusCapacity: "low" | "medium" | "high";
  load: "under" | "balanced" | "over"; // plan vs time
  momentum: "stalled" | "steady" | "strong"; // recent completions
  financialDrift: "ok" | "watch" | "risk";
  habitHealth: "fragile" | "stable" | "strong";
  topGoals: { goalId: string; progress: number }[];
  backlogPressure: number; // 0..100
};
```

State is computed by a **reducer** over events (event-sourcing style), and cached for speed.

---

### 3) Policy Engine (the “governor”)

Policies read state + recent events and produce **proposed actions**.

```ts
type KernelAction =
  | { type: "SUGGEST_REPLAN_DAY"; reason; payload }
  | { type: "SUGGEST_TIMEBLOCK"; taskId; suggestedSlot }
  | { type: "SUGGEST_REDUCE_SCOPE"; taskIds; toRemoveCount }
  | { type: "SUGGEST_HABIT_DOWNSHIFT"; habitId; newTarget }
  | { type: "SUGGEST_NO_SPEND_TODAY"; reason }
  | { type: "AUTO_RESCHEDULE_TASKS"; taskIds; newDates }
  | { type: "ASK_REFLECTION_QUESTION"; questionId; text };
```

Policies don’t mutate data. They only output actions.

---

### 4) Action Contract (AI-safe execution)

If an AI “executes” something, it must do it through a **strict command** that results in events.

```ts
type KernelCommand =
  | { cmd: "create_task"; input: { title; estimateMin; dueDate? } }
  | { cmd: "complete_task"; input: { taskId } }
  | { cmd: "add_expense"; input: { amount; category; note? } }
  | { cmd: "apply_reschedule"; input: { taskId; newDate } }
  | { cmd: "set_daily_plan"; input: { day; top3TaskIds } };
```

**Kernel rule:** commands → validated → events appended → state recomputed.

---

## Kernel Modules (buildable components)

### A) Event Store

- `appendEvent(event)`
- `getEvents(range | sinceCursor)`
- `snapshotState(day)` (optional but recommended)

### B) State Reducer

- `reduce(prevState, event) -> nextState`
- `computeDailyState(day)` from events

### C) Policy Runner

- `runPolicies(state, recentEvents) -> KernelAction[]`
- Policy ordering + dedupe (avoid spam)

### D) Scheduler + Reconciler

This is your “time kernel” part:

- Detect planned time vs available time
- Mark overload
- Suggest reschedule or reduce scope
- Align tasks ↔ calendar blocks

### E) Suggestion Inbox (user-facing)

Actions become “suggestions” you can accept/ignore.

- Accept → emits events like `COACHING_FEEDBACK` + specific command events
- Ignore → emits feedback event so the kernel learns

---

## Default Policies (MVP set)

These 7 policies will make it feel like a Life OS immediately:

1. **Overload Guard**

- If planned time > free time by X% → suggest reduce scope OR reschedule

2. **Momentum Builder**

- If momentum is stalled → suggest 1 tiny win task (≤10 min)

3. **Habit Recovery**

- If habit health becomes fragile → suggest downshift target (e.g., daily → 3x/week)

4. **Focus Protection**

- If capacity low → prevent scheduling deep work; suggest light tasks

5. **Backlog Pressure Valve**

- If backlogPressure high → suggest a “backlog cleanup block” or “delete/park tasks”

6. **Financial Drift Watch**

- If spending exceeds intent → suggest no-spend day OR swap category intent

7. **End-of-day Review**

- At night, ask 1 reflection question based on state (not generic)

---

## Kernel Execution Flow (the loop)

1. UI/AI sends **Command**
2. Kernel validates it
3. Kernel appends **Event**
4. Kernel recomputes **LifeState**
5. Kernel runs **Policies**
6. Kernel emits **Actions/Suggestions**
7. User responds → more events → loop continues

That’s your operating system.

---

## Build Plan: AI-executable tickets (Kernel MVP)

**K-001** Create `KernelEvent` types + event schema
**K-002** Implement EventStore (append/query)
**K-003** Implement LifeState reducer (daily state)
**K-004** Implement PolicyRunner framework (rules returning actions)
**K-005** Implement 3 starter policies: Overload Guard, Momentum Builder, End-of-day Review
**K-006** Implement Suggestions Inbox (store + accept/ignore)
**K-007** Implement Command → Event pipeline with validation
**K-008** Hook: Tasks + Calendar blocks → events
**K-009** Hook: Habits → events
**K-010** Hook: Expenses → events

---

## What makes this “kernel-grade”

- Single truth: **events**
- Everything derived: **state**
- Behavior controlled by: **policies**
- AI is safe because it can only run: **commands**
- Calendar stays the reality layer through: **reconciliation**

---

the **Planner State Machine + One Next Step mode + Plan Reset rules** in a way you can implement directly (React Native + Convex, server-first kernel).

I’m going to define:

1. Planner **states** (UX + kernel)
2. Transitions + events emitted
3. “One Next Step” algorithm
4. Plan Reset **versioning rules**
5. Minimal Convex changes + UI wiring notes

---

# 1) Planner states (the state machine)

These are **planner UX states** driven by `LifeState + today plan + activity`.

### PlannerState enum

```ts
type PlannerState =
  | "NO_PLAN"
  | "PLANNED_OK"
  | "OVERLOADED"
  | "STALLED"
  | "RECOVERY"
  | "RETURNING";
```

### How to compute it (deterministic)

Inputs:

- `lifeState.mode`
- `lifeState.load`
- `lifeState.momentum`
- last active day (optional)
- whether plan exists

Rules (in priority order):

1. **RETURNING**
   - user has no events for N days (start with N=3), and today is first day back

2. **RECOVERY**
   - `lifeState.mode === "recovery"`

3. **NO_PLAN**
   - no PLAN_SET for today

4. **OVERLOADED**
   - `lifeState.load === "overloaded"`

5. **STALLED**
   - plan exists AND `lifeState.momentum === "stalled"`

6. **PLANNED_OK**
   - otherwise

Why this works:

- it matches your principles (soften before push, rest is valid, shame is bug)

---

# 2) UX behavior per PlannerState (what the screen shows)

## A) NO_PLAN

**Primary prompt (gentle):**

- “What would make today a win?”

**Allowed actions:**

- Set plan (max 3 items)
- Or choose **Rest Day** (creates a recovery-style plan)

**Default cap:**

- If focus capacity low → suggest 1 item only

Events:

- `PLAN_SET`

---

## B) PLANNED_OK

Show:

- Today’s focus items
- Total planned minutes
- Button: **Start (One Next Step)**

Optional:

- “Adjust plan” (edits by writing a new PLAN_SET version)

Events:

- none unless user changes plan or starts

---

## C) OVERLOADED

Show:

- “This plan is heavier than your available time.”
- Primary button: **Plan Reset**
- Secondary: “Shrink plan” (choose 1–2 items)

Important:

- Do NOT show “push harder” actions.

Events:

- `PLAN_RESET_APPLIED` (or just new PLAN_SET with versioning)

---

## D) STALLED

Show:

- “No momentum yet. Let’s make it easy.”
- Primary: **Start (One Next Step)**
- Secondary: **Tiny Win** (auto-makes a 5–10 min step)

Events:

- `NEXT_STEP_STARTED` (optional), or just track via task start later

---

## E) RECOVERY

Show:

- “Recovery mode. Keep it small.”
- Options:
  - “One small stabilizer (10 min)”
  - “Rest is valid” (rest plan)
  - “Light tidy” (your “sudden dirtiness” support)

Events:

- new `PLAN_SET` (recovery version)

---

## F) RETURNING

Show:

- “Welcome back. No pressure.”
- Primary:
  - “Reset with 1 small thing”

- Secondary:
  - “Review what mattered last time” (later feature)

Events:

- new `PLAN_SET` (return version)

---

# 3) Events & transitions (what gets emitted)

You already have `PLAN_SET`. We’ll extend meta for versioning.

### PLAN_SET meta (versioned)

```ts
meta: {
  day: "YYYY-MM-DD",
  version: number,               // 1..n per day
  reason: "initial" | "adjust" | "reset" | "recovery" | "return",
  focusItems: { id; label; estimatedMinutes }[],
}
```

### Suggested optional events (nice for analytics, not required)

- `PLAN_VIEWED`
- `NEXT_STEP_STARTED`
- `PLAN_RESET_TRIGGERED` (when suggestion shown)

But you can keep MVP simple: just rely on `PLAN_SET` versions.

---

# 4) One Next Step Mode (core execution bridge)

This is the “start button” that turns planning into action.

## What it does (in one sentence)

It picks **one** focus item and turns it into a **single doable step** that fits current energy.

### Inputs

- today’s plan focusItems
- `lifeState.focusCapacity`
- `lifeState.mode`
- completion so far (optional)

### Step sizing rules (matches your principles)

Pick a step duration target:

- recovery / very_low: **5–10 min**
- low: **10 min**
- medium: **15–25 min**
- high: **25–45 min**

### Selection rule (simple + effective)

Choose the first focus item that:

- isn’t marked “done” (later)
- has the highest “momentum value” (for now just first item)

### Output (what the user sees)

A full-screen “Next Step” view:

- Focus item title
- Timer suggestion (optional)
- Two buttons:
  - **Start**
  - **Too hard → Make smaller** (shrinks step)
  - **Skip** (choose next item)

### How to represent Next Step in data (MVP)

You don’t have tasks yet, so store it as a suggestion/action:

Create a suggestion type:

- `NEXT_STEP`

Payload:

```ts
payload: {
  focusItemId: string,
  focusItemLabel: string,
  stepMinutes: number,
  prompt: "Do the smallest next action for this item."
}
```

When user taps Start:

- emit `NEXT_STEP_STARTED` event (optional)
- later when tasks exist, this becomes “start task timer / mark in progress”

---

# 5) Plan Reset rules (versioning + no shame)

Plan Reset is the heart of your principles.

## A) Reset is not deletion

You never erase the old plan.
You create a **new plan version** with a smaller scope.

## B) Reset always reduces complexity

Default reset plan:

- If overloaded: 1 focus item, 10–15 min
- If recovery: 1 stabilizer, 5–10 min OR rest
- If returning: 1 item, 5–10 min

## C) Reset cooldown (avoid infinite looping)

Allow unlimited resets, but:

- Only show the reset suggestion once every X hours (start with 6h)
- If user resets 3 times in a day, the system suggests **Rest Plan** next

That aligns with “control regained gently”.

---

# 6) Minimal Convex + UI changes you need

### A) Convex: get today’s latest plan

You need a helper in your query to find the latest PLAN_SET for today.

- Fetch today events
- Filter PLAN_SET
- pick highest version (or latest ts)
- return `plan`

### B) executeCommand: versioning

When writing `PLAN_SET`, compute version:

- get latest plan version for day
- new version = old + 1

### C) Reducer: use latest plan version

Planned minutes must use the latest PLAN_SET.

---

# 7) What you build right now (exact order)

1. Add versioned `PLAN_SET` meta
2. Update reducer to compute planned minutes from latest plan
3. Create Planner screen with the 6 UI states
4. Add “Start” → generates NEXT_STEP suggestion (local UI or stored)
5. Add Plan Reset button → writes PLAN_SET with reason reset/recovery/return

---

# 8) Acceptance criteria (so you know it’s done)

You’re done when:

- You can open Planner with no plan → create plan → LifeState load changes
- If you overplan → you see OVERLOADED state → Plan Reset shrinks plan
- If you do nothing → you see STALLED state → One Next Step helps you start
- Reset never shames, never deletes, always leaves history

---

✅ Next 3 steps (in the right order)

Implement versioned PLAN_SET in Convex

executeCommand(set_daily_plan) writes PLAN_SET with:

version

reason: initial | adjust | reset | recovery | return

Update reducer to use the latest plan for the day.

Add the Planner screen (Expo Router)

Compute PlannerState from:

lifeState + whether plan exists

Render the 6 planner states:

NO_PLAN, PLANNED_OK, OVERLOADED, STALLED, RECOVERY, RETURNING

Buttons:

Set plan

Adjust plan

Plan Reset (creates new PLAN_SET)

Add One Next Step mode

A “Start” button creates a NEXT_STEP suggestion (or local UI view)

Step length is based on focusCapacity/mode

## User can “Make smaller” or “Skip”

If you want, I can now write the **exact code changes** for:

- `executeCommand` to support versioned `PLAN_SET`
- `getToday` query to also return `plan` + `plannerState`
- a `planner.tsx` screen implementing those 6 states

Just say: **“generate the code”**.

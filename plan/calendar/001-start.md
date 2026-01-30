Perfect choice. **Calendar / Time Reality** is the right next move _after_ recovery + reflection, because it grounds everything in **what’s actually possible**, not what you wish were possible.

I’ll design this as a **Reality Layer**, not a scheduling app.

---

# Calendar / Time Reality Layer

_(Not a planner. A truth detector.)_

## What this layer’s job is

> **Tell the system how much time actually exists — and protect it.**

Not:

- productivity optimization
- perfect schedules
- micromanagement

But:

- reality checks
- overload prevention
- gentler planning
- smarter recovery

---

## 1️⃣ Core principle (non-negotiable)

> **The calendar does not tell you what to do.
> It tells the system what is possible.**

Tasks adapt to time — not the other way around.

---

## 2️⃣ What you are (and are not) building

### ❌ You are NOT building

- Google Calendar clone
- Meeting manager
- Full scheduling engine
- Recurring event hell

### ✅ You ARE building

- Time availability model
- Focus vs non-focus blocks
- Reality-based free time
- Gentle protection of time

---

## 3️⃣ The minimal calendar model (MVP)

### CalendarBlock (simple, flexible)

```ts
type CalendarBlock = {
  _id: string;
  userId: string;
  day: string; // YYYY-MM-DD
  startMin: number; // minutes from midnight
  endMin: number;

  kind: "busy" | "focus" | "rest" | "personal";
  source: "manual" | "imported";

  title?: string;
  createdAt: number;
};
```

That’s it.
No recurrence yet. No alarms yet.

---

## 4️⃣ Free time computation (the heart of this layer)

### Step 1: Define daily capacity

Start simple:

```ts
const DAILY_CAPACITY_MIN = 480; // 8 hours
```

Later this becomes dynamic.

---

### Step 2: Subtract busy time

```ts
busyMinutes = sum(block.endMin - block.startMin where kind === "busy");
freeMinutes = DAILY_CAPACITY_MIN - busyMinutes;
```

Clamp at 0.

---

### Step 3: Optional focus weighting (later)

Eventually:

- focus blocks = high-quality time
- busy blocks = fragmented time

But MVP ignores quality — just quantity.

---

## 5️⃣ How this plugs into your kernel (important)

### Right now you had:

```ts
freeMinutes = DEFAULT_FREE_MINUTES;
```

Now it becomes:

```ts
freeMinutes = computeFreeMinutes(day, calendarBlocks);
```

This immediately improves:

- overload detection
- plan reset accuracy
- gentle return gating
- micro-recovery timing

No new policies needed yet — they just get smarter.

---

## 6️⃣ Calendar events → Kernel events

You must event-source calendar changes too.

Add events:

```ts
| { type: "CAL_BLOCK_ADDED"; ts: number; meta: { day; startMin; endMin; kind } }
| { type: "CAL_BLOCK_REMOVED"; ts: number; meta: { blockId } }
```

Why?

- weekly review can see “busy weeks”
- pattern awareness gets real
- addiction / late-night signals become safer

---

## 7️⃣ Minimal UI (do not overbuild)

### Screen 1: **Time Reality**

Not “Calendar”.

Shows:

- “You have ~3h free today”
- Busy blocks (simple vertical list)
- Button: “Add busy time”

No dragging. No grids yet.

---

### Screen 2: Add Busy Time (fast)

Inputs:

- Start time
- End time
- Type: busy / rest

That’s it.

---

## 8️⃣ How existing features improve automatically

### 🔁 Plan Reset

Before:

> “You’re overloaded.”

Now:

> “You planned 4h, but only have 2h free.”

This feels **fair**, not accusatory.

---

### 🌱 Gentle Return

Before:

> “You seem okay.”

Now:

> “You have 25 minutes free — want to resume a 15-minute task?”

Huge trust boost.

---

### 🛟 Micro-Recovery

Before:

> based on load only

Now:

- If freeMinutes < 30 → recovery becomes more likely
- If late in the day → suggest rest instead of tasks

---

## 9️⃣ Pattern awareness gets safer

You can now say:

- “Overload often happens on days with <2h free.”
- “Recovery days usually follow packed calendars.”

These are **external**, not moral.

---

## 🔒 Ethical guardrails (important)

### Hard rules

- Calendar data is never judged
- No “you should free time”
- No “busy = bad”
- Rest blocks are equal citizens

### Language rule

Always say:

> “This is what the day allowed.”

Never:

> “You didn’t manage your time.”

---

## 10️⃣ Build order (don’t deviate)

### Phase 1 (1–2 days)

1. CalendarBlock schema (Convex)
2. Add / list blocks
3. Compute freeMinutes
4. Replace DEFAULT_FREE_MINUTES

### Phase 2 (1 day)

5. Wire freeMinutes into LifeState
6. Watch overload detection improve

### Phase 3 (later)

7. Focus vs busy weighting
8. Recurring patterns
9. Calendar import (optional)

---

## When this layer is “done”

You stop when:

✅ freeMinutes feels accurate
✅ overload feels fair
✅ recovery triggers make sense
✅ no pressure UI exists
✅ you _trust_ the system’s sense of time

At that point — **stop**.

---

## What comes after Calendar (do not rush)

Once time is real, the natural next step is:

> **Planner (Intent Layer)** — but now grounded in reality.

Planner without time is wishful.
Planner _with_ time is wisdom.

---

If you want, next I can:

- design the **Time Reality screen UI**
- write the **Convex calendar schema + queries**
- integrate **freeMinutes into your reducer**
- or define **late-night protection rules**

Just tell me what you want to build first in this layer.

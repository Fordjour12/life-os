**Planner** is the right next step because it _feeds the kernel_ without adding too much surface area.

Below is a **clean, buildable Planner module** that plugs directly into what you already have.

---

# PLANNER (Phase 2) — What it is and what it is NOT

### The Planner **is not**

- a task manager
- a calendar
- a productivity scoreboard

### The Planner **is**

- a **daily intention setter**
- a **scope limiter**
- the **bridge between chaos → structure**

Its job is to answer **one question per day**:

> _“Given my energy and reality, what actually matters today?”_

---

# Planner responsibilities (tight scope)

For MVP, the Planner does **exactly 4 things**:

1. Choose **up to 3 focus items** for the day
2. Estimate **planned effort** (rough, not precise)
3. Emit a **PLAN_SET event**
4. Allow **Plan Reset** (soft restart)

That’s it.

---

# 1️⃣ Planner data model (minimal, intentional)

You already have events — good.
The planner itself does **not need a table** yet.

Everything is expressed as an **event**.

### Planner event (already defined, now made real)

```ts
type PLAN_SET = {
  type: "PLAN_SET";
  ts: number;
  meta: {
    day: string; // YYYY-MM-DD
    focusItems: {
      id: string; // taskId or free-form id
      label: string; // text for now
      estimatedMinutes: number; // rough guess
    }[];
  };
};
```

Why this works:

- No duplication of state
- Reducer can compute `plannedMinutes`
- Plan Reset = just another PLAN_SET

---

# 2️⃣ Update the reducer (Planner becomes real)

Modify `computeDailyState` so planned minutes come from the planner.

### Change in `reducer.ts`

```ts
let planned = 0;

for (const e of events) {
  if (e.type === "PLAN_SET") {
    planned = e.meta.focusItems.reduce(
      (sum: number, item: any) => sum + item.estimatedMinutes,
      0,
    );
  }

  if (e.type === "TASK_COMPLETED") {
    completed += COMPLETE_MINUTES;
  }
}
```

Now:

- Planner directly affects `load`
- Overload Guard becomes meaningful
- Plan Reset has teeth

---

# 3️⃣ Planner command (single write entrypoint)

Add to `KernelCommand`:

```ts
| {
    cmd: "set_daily_plan";
    input: {
      day: string;
      focusItems: {
        id: string;
        label: string;
        estimatedMinutes: number;
      }[];
    };
    idempotencyKey: string;
  }
```

### In `executeCommand`

Replace the fake PLAN_SET logic with:

```ts
if (command.cmd === "set_daily_plan") {
  eventType = "PLAN_SET";
  meta = {
    day: command.input.day,
    focusItems: command.input.focusItems.slice(0, 3), // hard cap
  };
  day = command.input.day;
}
```

**Important constraints (by philosophy):**

- Max 3 items
- Estimates are rough (10, 25, 45, 60)
- Overwriting the plan is allowed anytime

---

# 4️⃣ Plan Reset (core Life OS feature)

Plan Reset is **not** deletion.
It’s **permission to restart**.

### Plan Reset = new PLAN_SET with smaller scope

When the user taps **Apply** on a `PLAN_RESET` suggestion:

- You create a new `PLAN_SET` with:
  - 1 focus item
  - ≤ 15 minutes
  - optional “recovery” label

Example payload from policy:

```ts
payload: {
  mode: "recovery",
  suggestedMinutes: 10
}
```

### Execute Plan Reset command

```ts
{
  cmd: "set_daily_plan",
  input: {
    day: today,
    focusItems: [
      {
        id: "recovery",
        label: "One small stabilizing task",
        estimatedMinutes: 10
      }
    ]
  }
}
```

This **instantly changes LifeState** → load drops → mode stabilizes.

That’s spiral prevention.

---

# 5️⃣ Planner UI (Expo Router)

Create: `app/(tabs)/planner.tsx`

### Planner screen responsibilities

- Show today’s plan (if exists)
- Allow editing / replacing it
- No guilt, no “overwrite warning”

#### Basic UI flow

```txt
No plan yet
→ “What would make today a win?”
→ Pick up to 3 items
→ Choose rough effort
→ Save

Plan exists
→ Show items + total minutes
→ Button: “Reset plan”
→ Button: “Adjust”
```

### Minimal Planner screen logic (pseudo-code)

```tsx
const today = useQuery(getToday);

if (!today.state?.plannedMinutes) {
  showPlanCreator();
} else {
  showCurrentPlan();
}
```

Planner does **not** care if tasks exist yet.
Text labels are fine for now.

---

# 6️⃣ How Planner affects Policies (important)

Once Planner is live:

### Overload Guard becomes:

```ts
if (plannedMinutes > freeMinutes * 1.05) {
  suggest PLAN_RESET
}
```

### Momentum Builder becomes smarter:

- If plan exists but no progress → suggest tiny win _from plan_

### Daily Review becomes contextual:

> “You planned 120 minutes and completed 25. That’s okay. What got in the way?”

No shame. Just signal.

---

# 7️⃣ What NOT to add yet

Do **not** add:

- planner templates
- weekly planning
- calendar blocking
- priority scores
- auto-planning

Those come **after** the planner proves it helps on bad days.

---

# What you’ll have after Planner

✅ A real planning surface
✅ Load detection based on intention, not tasks
✅ Plan Reset as a first-class feature
✅ A visible cause → effect loop:

```
Plan → Load → Suggestion → Reset → Relief
```

That’s the **Life OS feeling**.

---

## Next logical step (only one)

After Planner, the clean next move is:

### **3️⃣ Tasks (very minimal)**

So focus items can reference real tasks.

If you want, say:

> **“3 Tasks (minimal)”**

And I’ll design tasks _only_ as execution units that respect everything you’ve already built.

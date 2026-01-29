# Life State model

1. **Life State model** (enums + formulas + transitions)
2. **Policy Engine** (architecture + rule DSL + conflict resolution)
3. **Event → Insight pipelines** (batch + streaming)
4. **AI-safe action contracts** (JSON schemas + guardrails)
5. **System diagram** (frontend + backend + AI)

---

## 1) Life State model

### 1.1 Core idea

**LifeState = derived snapshot** of the user’s situation for a time window (day/week).
It should be:

- **small** (fast to compute)
- **stable** (doesn’t change randomly)
- **explainable** (always has reasons)

### 1.2 Enums (recommended set)

```ts
// Capacity & execution
type FocusCapacity = "very_low" | "low" | "medium" | "high";
type LoadState = "underloaded" | "balanced" | "overloaded";
type Momentum = "stalled" | "steady" | "strong";
type Friction = "low" | "medium" | "high"; // how hard it feels to start

// Behavior & routines
type HabitHealth = "fragile" | "stable" | "strong";

// Finance (light, non-accounting)
type FinancialDrift = "ok" | "watch" | "risk";

// Planning quality
type PlanQuality = "none" | "rough" | "clear";

// Overall life mode (single top-level mode is great for UX)
type LifeMode = "recovery" | "maintain" | "build" | "sprint";
```

### 1.3 LifeState structure (daily)

Keep **numbers + enums + reasons**.

```ts
type LifeState = {
  day: string; // YYYY-MM-DD

  mode: LifeMode;

  focusCapacity: FocusCapacity;
  load: LoadState;
  momentum: Momentum;
  friction: Friction;

  habitHealth: HabitHealth;
  financialDrift: FinancialDrift;
  planQuality: PlanQuality;

  // Key metrics (0..100 or minutes)
  plannedMinutes: number;
  freeMinutes: number; // available time
  completedMinutes: number;

  completionRate: number; // 0..1
  streakScore: number; // 0..100
  backlogPressure: number; // 0..100
  spendVsIntent: number; // ratio (e.g. 1.2 means 20% over)

  // Explainability: always store WHY the state is what it is
  reasons: Array<{ code: string; detail: string }>;
};
```

### 1.4 How to compute key metrics (simple formulas)

- **freeMinutes**
  - from calendar availability (or default daily capacity if no calendar)

- **plannedMinutes**
  - sum of time-blocked tasks + task estimates in today plan

- **load**
  - `ratio = plannedMinutes / max(1, freeMinutes)`
  - underloaded: ratio < 0.7
  - balanced: 0.7–1.05
  - overloaded: > 1.05

- **momentum**
  - lookback 3 days completed tasks
  - stalled: 0–1 meaningful completes
  - steady: 2–5
  - strong: 6+

- **habitHealth**
  - based on last 7 days: completion % + streak breaks
  - fragile: < 40% or repeated misses
  - stable: 40–75%
  - strong: > 75%

- **financialDrift**
  - if budgets exist: `spendVsIntent` per month
  - ok: ≤ 1.0
  - watch: 1.0–1.15
  - risk: > 1.15

### 1.5 State transitions (the “kernel feel”)

Treat transitions like a **finite state machine** with guards.

#### LifeMode transition rules (example)

- **recovery** if:
  - focusCapacity is low/very_low AND load is overloaded, OR
  - habitHealth fragile for 3+ days

- **maintain** if:
  - load balanced AND momentum steady

- **build** if:
  - load balanced AND momentum strong AND habitHealth stable/strong

- **sprint** if:
  - user explicitly starts sprint AND capacity medium/high AND financialDrift ok/watch

Store transition reason:

```ts
reasons.push({ code: "MODE_TO_RECOVERY", detail: "Overloaded + low capacity" });
```

---

## 2) Build the Policy Engine

### 2.1 Policy engine requirements

- deterministic (same inputs → same outputs)
- explainable
- conflict-aware (avoid spamming)
- can run:
  - on event ingestion (near real-time)
  - on schedule (daily review, weekly review)

### 2.2 Policy interface

```ts
type PolicyContext = {
  now: string;
  state: LifeState;
  recentEvents: KernelEvent[];
  facts: Facts; // precomputed aggregates
};

type ProposedAction = {
  id: string;
  type: KernelAction["type"];
  payload: any;
  priority: 1 | 2 | 3 | 4 | 5; // 5 highest
  cooldownHours?: number;
  reason: { code: string; detail: string };
  requiresUserConfirm: boolean;
  safety: { scope: "local" | "server"; risk: "low" | "med" | "high" };
};

type Policy = {
  name: string;
  when: (ctx: PolicyContext) => boolean;
  propose: (ctx: PolicyContext) => ProposedAction[];
};
```

### 2.3 Conflict resolution (important)

Policies will clash. Use a resolver:

Rules:

1. **Deduplicate by action type** (keep highest priority)
2. **Apply cooldowns** (no repeating same suggestion too often)
3. **Respect life mode**
   - recovery mode blocks “sprint more” suggestions

4. **Limit output**
   - maximum 1–3 suggestions per day

```ts
function resolve(actions: ProposedAction[], ctx: PolicyContext) {
  // filter by cooldown, then sort by priority, then cap to 3
}
```

### 2.4 Starter policies (high impact)

- **Overload Guard**
  - if overloaded → propose reduce scope OR reschedule

- **Momentum Builder**
  - if stalled → propose tiny win task suggestion

- **Focus Protection**
  - if capacity low → propose “light tasks only” plan

- **Habit Downshift**
  - fragile → propose reduce habit target + “recovery version”

- **Financial Drift Watch**
  - risk → propose no-spend day + spending reflection

- **Daily Review**
  - evening → propose 1 reflection question based on the day

---

## 3) Define Event → Insight pipelines

### 3.1 Two pipelines: streaming + batch

- **Streaming**: fast signals after key events (task completed, expense added)
- **Batch**: daily/weekly summaries + deeper correlations

#### Streaming example

Event: `TASK_COMPLETED`

- update aggregates
- update state
- maybe trigger Momentum policy

#### Batch example (nightly)

- compute:
  - completion rate
  - plan accuracy
  - habit health
  - spending drift

- generate insights + store

### 3.2 Insights as structured objects (not just text)

```ts
type Insight = {
  id: string;
  day: string;
  kind:
    | "OVERLOAD"
    | "PLAN_ACCURACY"
    | "MOMENTUM"
    | "HABIT_RISK"
    | "FIN_DRIFT"
    | "PATTERN";

  severity: "info" | "warn" | "risk";
  facts: Record<string, number | string>;
  explanation: string; // short
  evidenceEventIds: string[];
  suggestedActions: ProposedAction[];
};
```

### 3.3 Pipeline stages

1. **Ingest** (append event)
2. **Aggregate** (update counters)
3. **Derive state** (reducer)
4. **Detect insights** (rules/statistics)
5. **Attach actions** (policy runner)
6. **Deliver** (suggestion inbox + notifications)

---

## 4) AI-safe action contracts

### 4.1 Principle

AI can’t “do anything”. It can only:

- propose actions
- execute **approved commands**
- within strict scopes

### 4.2 Command schema (strict)

```json
{
  "cmd": "apply_reschedule",
  "input": {
    "taskId": "tsk_123",
    "newDate": "2026-01-29"
  },
  "constraints": {
    "must_not": ["delete_data", "spend_money", "send_messages"],
    "max_changes": 1
  },
  "expected_events": ["TASK_RESCHEDULED"]
}
```

### 4.3 Guardrails (server-side)

Validate before executing:

- task belongs to user
- newDate is within allowed window (e.g. <= 30 days)
- no mass changes unless explicit permission
- no financial actions beyond logging (no purchases)

### 4.4 Two-phase execution (best UX)

1. **Propose** (AI returns suggestions)
2. **Commit** (user taps “Apply” → command executes)

This prevents “AI did things behind my back”.

---

## 5) System diagram (frontend + backend + AI)

Here’s a good architecture that works local-first and scales:

```txt
┌───────────────────────────┐
│         Mobile App         │
│  (UI + local store MMKV)   │
│  - Tasks/Habits/Calendar    │
│  - Suggestion Inbox         │
└──────────────┬────────────┘
               │ Commands (validated client-side)
               ▼
┌───────────────────────────┐
│        Kernel SDK          │  (can run on-device)
│  - appendEvent()           │
│  - reduceState()           │
│  - runPolicies()           │
│  - buildInsights()         │
└──────────────┬────────────┘
               │ optional sync
               ▼
┌───────────────────────────┐
│          Backend           │
│  Postgres + Drizzle        │
│  - Event Store             │
│  - Snapshots               │
│  - Suggestions             │
│  - Policy runs (cron)      │
└──────────────┬────────────┘
               │ AI calls (propose only)
               ▼
┌───────────────────────────┐
│            AI              │
│  - Reads: state + insights │
│  - Writes: proposals only  │
│  - Never direct mutations  │
└───────────────────────────┘
```

### Where to run what?

- **On-device kernel**: instant suggestions, offline-first
- **Backend batch**: weekly insights, heavier pattern detection
- **AI**: text coaching + planning proposals (never raw DB write)

---

## What I’d do next (concretely)

If you want the fastest path to something impressive:

1. Implement **Event Store + Reducer + 3 policies** on-device
2. Build **Suggestion Inbox**
3. Add **two-phase AI**: propose → user accepts → command executes

There are two ways to get started:

- **TS only (local-first)**
- **TS + Postgres/Drizzle (sync + batch)**

# Life OS Implementation Tickets

This document contains detailed implementation tickets for the Life OS Kernel.

---

## T-001: Event Types & Schema Definition

**Status:** TODO  
**Priority:** P0 (Foundation)

### Description

Define the canonical type definitions for the entire kernel:

- `KernelEvent` union (all event types)
- `LifeState` structure with all enums
- `KernelAction` output types
- `KernelCommand` input types
- `PolicyContext` and `ProposedAction` interfaces

### Requirements

Create `packages/kernel/src/types.ts`:

```ts
// Capacity & execution
export type FocusCapacity = "very_low" | "low" | "medium" | "high";
export type LoadState = "underloaded" | "balanced" | "overloaded";
export type Momentum = "stalled" | "steady" | "strong";
export type Friction = "low" | "medium" | "high";

// Behavior & routines
export type HabitHealth = "fragile" | "stable" | "strong";

// Finance (light, non-accounting)
export type FinancialDrift = "ok" | "watch" | "risk";

// Planning quality
export type PlanQuality = "none" | "rough" | "clear";

// Overall life mode
export type LifeMode = "recovery" | "maintain" | "build" | "sprint";

export type KernelEvent =
  | { type: "TASK_CREATED"; taskId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "TASK_COMPLETED"; taskId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "TASK_RESCHEDULED"; taskId: string; oldDate: string; newDate: string; ts: number; meta?: Record<string, unknown> }
  | { type: "TASK_DELETED"; taskId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "HABIT_DONE"; habitId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "HABIT_MISSED"; habitId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "PLAN_SET"; day: string; top3TaskIds: string[]; ts: number; meta?: Record<string, unknown> }
  | { type: "CAL_BLOCK_ADDED"; blockId: string; day: string; startMin: number; endMin: number; ts: number; meta?: Record<string, unknown> }
  | { type: "CAL_BLOCK_FINISHED"; blockId: string; completed: boolean; ts: number; meta?: Record<string, unknown> }
  | { type: "CAL_BLOCK_REMOVED"; blockId: string; ts: number; meta?: Record<string, unknown> }
  | { type: "EXPENSE_ADDED"; expenseId: string; amount: number; category: string; ts: number; meta?: Record<string, unknown> }
  | { type: "COACHING_FEEDBACK"; suggestionId: string; action: "accepted" | "ignored" | "dismissed"; ts: number; meta?: Record<string, unknown> }
  | { type: "SESSION_START"; ts: number; meta?: Record<string, unknown> }
  | { type: "SESSION_END"; ts: number; meta?: Record<string, unknown> };

export type LifeState = {
  day: string; // YYYY-MM-DD
  mode: LifeMode;
  focusCapacity: FocusCapacity;
  load: LoadState;
  momentum: Momentum;
  friction: Friction;
  habitHealth: HabitHealth;
  financialDrift: FinancialDrift;
  planQuality: PlanQuality;
  plannedMinutes: number;
  freeMinutes: number;
  completedMinutes: number;
  completionRate: number; // 0..1
  streakScore: number; // 0..100
  backlogPressure: number; // 0..100
  spendVsIntent: number; // ratio
  reasons: Array<{ code: string; detail: string }>;
};

export type KernelAction =
  | { type: "SUGGEST_REPLAN_DAY"; reason: string; payload: Record<string, unknown> }
  | { type: "SUGGEST_TIMEBLOCK"; taskId: string; suggestedSlot: { day: string; startMin: number; endMin: number } }
  | { type: "SUGGEST_REDUCE_SCOPE"; taskIds: string[]; toRemoveCount: number }
  | { type: "SUGGEST_HABIT_DOWNSHIFT"; habitId: string; newTarget: string }
  | { type: "SUGGEST_NO_SPEND_TODAY"; reason: string }
  | { type: "AUTO_RESCHEDULE_TASKS"; taskIds: string[]; newDates: Record<string, string> }
  | { type: "ASK_REFLECTION_QUESTION"; questionId: string; text: string }
  | { type: "SUGGEST_TINY_WIN"; taskId: string; reason: string }
  | { type: "SUGGEST_LIGHT_DAY"; suggestedTasks: string[] }
  | { type: "SUGGEST_BACKLOG_CLEANUP"; count: number };

export type KernelCommand =
  | { cmd: "create_task"; input: { title: string; estimateMin: number; dueDate?: string; habitId?: string } }
  | { cmd: "complete_task"; input: { taskId: string } }
  | { cmd: "reschedule_task"; input: { taskId: string; newDate: string } }
  | { cmd: "delete_task"; input: { taskId: string } }
  | { cmd: "add_expense"; input: { amount: number; category: string; note?: string } }
  | { cmd: "set_daily_plan"; input: { day: string; top3TaskIds: string[] } }
  | { cmd: "apply_reschedule"; input: { taskId: string; newDate: string } }
  | { cmd: "downshift_habit"; input: { habitId: string; newTarget: string } }
  | { cmd: "accept_suggestion"; input: { suggestionId: string } };

export type PolicyContext = {
  now: string;
  state: LifeState;
  recentEvents: KernelEvent[];
  facts: {
    plannedMinutes: number;
    freeMinutes: number;
    completedLast3Days: number;
    habitCompletion7Days: number;
    streakBreaks: number;
    spendVsIntent: number;
    backlogCount: number;
  };
};

export type ProposedAction = {
  id: string;
  type: KernelAction["type"];
  priority: 1 | 2 | 3 | 4 | 5;
  cooldownHours?: number;
  reason: { code: string; detail: string };
  payload: Record<string, unknown>;
  requiresUserConfirm: boolean;
  safety: { scope: "local" | "server"; risk: "low" | "med" | "high" };
};

export type Policy = {
  name: string;
  when: (ctx: PolicyContext) => boolean;
  propose: (ctx: PolicyContext) => ProposedAction[];
};
```

### Deliverables

- [ ] `packages/kernel/src/types.ts` with all types exported

### Testing

- [ ] TypeScript compiles without errors
- [ ] All union variants are covered

---

## T-002: Event Store Implementation

**Status:** TODO  
**Priority:** P0 (Foundation)  
**Depends on:** T-001

### Description

Implement the Event Store with append and query capabilities. Local-first storage using MMKV.

### Requirements

Create `packages/kernel/src/events.ts`:

```ts
import type { KernelEvent } from "./types";

interface EventStore {
  appendEvent(event: KernelEvent): Promise<void>;
  getEvents(since?: number, until?: number): Promise<KernelEvent[]>;
  getEventsByType(types: KernelEvent["type"][], since?: number): Promise<KernelEvent[]>;
  getEventCount(): Promise<number>;
  clear(): Promise<void>;
}

const EVENT_STORE_KEY = "@kernel/events";
const EVENT_CURSOR_KEY = "@kernel/event_cursor";

class MMKVEventStore implements EventStore {
  private storage: MMKV;

  constructor() {
    this.storage = new MMKV({ id: "kernel-events" });
  }

  async appendEvent(event: KernelEvent): Promise<void> {
    const events = this.getAllEvents();
    const idempotencyKey = `${event.type}-${event.taskId ?? event.habitId ?? event.blockId ?? event.expenseId ?? event.suggestionId ?? event.ts}`;

    // Check for duplicate
    if (events.some(e => {
      const ek = `${e.type}-${e.taskId ?? e.habitId ?? e.blockId ?? e.expenseId ?? e.suggestionId ?? e.ts}`;
      return ek === idempotencyKey;
    })) {
      return; // Already exists
    }

    events.push({ ...event, _id: crypto.randomUUID() });
    this.storage.set(EVENT_STORE_KEY, JSON.stringify(events));
  }

  async getEvents(since?: number, until?: number): Promise<KernelEvent[]> {
    const events = this.getAllEvents();
    return events.filter(e => {
      if (since && e.ts < since) return false;
      if (until && e.ts > until) return false;
      return true;
    }).sort((a, b) => a.ts - b.ts);
  }

  async getEventsByType(types: KernelEvent["type"][], since?: number): Promise<KernelEvent[]> {
    const events = since ? await this.getEvents(since) : this.getAllEvents();
    return events.filter(e => types.includes(e.type));
  }

  async getEventCount(): Promise<number> {
    return this.getAllEvents().length;
  }

  async clear(): Promise<void> {
    this.storage.clearAll();
  }

  private getAllEvents(): (KernelEvent & { _id: string })[] {
    const raw = this.storage.getString(EVENT_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

export const eventStore = new MMKVEventStore();
export type { EventStore };
```

### Deliverables

- [ ] `packages/kernel/src/events.ts` implementation
- [ ] Tests for append and query operations

### Testing

- [ ] Append duplicates are filtered
- [ ] Query by time range works
- [ ] Query by type works

---

## T-003: LifeState Reducer Implementation

**Status:** TODO  
**Priority:** P0 (Foundation)  
**Depends on:** T-001, T-002

### Description

Implement the state reducer that computes LifeState from events. Includes all metric formulas from life-os-states.md.

### Requirements

Create `packages/kernel/src/reducer.ts`:

```ts
import type { LifeState, KernelEvent, FocusCapacity, LoadState, Momentum, HabitHealth, FinancialDrift, PlanQuality, LifeMode } from "./types";

const DEFAULT_STATE: LifeState = {
  day: new Date().toISOString().split("T")[0],
  mode: "maintain",
  focusCapacity: "medium",
  load: "balanced",
  momentum: "steady",
  friction: "medium",
  habitHealth: "stable",
  financialDrift: "ok",
  planQuality: "none",
  plannedMinutes: 0,
  freeMinutes: 480, // 8 hours default
  completedMinutes: 0,
  completionRate: 0,
  streakScore: 50,
  backlogPressure: 0,
  spendVsIntent: 1.0,
  reasons: [],
};

export function createInitialState(day: string): LifeState {
  return { ...DEFAULT_STATE, day, reasons: [] };
}

export function reduce(prevState: LifeState, event: KernelEvent): LifeState {
  const state = { ...prevState };
  const reasons = [...state.reasons];

  switch (event.type) {
    case "TASK_COMPLETED": {
      const task = getTaskById(event.taskId); // Would fetch from task store
      state.completedMinutes += task?.estimateMin ?? 30;
      state.completionRate = state.plannedMinutes > 0
        ? state.completedMinutes / state.plannedMinutes
        : 0;
      reasons.push({ code: "TASK_DONE", detail: `Completed task ${event.taskId}` });
      break;
    }
    case "CAL_BLOCK_FINISHED": {
      const block = getBlockById(event.blockId); // Would fetch from calendar store
      if (event.completed) {
        state.completedMinutes += block?.durationMin ?? 30;
      }
      break;
    }
    case "PLAN_SET": {
      state.planQuality = event.top3TaskIds.length === 3 ? "clear" : "rough";
      reasons.push({ code: "PLAN_SET", detail: `Set ${event.top3TaskIds.length} priorities` });
      break;
    }
    // ... handle all event types
  }

  // Compute derived metrics after all event processing
  computeDerivedMetrics(state, reasons);

  return { ...state, reasons };
}

function computeDerivedMetrics(state: LifeState, reasons: LifeState["reasons"]): void {
  // Load calculation
  const loadRatio = state.plannedMinutes / Math.max(1, state.freeMinutes);
  if (loadRatio < 0.7) {
    state.load = "underloaded";
  } else if (loadRatio <= 1.05) {
    state.load = "balanced";
  } else {
    state.load = "overloaded";
    reasons.push({ code: "OVERLOAD", detail: `Planning ${Math.round(loadRatio * 100)}% of free time` });
  }

  // Momentum (computed from recent events in production)
  const recentCompletions = getRecentCompletionCount(3); // Would query event store
  if (recentCompletions <= 1) {
    state.momentum = "stalled";
  } else if (recentCompletions <= 5) {
    state.momentum = "steady";
  } else {
    state.momentum = "strong";
  }

  // Habit health
  const habitCompletion = getHabitCompletion7Days();
  if (habitCompletion < 0.4) {
    state.habitHealth = "fragile";
    reasons.push({ code: "HABIT_FRAGILE", detail: `${Math.round(habitCompletion * 100)}% habit completion` });
  } else if (habitCompletion <= 0.75) {
    state.habitHealth = "stable";
  } else {
    state.habitHealth = "strong";
  }

  // Financial drift
  if (state.spendVsIntent > 1.15) {
    state.financialDrift = "risk";
    reasons.push({ code: "FINANCIAL_RISK", detail: `${Math.round((state.spendVsIntent - 1) * 100)}% over budget` });
  } else if (state.spendVsIntent > 1.0) {
    state.financialDrift = "watch";
  } else {
    state.financialDrift = "ok";
  }

  // LifeMode transitions
  state.mode = computeLifeMode(state);

  // Backlog pressure
  const backlogCount = getBacklogCount();
  state.backlogPressure = Math.min(100, backlogCount * 5); // Simple formula
}

function computeLifeMode(state: LifeState): LifeMode {
  // Recovery if overloaded + low capacity OR fragile habits 3+ days
  if ((state.load === "overloaded" && (state.focusCapacity === "low" || state.focusCapacity === "very_low")) ||
      state.habitHealth === "fragile") {
    return "recovery";
  }

  // Maintain if balanced + steady momentum
  if (state.load === "balanced" && state.momentum === "steady") {
    return "maintain";
  }

  // Build if balanced + strong momentum + healthy habits
  if (state.load === "balanced" && state.momentum === "strong" &&
      (state.habitHealth === "stable" || state.habitHealth === "strong")) {
    return "build";
  }

  return "maintain"; // Default
}

export type { LifeState };
```

### Deliverables

- [ ] `packages/kernel/src/reducer.ts` implementation
- [ ] Unit tests for reducer with all event types

### Testing

- [ ] All event types correctly update state
- [ ] Derived metrics (load, momentum, habitHealth) computed correctly
- [ ] LifeMode transitions follow rules
- [ ] Reasons array captures explainability

---

## T-004: Policy Engine Framework

**Status:** TODO  
**Priority:** P1 (Core)  
**Depends on:** T-001, T-003

### Description

Build the policy runner framework with conflict resolution and policy interface.

### Requirements

Create `packages/kernel/src/policies/index.ts`:

```ts
import type { Policy, PolicyContext, ProposedAction, KernelAction } from "../types";

export interface PolicyEngine {
  runPolicies(ctx: PolicyContext): ProposedAction[];
  addPolicy(policy: Policy): void;
  removePolicy(name: string): void;
  getPolicies(): Policy[];
}

class DefaultPolicyEngine implements PolicyEngine {
  private policies: Policy[] = [];

  runPolicies(ctx: PolicyContext): ProposedAction[] {
    const allActions: ProposedAction[] = [];

    for (const policy of this.policies) {
      if (policy.when(ctx)) {
        const actions = policy.propose(ctx);
        allActions.push(...actions);
      }
    }

    return this.resolveConflicts(allActions, ctx);
  }

  addPolicy(policy: Policy): void {
    this.policies.push(policy);
  }

  removePolicy(name: string): void {
    this.policies = this.policies.filter(p => p.name !== name);
  }

  getPolicies(): Policy[] {
    return [...this.policies];
  }

  private resolveConflicts(actions: ProposedAction[], ctx: PolicyContext): ProposedAction[] {
    // 1. Deduplicate by action type (keep highest priority)
    const byType = new Map<string, ProposedAction>();
    for (const action of actions) {
      const existing = byType.get(action.type);
      if (!existing || action.priority > existing.priority) {
        byType.set(action.type, action);
      }
    }

    // 2. Filter by cooldown
    const now = Date.now();
    const filtered = Array.from(byType.values()).filter(action => {
      if (!action.cooldownHours) return true;
      const lastShown = this.getLastShown(action.type);
      if (!lastShown) return true;
      return now - lastShown > action.cooldownHours * 60 * 60 * 1000;
    });

    // 3. Respect life mode guards
    const modeGuarded = filtered.filter(action => {
      if (action.type === "SUGGEST_REPLAN_DAY" && ctx.state.mode === "recovery") {
        return false; // Recovery mode blocks replan suggestions
      }
      return true;
    });

    // 4. Cap to 3 suggestions
    return modeGuarded
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);
  }

  private getLastShown(actionType: string): number | null {
    // Would retrieve from storage
    return null;
  }
}

export const policyEngine = new DefaultPolicyEngine();
export type { Policy, PolicyContext, ProposedAction };
```

### Deliverables

- [ ] `packages/kernel/src/policies/index.ts` with PolicyEngine
- [ ] Export policy interface

### Testing

- [ ] Deduplication keeps highest priority
- [ ] Cooldown filtering works
- [ ] LifeMode guards respected
- [ ] Max 3 suggestions returned

---

## T-005: Core Policies Implementation

**Status:** TODO  
**Priority:** P1 (Core)  
**Depends on:** T-004

### Description

Implement the 7 core policies for Life OS.

### Requirements

Create individual policy files in `packages/kernel/src/policies/`:

**overload-guard.ts:**

```ts
import type { Policy } from "../types";

export const overloadGuard: Policy = {
  name: "overload-guard",
  when: (ctx) => ctx.state.load === "overloaded",
  propose: (ctx) => {
    const overloadRatio = ctx.facts.plannedMinutes / ctx.facts.freeMinutes;

    if (overloadRatio > 1.5) {
      return [{
        id: `og-remove-${Date.now()}`,
        type: "SUGGEST_REDUCE_SCOPE",
        priority: 5,
        reason: { code: "OVERLOAD_HIGH", detail: `Planning ${Math.round(overloadRatio * 100)}% of time` },
        payload: { count: 3 },
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      }];
    }

    return [{
      id: `og-reschedule-${Date.now()}`,
      type: "SUGGEST_TIMEBLOCK",
      priority: 4,
      reason: { code: "OVERLOAD_MODERATE", detail: "Some tasks need better scheduling" },
      payload: {},
      requiresUserConfirm: true,
      safety: { scope: "local", risk: "low" },
    }];
  },
};
```

**momentum-builder.ts:**

```ts
import type { Policy } from "../types";

export const momentumBuilder: Policy = {
  name: "momentum-builder",
  when: (ctx) => ctx.state.momentum === "stalled",
  propose: (ctx) => {
    const tinyWinTask = ctx.state.backlogPressure > 0
      ? getTinyWinTask(ctx) // Helper to find ≤10 min task
      : null;

    if (tinyWinTask) {
      return [{
        id: `mb-tinywin-${Date.now()}`,
        type: "SUGGEST_TINY_WIN",
        priority: 4,
        reason: { code: "MOMENTUM_STALLED", detail: "A small win could restart your momentum" },
        payload: { taskId: tinyWinTask.id },
        requiresUserConfirm: false,
        safety: { scope: "local", risk: "low" },
      }];
    }

    return [{
      id: `mb-lightday-${Date.now()}`,
      type: "SUGGEST_LIGHT_DAY",
      priority: 3,
      reason: { code: "MOMENTUM_STALLED", detail: "Try a lighter day to build momentum" },
      payload: {},
      requiresUserConfirm: true,
      safety: { scope: "local", risk: "low" },
    }];
  },
};
```

**focus-protection.ts:**

```ts
import type { Policy } from "../types";

export const focusProtection: Policy = {
  name: "focus-protection",
  when: (ctx) => ctx.state.focusCapacity === "low" || ctx.state.focusCapacity === "very_low",
  propose: (ctx) => {
    if (ctx.state.load === "overloaded") {
      return [{
        id: `fp-recover-${Date.now()}`,
        type: "SUGGEST_REPLAN_DAY",
        priority: 5,
        reason: { code: "LOW_CAPACITY", detail: "Low focus - reschedule heavy work" },
        payload: { mode: "recovery" },
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      }];
    }

    return [{
      id: `fp-light-${Date.now()}`,
      type: "SUGGEST_LIGHT_DAY",
      priority: 3,
      reason: { code: "LOW_CAPACITY", detail: "Focus capacity is low today" },
      payload: {},
      requiresUserConfirm: true,
      safety: { scope: "local", risk: "low" },
    }];
  },
};
```

**habit-downshift.ts:**

```ts
import type { Policy } from "../types";

export const habitDownshift: Policy = {
  name: "habit-downshift",
  when: (ctx) => ctx.state.habitHealth === "fragile",
  propose: (ctx) => {
    return [{
      id: `hd-${Date.now()}`,
      type: "SUGGEST_HABIT_DOWNSHIFT",
      priority: 3,
      reason: { code: "HABIT_FRAGILE", detail: "Habits need recovery too" },
      payload: { newTarget: "3x/week" },
      requiresUserConfirm: true,
      safety: { scope: "local", risk: "low" },
    }];
  },
};
```

**financial-drift-watch.ts:**

```ts
import type { Policy } from "../types";

export const financialDriftWatch: Policy = {
  name: "financial-drift-watch",
  when: (ctx) => ctx.state.financialDrift === "risk",
  propose: (ctx) => {
    return [{
      id: `fdw-${Date.now()}`,
      type: "SUGGEST_NO_SPEND_TODAY",
      priority: 2,
      reason: { code: "FINANCIAL_DRIFT", detail: "Spending ahead of plan" },
      payload: {},
      requiresUserConfirm: false,
      safety: { scope: "local", risk: "low" },
    }];
  },
};
```

**end-of-day-review.ts:**

```ts
import type { Policy } from "../types";

export const endOfDayReview: Policy = {
  name: "end-of-day-review",
  when: (ctx) => {
    const hour = new Date(ctx.now).getHours();
    return hour >= 20; // After 8 PM
  },
  propose: (ctx) => {
    const questions = generateReflectionQuestions(ctx);
    const question = questions[Math.floor(Math.random() * questions.length)];

    return [{
      id: `eod-${Date.now()}`,
      type: "ASK_REFLECTION_QUESTION",
      priority: 1,
      reason: { code: "END_OF_DAY", detail: "Time for reflection" },
      payload: { questionId: question.id, text: question.text },
      requiresUserConfirm: false,
      safety: { scope: "local", risk: "low" },
    }];
  },
};

function generateReflectionQuestions(ctx: PolicyContext) {
  const questions = [];

  if (ctx.state.completionRate < 0.5) {
    questions.push({ id: "q-low-completion", text: "What got in the way of your plans today?" });
  }
  if (ctx.state.momentum === "stalled") {
    questions.push({ id: "q-momentum", text: "What's one small thing that felt good to do?" });
  }
  if (ctx.state.load === "overloaded") {
    questions.push({ id: "q-overload", text: "What would you remove from today if you could?" });
  }

  return questions.length > 0
    ? questions
    : [{ id: "q-general", text: "What's one thing you're grateful for today?" }];
}
```

**backlog-pressure-valve.ts:**

```ts
import type { Policy } from "../types";

export const backlogPressureValve: Policy = {
  name: "backlog-pressure-valve",
  when: (ctx) => ctx.state.backlogPressure > 60,
  propose: (ctx) => {
    return [{
      id: `bpv-${Date.now()}`,
      type: "SUGGEST_BACKLOG_CLEANUP",
      priority: 2,
      reason: { code: "BACKLOG_HIGH", detail: `${ctx.facts.backlogCount} items waiting` },
      payload: { count: Math.ceil(ctx.facts.backlogCount / 10) },
      requiresUserConfirm: true,
      safety: { scope: "local", risk: "low" },
    }];
  },
};
```

### Deliverables

- [ ] `packages/kernel/src/policies/overload-guard.ts`
- [ ] `packages/kernel/src/policies/momentum-builder.ts`
- [ ] `packages/kernel/src/policies/focus-protection.ts`
- [ ] `packages/kernel/src/policies/habit-downshift.ts`
- [ ] `packages/kernel/src/policies/financial-drift-watch.ts`
- [ ] `packages/kernel/src/policies/end-of-day-review.ts`
- [ ] `packages/kernel/src/policies/backlog-pressure-valve.ts`
- [ ] `packages/kernel/src/policies/index.ts` exporting all policies

### Testing

- [ ] Each policy fires on correct conditions
- [ ] Actions have correct priority levels
- [ ] Reasons are explainable

---

## T-006: Command Pipeline

**Status:** TODO  
**Priority:** P2 (AI Safety)  
**Depends on:** T-001, T-002

### Description

Implement command validation, guardrails, and two-phase execution.

### Requirements

Create `packages/kernel/src/commands.ts`:

```ts
import type { KernelCommand, KernelEvent } from "./types";
import { eventStore } from "./events";

type CommandResult =
  | { success: true; events: KernelEvent[] }
  | { success: false; error: string; code: "VALIDATION_ERROR" | "GUARDRAIL_ERROR" | "NOT_FOUND" };

interface CommandHandler {
  validate(input: unknown): { valid: boolean; error?: string };
  guardrails(command: KernelCommand, existingState: unknown): { pass: boolean; reason?: string };
  execute(command: KernelCommand): Promise<KernelEvent[]>;
}

const commandHandlers: Record<string, CommandHandler> = {
  create_task: {
    validate: (input) => {
      const req = input as { title: string; estimateMin: number };
      if (!req.title || req.title.trim().length === 0) {
        return { valid: false, error: "Title required" };
      }
      if (req.estimateMin < 5 || req.estimateMin > 480) {
        return { valid: false, error: "Estimate must be 5-480 minutes" };
      }
      return { valid: true };
    },
    guardrails: (cmd) => ({ pass: true }),
    execute: async (cmd) => {
      const taskId = `tsk_${Date.now()}`;
      return [{
        type: "TASK_CREATED",
        taskId,
        ts: Date.now(),
        meta: cmd.input,
      }];
    },
  },
  complete_task: {
    validate: (input) => {
      const req = input as { taskId: string };
      if (!req.taskId) return { valid: false, error: "TaskId required" };
      return { valid: true };
    },
    guardrails: (cmd) => {
      // Would check task ownership
      return { pass: true };
    },
    execute: async (cmd) => {
      return [{
        type: "TASK_COMPLETED",
        taskId: cmd.input.taskId,
        ts: Date.now(),
      }];
    },
  },
  // ... other commands
};

export async function executeCommand(command: KernelCommand): Promise<CommandResult> {
  const handler = commandHandlers[command.cmd];

  if (!handler) {
    return { success: false, error: `Unknown command: ${command.cmd}`, code: "VALIDATION_ERROR" };
  }

  // Phase 1: Validation
  const validation = handler.validate(command.input);
  if (!validation.valid) {
    return { success: false, error: validation.error!, code: "VALIDATION_ERROR" };
  }

  // Phase 2: Guardrails (would pass current state in production)
  const guardrails = handler.guardrails(command, null);
  if (!guardrails.pass) {
    return { success: false, error: guardrails.reason!, code: "GUARDRAIL_ERROR" };
  }

  // Phase 3: Execute
  const events = await handler.execute(command);

  // Phase 4: Append events
  for (const event of events) {
    await eventStore.appendEvent(event);
  }

  return { success: true, events };
}

export type { CommandResult };
```

### Deliverables

- [ ] `packages/kernel/src/commands.ts` with command pipeline
- [ ] Validation for each command type
- [ ] Guardrails for safety

### Testing

- [ ] Invalid commands rejected
- [ ] Guardrails block unsafe commands
- [ ] Valid commands produce events

---

## T-007: Suggestion Inbox UI

**Status:** TODO  
**Priority:** P2 (User Facing)  
**Depends on:** T-005, T-006

### Description

Create UI component for displaying and acting on policy suggestions.

### Requirements

Create `apps/native/components/suggestion-inbox.tsx`:

```tsx
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Card } from "./ui/glass-card";
import { MachineText } from "./ui/machine-text";
import { policyEngine } from "@/kernel/policies";
import { executeCommand } from "@/kernel/commands";

interface Suggestion {
  id: string;
  type: string;
  reason: { code: string; detail: string };
  priority: number;
  requiresUserConfirm: boolean;
  payload: Record<string, unknown>;
}

export function SuggestionInbox() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    setLoading(true);
    // Would compute context and run policies
    const ctx = await buildPolicyContext();
    const actions = policyEngine.runPolicies(ctx);

    setSuggestions(actions.map(a => ({
      id: a.id,
      type: a.type,
      reason: a.reason,
      priority: a.priority,
      requiresUserConfirm: a.requiresUserConfirm,
      payload: a.payload,
    })));

    setLoading(false);
  }

  async function handleAccept(suggestion: Suggestion) {
    if (suggestion.requiresUserConfirm) {
      // Show confirmation dialog
    }

    const result = await executeCommand({
      cmd: "accept_suggestion",
      input: { suggestionId: suggestion.id },
    });

    if (result.success) {
      setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    }
  }

  function handleIgnore(suggestion: Suggestion) {
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  }

  if (loading) return null;
  if (suggestions.length === 0) return null;

  return (
    <Card className="mx-4 mt-4 p-4">
      <MachineText variant="label" className="mb-2">SUGGESTIONS</MachineText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {suggestions.map(suggestion => (
          <TouchableOpacity
            key={suggestion.id}
            className="mr-3 p-3 bg-surface/50 rounded-lg border border-accent/30"
            onPress={() => handleAccept(suggestion)}
          >
            <Text className="text-white font-mono text-sm mb-1">
              {formatActionType(suggestion.type)}
            </Text>
            <Text className="text-gray-400 font-mono text-xs">
              {suggestion.reason.detail}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Card>
  );
}

function formatActionType(type: string): string {
  return type.replace("SUGGEST_", "").replace(/_/g, " ");
}
```

### Deliverables

- [ ] `apps/native/components/suggestion-inbox.tsx`
- [ ] Integration in appropriate layout

### Testing

- [ ] Suggestions display correctly
- [ ] Accept/ignore handlers work
- [ ] Empty state handled

---

## T-008: Kernel Provider/Context

**Status:** TODO  
**Priority:** P0 (Integration)  
**Depends on:** T-002, T-003, T-005

### Description

Create React Context exposing kernel methods to the app.

### Requirements

Create `apps/native/lib/kernel-provider.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { LifeState, KernelEvent } from "@/kernel/types";
import { eventStore } from "@/kernel/events";
import { reduce, createInitialState } from "@/kernel/reducer";
import { policyEngine } from "@/kernel/policies";
import * as overloadGuard from "@/kernel/policies/overload-guard";
import * as momentumBuilder from "@/kernel/policies/momentum-builder";
// ... import all policies

interface KernelContextValue {
  state: LifeState | null;
  appendEvent: (event: KernelEvent) => Promise<void>;
  executeCommand: (cmd: unknown) => Promise<{ success: boolean }>;
  refreshState: () => Promise<void>;
}

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LifeState | null>(null);

  useEffect(() => {
    // Register policies
    policyEngine.addPolicy(overloadGuard.overloadGuard);
    policyEngine.addPolicy(momentumBuilder.momentumBuilder);
    // ... register all policies

    // Load initial state
    refreshState();
  }, []);

  async function refreshState() {
    const today = new Date().toISOString().split("T")[0];
    let currentState = createInitialState(today);

    const events = await eventStore.getEvents();
    for (const event of events) {
      currentState = reduce(currentState, event);
    }

    setState(currentState);
  }

  async function appendEvent(event: KernelEvent) {
    await eventStore.appendEvent(event);
    await refreshState();
  }

  async function executeCommand(cmd: unknown) {
    // Would use command pipeline
    return { success: true };
  }

  return (
    <KernelContext.Provider value={{ state, appendEvent, executeCommand, refreshState }}>
      {children}
    </KernelContext.Provider>
  );
}

export function useKernel() {
  const context = useContext(KernelContext);
  if (!context) {
    throw new Error("useKernel must be used within KernelProvider");
  }
  return context;
}
```

### Deliverables

- [ ] `apps/native/lib/kernel-provider.tsx`
- [ ] Export `useKernel` hook

### Testing

- [ ] Context provides state
- [ ] Events update state correctly

---

## T-009: Integration in App Layout

**Status:** TODO  
**Priority:** P0 (Integration)  
**Depends on:** T-007, T-008

### Description

Integrate KernelProvider and SuggestionInbox in the app layout.

### Requirements

Update `apps/native/app/_layout.tsx`:

```tsx
import { KernelProvider } from "@/lib/kernel-provider";
import { SuggestionInbox } from "@/components/suggestion-inbox";

export default function Layout() {
  return (
    <KernelProvider>
      <Container>
        <SuggestionInbox />
        {/* existing layout */}
      </Container>
    </KernelProvider>
  );
}
```

### Deliverables

- [ ] Updated `apps/native/app/_layout.tsx`

---

## T-010: Package Export & Build

**Status:** TODO  
**Priority:** P1 (DevEx)  
**Depends on:** All above

### Description

Export kernel package properly for consumption.

### Requirements

Create `packages/kernel/src/index.ts`:

```ts
// Types
export * from "./types";

// Events
export { eventStore } from "./events";
export type { EventStore } from "./events";

// Reducer
export { reduce, createInitialState } from "./reducer";
export type { LifeState } from "./reducer";

// Policies
export { policyEngine } from "./policies";
export * from "./policies";

// Commands
export { executeCommand } from "./commands";
export type { CommandResult } from "./commands";
```

Create `packages/kernel/package.json`:

```json
{
  "name": "@tidy-comet/kernel",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "mmkv": "^1.x.x"
  },
  "devDependencies": {
    "typescript": "^5.x.x"
  }
}
```

### Deliverables

- [ ] `packages/kernel/src/index.ts`
- [ ] `packages/kernel/package.json`
- [ ] `packages/kernel/tsconfig.json`

---

## Implementation Order

| Order | Ticket | Why                          |
| ----- | ------ | ---------------------------- |
| 1     | T-001  | All code depends on types    |
| 2     | T-002  | Events needed for reducer    |
| 3     | T-003  | State needed for policies    |
| 4     | T-004  | Framework for policies       |
| 5     | T-005  | Core intelligence            |
| 6     | T-006  | AI safety (optional for MVP) |
| 7     | T-008  | Context for UI integration   |
| 8     | T-007  | UI for suggestions           |
| 9     | T-009  | Connect to app               |
| 10    | T-010  | Package cleanup              |

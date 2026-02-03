# Native Kernel Integration Plan

This document covers the native app integration for the Life OS Kernel. The backend kernel (`packages/backend/convex/kernel/`) is already complete with:

- Event Store & Types (`src/kernel/types.ts`)
- State Reducer (`packages/backend/convex/kernel/reducer.ts`)
- Policy Engine (`packages/backend/convex/kernel/policies.ts`)
- AI Agents (`packages/backend/convex/kernel/agents.ts`)
- Command Pipeline (`packages/backend/convex/kernel/commands.ts`)

This plan focuses on **bringing local-first kernel capabilities to the native app**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Native App (Expo)                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              KernelProvider (React Context)         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────┐  │    │
│  │  │Local Event  │  │  Reducer    │  │ Policies  │  │    │
│  │  │Store (MMKV) │  │  (local)    │  │ (local)   │  │    │
│  │  └─────────────┘  └─────────────┘  └───────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│              ┌─────────────┴─────────────┐                   │
│              │    SuggestionInbox UI      │                   │
│              │    (accept/ignore)         │                   │
│              └────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                            │
              Convex Sync (bidirectional)
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend Kernel (Convex)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐      │
│  │ Event Store │  │   Reducer   │  │ AI Agents     │      │
│  │ (Postgres)  │  │   (server)  │  │ Claude/GPT    │      │
│  └─────────────┘  └─────────────┘  └───────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## NK-001: Local Event Store (MMKV)

**Status:** TODO  
**Priority:** P0 (Foundation)  
**Owner:** @kernel  
**Depends on:** Types from `src/kernel/types.ts`

### Description

Implement a local-first event store using MMKV for offline-first capability. This mirrors the Convex event store but lives on-device for instant access and offline support.

### Requirements

Create `apps/native/lib/kernel/local-event-store.ts`:

```ts
import { MMKV } from "react-native-mmkv";
import type { KernelEvent } from "@tidy-comet/kernel/types";

const EVENT_STORE_KEY = "@kernel/events";
const EVENT_CURSOR_KEY = "@kernel/event_cursor";

export interface LocalEventStore {
  appendEvent(event: KernelEvent): Promise<void>;
  getEvents(since?: number, until?: number): Promise<KernelEvent[]>;
  getEventsByType(types: KernelEvent["type"][], since?: number): Promise<KernelEvent[]>;
  getEventCount(): Promise<number>;
  getLastSyncTimestamp(): number | null;
  setLastSyncTimestamp(ts: number): void;
  clear(): Promise<void>;
}

class MMKVEventStore implements LocalEventStore {
  private storage: MMKV;
  private syncStorage: MMKV;

  constructor() {
    this.storage = new MMKV({ id: "kernel-events" });
    this.syncStorage = new MMKV({ id: "kernel-sync" });
  }

  async appendEvent(event: KernelEvent): Promise<void> {
    const events = this.getAllEvents();
    const idempotencyKey = this.getIdempotencyKey(event);

    if (events.some(e => this.getIdempotencyKey(e) === idempotencyKey)) {
      return;
    }

    const eventWithMeta = {
      ...event,
      _id: `${event.type}-${event.ts}`,
      _synced: false,
    };

    events.push(eventWithMeta);
    this.storage.set(EVENT_STORE_KEY, JSON.stringify(events));
  }

  async getEvents(since?: number, until?: number): Promise<KernelEvent[]> {
    const events = this.getAllEvents();
    return events
      .filter(e => {
        if (since && e.ts < since) return false;
        if (until && e.ts > until) return false;
        return true;
      })
      .sort((a, b) => a.ts - b.ts);
  }

  async getEventsByType(types: KernelEvent["type"][], since?: number): Promise<KernelEvent[]> {
    const events = since ? await this.getEvents(since) : this.getAllEvents();
    return events.filter(e => types.includes(e.type));
  }

  async getEventCount(): Promise<number> {
    return this.getAllEvents().length;
  }

  getLastSyncTimestamp(): number | null {
    return this.syncStorage.getNumber(EVENT_CURSOR_KEY) || null;
  }

  setLastSyncTimestamp(ts: number): void {
    this.syncStorage.set(EVENT_CURSOR_KEY, ts);
  }

  async clear(): Promise<void> {
    this.storage.clearAll();
  }

  private getIdempotencyKey(event: KernelEvent): string {
    const id = (event as any).taskId ??
               (event as any).habitId ??
               (event as any).blockId ??
               (event as any).expenseId ??
               (event as any).suggestionId ??
               event.ts;
    return `${event.type}-${id}`;
  }

  private getAllEvents(): (KernelEvent & { _id: string; _synced: boolean })[] {
    const raw = this.storage.getString(EVENT_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  }
}

export const localEventStore = new MMKVEventStore();
```

### Sync Protocol

The local store tracks `_synced` flag. When online:

1. Query unsynced events (`_synced === false`)
2. Send to Convex `kernel.syncEvents` mutation
3. Mark as synced on success
4. Update `lastSyncTimestamp`

### Deliverables

- [ ] `apps/native/lib/kernel/local-event-store.ts`
- [ ] Type imports from shared types package
- [ ] Sync helper functions
- [ ] Tests for append, query, idempotency

### Testing

- [ ] Duplicate events are filtered
- [ ] Time range queries work
- [ ] Sync flag tracking works

---

## NK-002: Local State Reducer

**Status:** TODO  
**Priority:** P0 (Foundation)  
**Depends on:** NK-001, Shared types

### Description

Implement a local state reducer that mirrors the Convex reducer for instant UI updates. The native app computes `LifeState` from local events before syncing to the backend.

### Requirements

Create `apps/native/lib/kernel/local-reducer.ts`:

```ts
import type {
  LifeState,
  KernelEvent,
  LoadState,
  Momentum,
  FocusCapacity,
  HabitHealth,
  FinancialDrift,
  LifeMode
} from "@tidy-comet/kernel/types";

const DEFAULT_STATE: LifeState = {
  day: new Date().toISOString().split("T")[0],
  mode: "maintain",
  focusCapacity: "medium",
  load: "balanced",
  momentum: "steady",
  habitHealth: "stable",
  financialDrift: "ok",
  plannedMinutes: 0,
  freeMinutes: 480,
  completedMinutes: 0,
  completedTasksCount: 0,
  stabilityScore: 50,
  effectiveFreeMinutes: 480,
  focusMinutes: 0,
  busyMinutes: 0,
  backlogPressure: 0,
  reasons: [],
};

export function createInitialState(day: string): LifeState {
  return { ...DEFAULT_STATE, day, reasons: [] };
}

export function reduce(prevState: LifeState, event: KernelEvent): LifeState {
  const state = { ...prevState };
  const reasons = [...state.reasons];

  switch (event.type) {
    case "TASK_CREATED": {
      state.plannedMinutes += (event as any).estimateMin ?? 30;
      reasons.push({
        code: "TASK_CREATED",
        detail: `Added task with ${(event as any).estimateMin ?? 30}min estimate`
      });
      break;
    }

    case "TASK_COMPLETED": {
      const task = (event as any).meta;
      const estimate = task?.estimateMin ?? 30;
      state.completedMinutes += estimate;
      state.completedTasksCount += 1;
      reasons.push({
        code: "TASK_COMPLETED",
        detail: `Completed ${estimate}min task`
      });
      break;
    }

    case "PLAN_SET": {
      const focusItems = (event as any).focusItems ?? [];
      state.plannedMinutes = focusItems.reduce(
        (sum: number, item: any) => sum + (item.estimatedMinutes ?? 30),
        0
      );
      reasons.push({
        code: "PLAN_SET",
        detail: `Set ${focusItems.length} focus items`
      });
      break;
    }

    case "CAL_BLOCK_ADDED": {
      const block = event as any;
      state.busyMinutes += (block.endMin - block.startMin);
      reasons.push({
        code: "CAL_BLOCK_ADDED",
        detail: `Added ${(block.endMin - block.startMin)}min block`
      });
      break;
    }

    case "REST_ACCEPTED": {
      const minutes = (event as any).minutes ?? 0;
      state.focusMinutes += minutes;
      reasons.push({
        code: "REST_ACCEPTED",
        detail: `Logged ${minutes}min of rest`
      });
      break;
    }

    case "RECOVERY_PROTOCOL_USED": {
      reasons.push({
        code: "RECOVERY_PROTOCOL_USED",
        detail: "Used recovery protocol"
      });
      break;
    }
  }

  computeDerivedMetrics(state, reasons);

  return { ...state, reasons };
}

function computeDerivedMetrics(
  state: LifeState,
  reasons: LifeState["reasons"]
): void {
  state.effectiveFreeMinutes = Math.max(0, state.freeMinutes - state.busyMinutes);

  const loadRatio = state.plannedMinutes / Math.max(1, state.effectiveFreeMinutes);
  if (loadRatio < 0.7) {
    state.load = "underloaded";
  } else if (loadRatio <= 1.0) {
    state.load = "balanced";
  } else {
    state.load = "overloaded";
    reasons.push({
      code: "OVERLOAD",
      detail: `Planning ${Math.round(loadRatio * 100)}% of effective time`
    });
  }

  const completionRatio = state.plannedMinutes > 0
    ? state.completedMinutes / state.plannedMinutes
    : 0;

  if (completionRatio < 0.3) {
    state.momentum = "stalled";
    reasons.push({ code: "MOMENTUM_STALLED", detail: "Less than 30% completion rate" });
  } else if (completionRatio < 0.7) {
    state.momentum = "steady";
  } else {
    state.momentum = "strong";
  }

  state.focusCapacity = computeFocusCapacity(state);
  state.mode = computeLifeMode(state);
  state.stabilityScore = computeStabilityScore(state);
}

function computeFocusCapacity(state: LifeState): FocusCapacity {
  if (state.load === "overloaded" && state.momentum === "stalled") {
    return "very_low";
  }
  if (state.load === "overloaded" || state.momentum === "stalled") {
    return "low";
  }
  if (state.load === "balanced" && state.momentum === "steady") {
    return "medium";
  }
  return "high";
}

function computeLifeMode(state: LifeState): LifeMode {
  if (state.focusCapacity === "very_low" ||
      (state.focusCapacity === "low" && state.load === "overloaded")) {
    return "recovery";
  }
  if (state.load === "balanced" && state.momentum === "steady") {
    return "maintain";
  }
  if (state.load === "balanced" && state.momentum === "strong") {
    return "build";
  }
  return "maintain";
}

function computeStabilityScore(state: LifeState): number {
  let score = 50;

  if (state.momentum === "strong") score += 20;
  else if (state.momentum === "stalled") score -= 10;

  if (state.load === "balanced") score += 15;
  else if (state.load === "overloaded") score -= 15;

  if (state.focusCapacity === "high") score += 15;
  else if (state.focusCapacity === "very_low") score -= 20;

  return Math.max(0, Math.min(100, score));
}
```

### Deliverables

- [ ] `apps/native/lib/kernel/local-reducer.ts`
- [ ] All event types handled
- [ ] Derived metrics computed correctly

### Testing

- [ ] Events correctly update state
- [ ] LifeMode transitions work
- [ ] Reasons capture explainability

---

## NK-003: Local Policy Engine

**Status:** TODO  
**Priority:** P1 (Core)  
**Depends on:** NK-002, Shared types

### Description

Implement local policies for instant suggestions without network roundtrips. Mirrors Convex policies but runs entirely on-device.

### Requirements

Create `apps/native/lib/kernel/local-policies.ts`:

```ts
import type {
  Policy,
  PolicyContext,
  KernelSuggestion,
  LifeState
} from "@tidy-comet/kernel/types";

const COOLDOWN_HOURS: Record<string, number> = {
  PLAN_RESET: 6,
  TINY_WIN: 4,
  MICRO_RECOVERY_PROTOCOL: 4,
  DAILY_REVIEW_QUESTION: 12,
  GENTLE_RETURN: 2,
};

export function runLocalPolicies(state: LifeState): KernelSuggestion[] {
  const suggestions: KernelSuggestion[] = [];
  const now = Date.now();

  if (state.mode === "recovery") {
    suggestions.push({
      day: state.day,
      type: "MICRO_RECOVERY_PROTOCOL",
      priority: 5,
      reason: {
        code: "RECOVERY_MODE",
        detail: "You're in recovery mode. Let's take it easy."
      },
      payload: { mode: "recovery" },
      status: "new",
      cooldownKey: "MICRO_RECOVERY_PROTOCOL",
    });
  }

  if (state.load === "overloaded") {
    suggestions.push({
      day: state.day,
      type: "PLAN_RESET",
      priority: 4,
      reason: {
        code: "OVERLOAD",
        detail: "Your day looks overloaded. Consider resetting your plan."
      },
      payload: {
        keptTaskIds: [],
        pausedTaskIds: [],
      },
      status: "new",
      cooldownKey: "PLAN_RESET",
    });
  }

  if (state.momentum === "stalled" && state.load !== "overloaded") {
    suggestions.push({
      day: state.day,
      type: "TINY_WIN",
      priority: 3,
      reason: {
        code: "MOMENTUM_STALLED",
        detail: "A small win could help rebuild momentum."
      },
      payload: {
        suggestedMinutes: 10,
      },
      status: "new",
      cooldownKey: "TINY_WIN",
    });
  }

  const hour = new Date().getHours();
  if (hour >= 20 && hour < 22) {
    suggestions.push({
      day: state.day,
      type: "DAILY_REVIEW_QUESTION",
      priority: 1,
      reason: {
        code: "END_OF_DAY",
        detail: "Time for a quick reflection."
      },
      payload: {
        question: generateReflectionQuestion(state),
      },
      status: "new",
      cooldownKey: "DAILY_REVIEW_QUESTION",
    });
  }

  return deduplicateAndCap(suggestions, state);
}

function deduplicateAndCap(
  suggestions: KernelSuggestion[],
  state: LifeState
): KernelSuggestion[] {
  const byType = new Map<string, KernelSuggestion>();

  for (const s of suggestions) {
    const existing = byType.get(s.type);
    if (!existing || s.priority > existing.priority) {
      byType.set(s.type, s);
    }
  }

  return Array.from(byType.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}

function generateReflectionQuestion(state: LifeState): string {
  if (state.completedTasksCount === 0) {
    return "What held you back from starting today?";
  }
  if (state.momentum === "stalled") {
    return "What's one small thing that went well?";
  }
  if (state.load === "overloaded") {
    return "What would you remove if you could?";
  }
  return "What's one thing you're grateful for today?";
}
```

### Deliverables

- [ ] `apps/native/lib/kernel/local-policies.ts`
- [ ] All policy types implemented
- [ ] Cooldown and deduplication logic

### Testing

- [ ] Suggestions fire on correct conditions
- [ ] Max 3 suggestions returned
- [ ] Deduplication works

---

## NK-004: Kernel Provider (React Context)

**Status:** TODO  
**Priority:** P0 (Integration)  
**Depends on:** NK-001, NK-002, NK-003

### Description

Create a React Context that exposes the local kernel to the entire app. This is the main integration point for accessing kernel state and methods.

### Requirements

Create `apps/native/lib/kernel-provider.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { LifeState, KernelEvent, KernelSuggestion } from "@tidy-comet/kernel/types";
import { localEventStore } from "./local-event-store";
import { reduce, createInitialState } from "./local-reducer";
import { runLocalPolicies } from "./local-policies";
import { useConvex } from "convex/react";
import { api } from "@/lib/api";

interface KernelContextValue {
  state: LifeState | null;
  suggestions: KernelSuggestion[];
  appendEvent: (event: KernelEvent) => Promise<void>;
  syncWithBackend: () => Promise<void>;
  isSyncing: boolean;
  isOnline: boolean;
}

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LifeState | null>(null);
  const [suggestions, setSuggestions] = useState<KernelSuggestion[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const convex = useConvex();
  const syncEventsMutation = convex(api.kernel.syncEvents);

  useEffect(() => {
    initializeKernel();
  }, []);

  const initializeKernel = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0];
    let currentState = createInitialState(today);

    const events = await localEventStore.getEvents();
    for (const event of events) {
      currentState = reduce(currentState, event);
    }

    setState(currentState);
    setSuggestions(runLocalPolicies(currentState));
  }, []);

  const appendEvent = useCallback(async (event: KernelEvent) => {
    await localEventStore.appendEvent(event);

    setState(prevState => {
      if (!prevState) return prevState;
      const newState = reduce(prevState, event);
      setSuggestions(runLocalPolicies(newState));
      return newState;
    });

    if (isOnline) {
      await syncWithBackend();
    }
  }, [isOnline]);

  const syncWithBackend = useCallback(async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const unsyncedEvents = (await localEventStore.getEvents())
        .filter(e => !(e as any)._synced);

      if (unsyncedEvents.length > 0) {
        await syncEventsMutation({ events: unsyncedEvents });

        for (const event of unsyncedEvents) {
          (event as any)._synced = true;
        }

        await localEventStore.setLastSyncTimestamp(Date.now());
      }

      const backendState = await convex(api.kernel.commands.getToday)();
      if (backendState) {
        setState(backendState);
        setSuggestions(runLocalPolicies(backendState));
      }
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, convex, syncEventsMutation]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected ?? true);
      if (state.isConnected) {
        syncWithBackend();
      }
    });
    return unsubscribe;
  }, [syncWithBackend]);

  return (
    <KernelContext.Provider
      value={{
        state,
        suggestions,
        appendEvent,
        syncWithBackend,
        isSyncing,
        isOnline,
      }}
    >
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
- [ ] `useKernel()` hook exported
- [ ] Online/offline detection
- [ ] Auto-sync when coming online

### Testing

- [ ] State initializes correctly
- [ ] Events update state
- [ ] Sync works when online
- [ ] Offline mode works

---

## NK-005: Suggestion Inbox UI Component

**Status:** TODO  
**Priority:** P1 (User Facing)  
**Depends on:** NK-004

### Description

Create a UI component that displays kernel suggestions and allows users to accept or dismiss them. Uses the machine aesthetic matching the app's design language.

### Requirements

Create `apps/native/components/kernel/suggestion-inbox.tsx`:

```tsx
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Card } from "@/components/ui/glass-card";
import { MachineText } from "@/components/ui/machine-text";
import { useKernel } from "@/lib/kernel-provider";
import { useConvex } from "convex/react";
import { api } from "@/lib/api";
import { LinearGradient } from "expo-linear-gradient";

const SUGGESTION_COLORS: Record<string, string[]> = {
  PLAN_RESET: ["#ff6b6b", "#ee5a24"],
  TINY_WIN: ["#26de81", "#20bf6b"],
  MICRO_RECOVERY_PROTOCOL: ["#4bcffa", "#0fb9b1"],
  DAILY_REVIEW_QUESTION: ["#a55eea", "#8854d0"],
  GENTLE_RETURN: ["#fed330", "#f7b731"],
};

export function SuggestionInbox() {
  const { suggestions, isSyncing } = useKernel();
  const acceptSuggestion = useConvex(api.kernel.suggestions.acceptSuggestion);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <MachineText variant="label" style={styles.title}>
          KERNEL SUGGESTIONS
        </MachineText>
        {isSyncing && (
          <MachineText variant="caption" style={styles.syncing}>
            SYNCING...
          </MachineText>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.type}
            suggestion={suggestion}
            onAccept={() => handleAccept(suggestion, acceptSuggestion)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function SuggestionCard({
  suggestion,
  onAccept
}: {
  suggestion: any;
  onAccept: () => void;
}) {
  const colors = SUGGESTION_COLORS[suggestion.type] || ["#6c5ce7", "#a29bfe"];

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <TouchableOpacity
        style={styles.cardContent}
        onPress={onAccept}
        activeOpacity={0.8}
      >
        <MachineText variant="label" style={styles.cardTitle}>
          {formatSuggestionType(suggestion.type)}
        </MachineText>

        <MachineText variant="body" style={styles.cardReason}>
          {suggestion.reason.detail}
        </MachineText>

        <View style={styles.cardFooter}>
          <MachineText variant="caption" style={styles.priority}>
            PRIORITY: {suggestion.priority}
          </MachineText>
          <Text style={styles.tapHint}>TAP TO ACCEPT</Text>
        </View>
      </TouchableOpacity>
    </LinearGradient>
  );
}

async function handleAccept(suggestion: any, acceptFn: any) {
  try {
    await acceptFn({ suggestionId: suggestion.type });
  } catch (error) {
    console.error("Failed to accept suggestion:", error);
  }
}

function formatSuggestionType(type: string): string {
  return type
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    color: "#6c5ce7",
    fontSize: 12,
    letterSpacing: 1,
  },
  syncing: {
    color: "#a29bfe",
    fontSize: 10,
  },
  scrollContent: {
    paddingRight: 16,
  },
  card: {
    width: 200,
    borderRadius: 12,
    marginRight: 12,
    overflow: "hidden",
  },
  cardContent: {
    padding: 16,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
  },
  cardReason: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priority: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 10,
  },
  tapHint: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 9,
    fontWeight: "bold",
  },
});
```

### Deliverables

- [ ] `apps/native/components/kernel/suggestion-inbox.tsx`
- [ ] Matching design language
- [ ] Accept action calls Convex
- [ ] Empty state handled

### Testing

- [ ] Suggestions display correctly
- [ ] Tap to accept works
- [ ] Design matches app aesthetic

---

## NK-006: Kernel Status Indicator

**Status:** TODO  
**Priority:** P2 (Polish)  
**Depends on:** NK-004

### Description

A small indicator showing current LifeMode and sync status. Appears in the header or status bar area.

### Requirements

Create `apps/native/components/kernel/kernel-status.tsx`:

```tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { MachineText } from "@/components/ui/machine-text";
import { useKernel } from "@/lib/kernel-provider";

const MODE_COLORS: Record<string, string> = {
  recovery: "#ff6b6b",
  maintain: "#4bcffa",
  build: "#26de81",
  sprint: "#fed330",
};

export function KernelStatusIndicator() {
  const { state, isOnline, isSyncing } = useKernel();

  if (!state) return null;

  const modeColor = MODE_COLORS[state.mode] || "#6c5ce7";

  return (
    <View style={styles.container}>
      <View style={[styles.modeIndicator, { backgroundColor: modeColor }]} />

      <MachineText variant="caption" style={styles.modeText}>
        {state.mode.toUpperCase()}
      </MachineText>

      <MachineText variant="caption" style={styles.statusText}>
        {isSyncing ? "SYNCING" : isOnline ? "ONLINE" : "OFFLINE"}
      </MachineText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderRadius: 8,
  },
  modeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  modeText: {
    color: "#ffffff",
    fontSize: 10,
    marginRight: 8,
  },
  statusText: {
    color: "#a29bfe",
    fontSize: 10,
  },
});
```

### Deliverables

- [ ] `apps/native/components/kernel/kernel-status.tsx`
- [ ] Mode color coding
- [ ] Sync status display

---

## NK-007: App Layout Integration

**Status:** TODO  
**Priority:** P0 (Integration)  
**Depends on:** NK-004, NK-005, NK-006

### Description

Integrate KernelProvider and kernel UI components into the main app layout.

### Requirements

Update `apps/native/app/_layout.tsx`:

```tsx
import { KernelProvider } from "@/lib/kernel-provider";
import { SuggestionInbox } from "@/components/kernel/suggestion-inbox";
import { KernelStatusIndicator } from "@/components/kernel/kernel-status";

export default function Layout() {
  return (
    <KernelProvider>
      <GestureHandlerRootView style={flex}>
        <SafeAreaProvider>
          <Stack>
            <Stack.Screen
              name="(tabs)"
              options={{
                headerRight: () => <KernelStatusIndicator />,
              }}
            />
          </Stack>

          <View style={styles.content}>
            <SuggestionInbox />
            {/* Existing layout content */}
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </KernelProvider>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
});
```

### Deliverables

- [ ] Updated `apps/native/app/_layout.tsx`
- [ ] KernelProvider wraps app
- [ SuggestionInbox visible
- [ ] Status indicator in header

---

## NK-008: Convex Sync Mutations

**Status:** TODO  
**Priority:** P0 (Integration)  
**Owner:** @backend  
**Depends on:** NK-001

### Description

Add sync mutations to the Convex backend for bidirectional sync.

### Requirements

Create `packages/backend/convex/kernel/sync.ts`:

```ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncEvents = mutation({
  args: {
    events: v.array(v.object({
      type: v.string(),
      ts: v.number(),
      taskId: v.optional(v.string()),
      habitId: v.optional(v.string()),
      blockId: v.optional(v.string()),
      expenseId: v.optional(v.string()),
      suggestionId: v.optional(v.string()),
      meta: v.optional(v.any()),
    })),
  },
  handler: async (ctx, { events }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const userId = identity.subject;
    const now = Date.now();
    const synced: string[] = [];

    for (const event of events) {
      const idempotencyKey = `${event.type}-${event.taskId ?? event.habitId ?? event.blockId ?? event.expenseId ?? event.suggestionId ?? event.ts}`;

      const existing = await ctx.db
        .query("events")
        .withIndex("by_user_idem", q => q.eq("userId", userId).eq("idempotencyKey", idempotencyKey))
        .first();

      if (!existing) {
        await ctx.db.insert("events", {
          userId,
          ts: event.ts,
          type: event.type,
          meta: event.meta,
          idempotencyKey,
        });
        synced.push(idempotencyKey);
      }
    }

    return { syncedCount: synced.length };
  },
});

export const getToday = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;
    const today = new Date().toISOString().split("T")[0];
    const startOfDay = new Date(today).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("events")
      .withIndex("by_user_ts", q => q
        .eq("userId", userId)
        .gte("ts", startOfDay)
        .lt("ts", endOfDay)
      )
      .collect();

    const { computeDailyState } = await import("./reducer");
    return computeDailyState(today, events);
  },
});
```

### Deliverables

- [ ] `packages/backend/convex/kernel/sync.ts`
- [ ] `syncEvents` mutation
- [ ] `getToday` query (already exists, may need update)

---

## Implementation Order

| Order | Ticket | Name                | Why                       |
| ----- | ------ | ------------------- | ------------------------- |
| 1     | NK-001 | Local Event Store   | Foundation for everything |
| 2     | NK-002 | Local Reducer       | State computation         |
| 3     | NK-003 | Local Policies      | Instant suggestions       |
| 4     | NK-008 | Convex Sync         | Backend integration       |
| 5     | NK-004 | Kernel Provider     | React Context             |
| 6     | NK-005 | Suggestion Inbox UI | User-facing               |
| 7     | NK-006 | Status Indicator    | UX polish                 |
| 8     | NK-007 | App Integration     | Connect all pieces        |

---

## Type Sharing Strategy

The kernel types are currently in `src/kernel/types.ts` (root). For native access:

**Option A: Export from root**

```
src/kernel/types.ts  →  imported by native via "@tidy-comet/kernel/types"
```

**Option B: Move to shared package**

```
packages/kernel/src/types.ts  →  both backend and native import from "@tidy-comet/kernel"
```

Recommendation: Use Option A for now (simpler), migrate to Option B in a later cleanup PR.

---

## Dependencies

Add to `apps/native/package.json`:

```json
{
  "dependencies": {
    "react-native-mmkv": "^2.12.0"
  }
}
```

Run: `bun add react-native-mmkv`

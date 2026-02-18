import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  createInitialState,
  eventStore,
  executeCommand,
  policyEngine,
  reduce,
  backlogPressureValve,
  endOfDayReview,
  financialDriftWatch,
  focusProtection,
  habitDownshift,
  momentumBuilder,
  overloadGuard,
} from "@life-os/kernel";
import type { KernelEvent, LifeState, PolicyContext, ProposedAction } from "@life-os/kernel";
import { initializeLocalFirstStore } from "@/lib/local-first";

type KernelContextValue = {
  state: LifeState | null;
  suggestions: ProposedAction[];
  appendEvent: (event: KernelEvent) => Promise<void>;
  executeKernelCommand: (
    cmd: Parameters<typeof executeCommand>[0],
  ) => Promise<{ success: boolean }>;
  refreshState: () => Promise<void>;
};

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LifeState | null>(null);
  const [suggestions, setSuggestions] = useState<ProposedAction[]>([]);

  const refreshState = useCallback(async () => {
    const today = new Date().toISOString().split("T")[0] ?? "";
    let currentState = createInitialState(today);

    const events = await eventStore.getEvents();
    for (const event of events) {
      currentState = reduce(currentState, event);
    }

    setState(currentState);

    const ctx = buildPolicyContext(currentState, events);
    const actions = policyEngine.runPolicies(ctx);
    setSuggestions(actions);
  }, []);

  const appendEvent = useCallback(
    async (event: KernelEvent) => {
      await eventStore.appendEvent(event);
      await refreshState();
    },
    [refreshState],
  );

  const executeKernelCommand = useCallback(
    async (cmd: Parameters<typeof executeCommand>[0]) => {
      const result = await executeCommand(cmd);
      if (result.success) {
        await refreshState();
      }
      return { success: result.success };
    },
    [refreshState],
  );

  useEffect(() => {
    initializeLocalFirstStore();

    const existing = new Set(
      policyEngine.getPolicies().map((policy: { name: string }) => policy.name),
    );
    const policies = [
      overloadGuard,
      momentumBuilder,
      focusProtection,
      habitDownshift,
      financialDriftWatch,
      endOfDayReview,
      backlogPressureValve,
    ];
    for (const policy of policies) {
      if (!existing.has(policy.name)) {
        policyEngine.addPolicy(policy);
      }
    }

    refreshState();
  }, [refreshState]);

  const value = useMemo(
    () => ({ state, suggestions, appendEvent, executeKernelCommand, refreshState }),
    [state, suggestions, appendEvent, executeKernelCommand, refreshState],
  );

  return <KernelContext.Provider value={value}>{children}</KernelContext.Provider>;
}

export function useKernel() {
  const context = useContext(KernelContext);
  if (!context) {
    throw new Error("useKernel must be used within KernelProvider");
  }
  return context;
}

function buildPolicyContext(state: LifeState, events: KernelEvent[]): PolicyContext {
  const now = new Date();
  const threeDaysAgo = now.getTime() - 3 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const recentEvents = events.filter((event) => event.ts >= threeDaysAgo);
  const recentHabits = events.filter((event) => event.ts >= sevenDaysAgo);

  const completedLast3Days = recentEvents.filter((event) => event.type === "TASK_COMPLETED").length;
  const habitDone = recentHabits.filter((event) => event.type === "HABIT_DONE").length;
  const habitMissed = recentHabits.filter((event) => event.type === "HABIT_MISSED").length;
  const habitCompletion7Days =
    habitDone + habitMissed > 0 ? habitDone / (habitDone + habitMissed) : 0;
  const streakBreaks = habitMissed;
  const backlogCount = Math.round(state.backlogPressure / 5);

  return {
    now: now.toISOString(),
    state,
    recentEvents,
    facts: {
      plannedMinutes: state.plannedMinutes,
      freeMinutes: state.freeMinutes,
      completedLast3Days,
      habitCompletion7Days,
      streakBreaks,
      spendVsIntent: state.spendVsIntent,
      backlogCount,
    },
  };
}

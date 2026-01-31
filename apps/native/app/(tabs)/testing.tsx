import { useMutation, useQuery } from "convex/react";
import { Button, Spinner } from "heroui-native";
import { useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { getTimezoneOffsetMinutes } from "@/lib/date";

type SeedOption = "balanced" | "overload" | "recovery" | "fragmented";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function getMinuteOfDay(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatLocalDay(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftLocalDay(day: string, deltaDays: number) {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDay(date);
}

export default function Testing() {
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const today = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
  const addBlock = useMutation(api.calendar.addBlock);
  const createTask = useMutation(api.kernel.taskCommands.createTask);
  const completeTask = useMutation(api.kernel.taskCommands.completeTask);
  const applyPlanReset = useMutation(api.kernel.planReset.applyPlanReset);
  const executeCommand = useMutation(api.kernel.commands.executeCommand);
  const clearTestData = useMutation(api.kernel.testing.clearTestData);
  const clearTestBlocks = useMutation(api.kernel.testing.clearTestBlocks);
  const createJournalEntry = useMutation(api.identity.createJournalEntry);
  const clearTestJournalEntries = useMutation(api.kernel.testing.clearTestJournalEntries);

  const [isSeeding, setIsSeeding] = useState(false);
  const [lastSeed, setLastSeed] = useState<string | null>(null);

  const day = today?.day ?? "";
  const eventSummary = useMemo(
    () =>
      today?.eventSummary ?? {
        habitDone: 0,
        habitMissed: 0,
        expenseAdded: 0,
      },
    [today],
  );

  const addBlockForDay = async (
    startMin: number,
    endMin: number,
    kind: "busy" | "focus" | "rest" | "personal",
    title?: string,
  ) => {
    if (!day) return;
    await addBlock({
      day,
      startMin,
      endMin,
      kind,
      source: "manual",
      title: title ? `[TEST] ${title}` : "[TEST] Block",
    });
  };

  const setDailyPlan = async (
    items: Array<{ id: string; label: string; estimatedMinutes: number }>,
  ) => {
    if (!day) return;
    await executeCommand({
      command: {
        cmd: "set_daily_plan",
        input: { day, focusItems: items, reason: "initial" },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
  };

  const seedHabitsAndExpenses = async () => {
    await executeCommand({
      command: {
        cmd: "log_habit",
        input: { habitId: "test-hydration", status: "done" },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
    await executeCommand({
      command: {
        cmd: "log_habit",
        input: { habitId: "test-stretch", status: "missed" },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
    await executeCommand({
      command: {
        cmd: "add_expense",
        input: { amount: 6.5, category: "test" },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
  };

  const seedScenario = async (option: SeedOption) => {
    if (!day) return;
    setIsSeeding(true);
    try {
      if (option === "balanced") {
        await addBlockForDay(9 * 60, 10 * 60, "busy", "Standup");
        await addBlockForDay(10 * 60, 12 * 60, "focus", "Deep work");
        await addBlockForDay(13 * 60, 14 * 60, "rest", "Reset");

        const taskA = await createTask({
          title: "[TEST] Write outline",
          estimateMin: 25,
          priority: 2,
          idempotencyKey: idem(),
        });
        await createTask({
          title: "[TEST] Review notes",
          estimateMin: 45,
          priority: 2,
          idempotencyKey: idem(),
        });

        await setDailyPlan([
          { id: "focus-a", label: "Write outline", estimatedMinutes: 25 },
          { id: "focus-b", label: "Review notes", estimatedMinutes: 45 },
        ]);

        const taskId = (taskA as { taskId?: Id<"tasks"> })?.taskId;
        if (taskId) {
          await completeTask({ taskId, idempotencyKey: idem() });
        }
        await seedHabitsAndExpenses();
        setLastSeed("Balanced day seeded");
      }

      if (option === "overload") {
        await addBlockForDay(8 * 60, 12 * 60, "busy", "Meetings");
        await addBlockForDay(13 * 60, 17 * 60, "busy", "Commitments");
        await addBlockForDay(19 * 60, 20 * 60, "rest", "Wind down");

        await createTask({
          title: "[TEST] Draft proposal",
          estimateMin: 60,
          priority: 1,
          idempotencyKey: idem(),
        });
        await createTask({
          title: "[TEST] Build deck",
          estimateMin: 60,
          priority: 1,
          idempotencyKey: idem(),
        });
        await createTask({
          title: "[TEST] Client follow-ups",
          estimateMin: 45,
          priority: 2,
          idempotencyKey: idem(),
        });

        await setDailyPlan([
          { id: "focus-1", label: "Draft proposal", estimatedMinutes: 60 },
          { id: "focus-2", label: "Build deck", estimatedMinutes: 60 },
          { id: "focus-3", label: "Client follow-ups", estimatedMinutes: 45 },
        ]);

        setLastSeed("Overloaded day seeded (expect PLAN_RESET suggestion)");
      }

      if (option === "recovery") {
        await addBlockForDay(9 * 60, 12 * 60, "busy", "Back-to-back calls");
        await addBlockForDay(14 * 60, 18 * 60, "busy", "Commitments");

        await createTask({
          title: "[TEST] Catch up backlog",
          estimateMin: 90,
          priority: 1,
          idempotencyKey: idem(),
        });
        await createTask({
          title: "[TEST] Reconcile inbox",
          estimateMin: 60,
          priority: 2,
          idempotencyKey: idem(),
        });

        await setDailyPlan([
          { id: "focus-1", label: "Catch up backlog", estimatedMinutes: 90 },
          { id: "focus-2", label: "Reconcile inbox", estimatedMinutes: 60 },
        ]);

        await applyPlanReset({ day, keepCount: 1, idempotencyKey: idem(), tzOffsetMinutes });
        setLastSeed("Recovery day seeded (expect MICRO_RECOVERY)");
      }

      if (option === "fragmented") {
        await addBlockForDay(9 * 60, 9 * 60 + 20, "busy", "Check-in");
        await addBlockForDay(9 * 60 + 40, 10 * 60, "busy", "Sync");
        await addBlockForDay(10 * 60 + 15, 10 * 60 + 45, "busy", "Short call");
        await addBlockForDay(11 * 60, 11 * 60 + 20, "busy", "Ping");
        await addBlockForDay(12 * 60, 12 * 60 + 20, "busy", "Admin");

        const nowMinute = getMinuteOfDay();
        await addBlockForDay(
          nowMinute,
          Math.min(nowMinute + 45, 23 * 60 + 59),
          "rest",
          "Rest window",
        );

        await createTask({
          title: "[TEST] Small follow-up",
          estimateMin: 10,
          priority: 3,
          idempotencyKey: idem(),
        });

        await setDailyPlan([{ id: "focus-1", label: "Small follow-up", estimatedMinutes: 10 }]);

        setLastSeed("Fragmented day seeded (expect tiny suggestions)");
      }
    } finally {
      setIsSeeding(false);
    }
  };

  const seedJournalEntries = async () => {
    if (!day) return;
    setIsSeeding(true);
    try {
      await createJournalEntry({
        day,
        mood: "ok",
        text: "[TEST] Steady day, kept it gentle and focused.",
      });
      await createJournalEntry({
        day: shiftLocalDay(day, -1),
        mood: "low",
        text: "[TEST] Heavy load. Needed more space than expected.",
      });
      await createJournalEntry({
        day: shiftLocalDay(day, -3),
        mood: "neutral",
        text: "[TEST] Quiet day. Small resets helped.",
      });
      await createJournalEntry({
        day: shiftLocalDay(day, -10),
        mood: "good",
        text: "[TEST] Momentum returned. Felt clean and light.",
      });
      setLastSeed("Journal entries seeded for filters/search");
    } finally {
      setIsSeeding(false);
    }
  };

  const clearTodayTestData = async () => {
    if (!day) return;
    setIsSeeding(true);
    try {
      await clearTestData({ day });
      setLastSeed("Cleared test data for today");
    } finally {
      setIsSeeding(false);
    }
  };

  const confirmClearAll = () => {
    Alert.alert(
      "Clear test data?",
      "This removes [TEST] tasks/blocks, test events, suggestions, and today's state.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clearTodayTestData },
      ],
    );
  };

  const confirmClearBlocks = () => {
    Alert.alert(
      "Clear test blocks?",
      "This removes only [TEST] calendar blocks and their events.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            if (!day) return;
            setIsSeeding(true);
            try {
              await clearTestBlocks({ day });
              setLastSeed("Cleared test blocks for today");
            } finally {
              setIsSeeding(false);
            }
          },
        },
      ],
    );
  };

  const confirmClearJournal = () => {
    Alert.alert(
      "Clear test journal entries?",
      "This removes only [TEST] journal entries (optionally for today).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            if (!day) return;
            setIsSeeding(true);
            try {
              await clearTestJournalEntries({ day });
              setLastSeed("Cleared test journal entries for today");
            } finally {
              setIsSeeding(false);
            }
          },
        },
      ],
    );
  };

  const confirmClearAllJournal = () => {
    Alert.alert(
      "Clear all test journal entries?",
      "This removes all [TEST] journal entries across all days.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setIsSeeding(true);
            try {
              await clearTestJournalEntries({});
              setLastSeed("Cleared all test journal entries");
            } finally {
              setIsSeeding(false);
            }
          },
        },
      ],
    );
  };

  if (!today) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  return (
    <Container className="pt-6">
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="mb-6 border-b-2 border-divider pb-2">
          <MachineText variant="header" size="2xl">
            TEST ROUTE
          </MachineText>
          <MachineText className="text-muted text-xs mt-1">
            Prefilled data seeding for kernel features.
          </MachineText>
        </View>

        <HardCard className="mb-6" padding="sm" label="SEED SCENARIOS">
          <View className="gap-3 p-2">
            <Button
              size="sm"
              className="bg-accent border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={() => seedScenario("balanced")}
            >
              <MachineText className="text-xs font-bold text-accent-foreground">
                SEED BALANCED DAY
              </MachineText>
            </Button>
            <Button
              size="sm"
              className="bg-accent border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={() => seedScenario("overload")}
            >
              <MachineText className="text-xs font-bold text-accent-foreground">
                SEED OVERLOAD DAY
              </MachineText>
            </Button>
            <Button
              size="sm"
              className="bg-accent border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={() => seedScenario("recovery")}
            >
              <MachineText className="text-xs font-bold text-accent-foreground">
                SEED RECOVERY DAY
              </MachineText>
            </Button>
            <Button
              size="sm"
              className="bg-accent border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={() => seedScenario("fragmented")}
            >
              <MachineText className="text-xs font-bold text-accent-foreground">
                SEED FRAGMENTED DAY
              </MachineText>
            </Button>
            {lastSeed ? <MachineText className="text-xs text-muted">{lastSeed}</MachineText> : null}
          </View>
        </HardCard>

        <HardCard className="mb-6" padding="sm" label="JOURNAL TEST DATA">
          <View className="gap-3 p-2">
            <Button
              size="sm"
              className="bg-accent border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={seedJournalEntries}
            >
              <MachineText className="text-xs font-bold text-accent-foreground">
                SEED JOURNAL ENTRIES
              </MachineText>
            </Button>
            <MachineText className="text-xs text-muted">
              Creates [TEST] entries across multiple days with varied moods.
            </MachineText>
          </View>
        </HardCard>

        <HardCard className="mb-6" padding="sm" label="RESET">
          <View className="gap-3 p-2">
            <Button
              size="sm"
              className="bg-surface border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={confirmClearAll}
            >
              <MachineText className="text-xs font-bold text-foreground">
                CLEAR TODAY'S TEST DATA
              </MachineText>
            </Button>
            <Button
              size="sm"
              className="bg-surface border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={confirmClearBlocks}
            >
              <MachineText className="text-xs font-bold text-foreground">
                CLEAR ONLY TEST BLOCKS
              </MachineText>
            </Button>
            <Button
              size="sm"
              className="bg-surface border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={confirmClearJournal}
            >
              <MachineText className="text-xs font-bold text-foreground">
                CLEAR ONLY TEST JOURNAL
              </MachineText>
            </Button>
            <Button
              size="sm"
              className="bg-surface border border-foreground rounded-none"
              isDisabled={isSeeding}
              onPress={confirmClearAllJournal}
            >
              <MachineText className="text-xs font-bold text-foreground">
                CLEAR ALL TEST JOURNAL
              </MachineText>
            </Button>
            <MachineText className="text-xs text-muted">
              Removes [TEST] tasks/blocks, test events, suggestions, and state for today.
            </MachineText>
          </View>
        </HardCard>

        <HardCard className="mb-6" padding="sm" label="EVENT SUMMARY">
          <View className="flex-row justify-between p-2">
            <View>
              <MachineText variant="label" className="text-[10px]">
                HABITS DONE
              </MachineText>
              <MachineText variant="value" className="text-sm">
                {eventSummary.habitDone}
              </MachineText>
            </View>
            <View>
              <MachineText variant="label" className="text-[10px]">
                HABITS MISSED
              </MachineText>
              <MachineText variant="value" className="text-sm">
                {eventSummary.habitMissed}
              </MachineText>
            </View>
            <View>
              <MachineText variant="label" className="text-[10px]">
                EXPENSES
              </MachineText>
              <MachineText variant="value" className="text-sm">
                {eventSummary.expenseAdded}
              </MachineText>
            </View>
          </View>
        </HardCard>
      </ScrollView>
    </Container>
  );
}

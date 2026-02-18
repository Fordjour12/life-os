import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";

import { CalendarBlockCard } from "@/components/calendar-block-card";
import { Container } from "@/components/container";
import { TimeRealitySkeleton } from "@/components/skeletons/time-reality-skeleton";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { formatDayLabel, shiftDay } from "@/lib/calendar-utils";
import { getTimezoneOffsetMinutes } from "@/lib/date";

type CalendarBlock = {
  _id: Id<"calendarBlocks">;
  startMin: number;
  endMin: number;
  kind: "busy" | "focus" | "rest" | "personal";
  title?: string;
  notes?: string;
};

function formatMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours <= 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export default function TimeReality() {
  const router = useRouter();
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const today = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
  const addBlockMutation = useMutation(api.calendar.addBlock);
  const removeBlockMutation = useMutation(api.calendar.removeBlock);

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [expandedBlockId, setExpandedBlockId] = useState<Id<"calendarBlocks"> | null>(null);
  const [workingBlockId, setWorkingBlockId] = useState<Id<"calendarBlocks"> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!selectedDay && today?.day) {
      setSelectedDay(today.day);
    }
  }, [selectedDay, today?.day]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) {
        clearTimeout(toastTimeout.current);
      }
    };
  }, []);

  const activeDay = selectedDay ?? today?.day ?? null;
  const blocks = useQuery(api.calendar.listBlocksForDay, activeDay ? { day: activeDay } : "skip");
  const freeData = useQuery(
    api.calendar.getFreeMinutesForDay,
    activeDay ? { day: activeDay } : "skip",
  );

  const sortedBlocks = useMemo(() => {
    return ((blocks ?? []) as CalendarBlock[]).slice().sort((a, b) => a.startMin - b.startMin);
  }, [blocks]);

  const totals = useMemo(() => {
    return ((blocks ?? []) as CalendarBlock[]).reduce(
      (acc, block) => {
        const minutes = block.endMin - block.startMin;
        acc.total += minutes;
        acc[block.kind] += minutes;
        return acc;
      },
      {
        total: 0,
        busy: 0,
        focus: 0,
        rest: 0,
        personal: 0,
      },
    );
  }, [blocks]);

  const prevDay = activeDay ? shiftDay(activeDay, -1) : null;
  const nextDay = activeDay ? shiftDay(activeDay, 1) : null;

  const setToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimeout.current) {
      clearTimeout(toastTimeout.current);
    }
    toastTimeout.current = setTimeout(() => setToastMessage(null), 900);
  }, []);

  const onToggleNotes = useCallback((blockId: Id<"calendarBlocks">) => {
    setExpandedBlockId((current) => (current === blockId ? null : blockId));
  }, []);

  const onRemove = useCallback(
    (block: CalendarBlock) => {
      if (workingBlockId) return;
      Alert.alert(
        "Remove block?",
        "Reason: this protects what the day allows. Removing weakens your reality signal.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              setWorkingBlockId(block._id);
              try {
                await removeBlockMutation({ blockId: block._id });
                setToast("Block removed.");
              } finally {
                setWorkingBlockId(null);
              }
            },
          },
        ],
      );
    },
    [removeBlockMutation, setToast, workingBlockId],
  );

  const duplicateToDay = useCallback(
    async (block: CalendarBlock, day: string) => {
      setWorkingBlockId(block._id);
      try {
        await addBlockMutation({
          day,
          startMin: block.startMin,
          endMin: block.endMin,
          kind: block.kind,
          source: "manual",
          title: block.title,
          notes: block.notes,
        });
        setToast(day === activeDay ? "Block duplicated." : "Duplicated to tomorrow.");
      } finally {
        setWorkingBlockId(null);
      }
    },
    [activeDay, addBlockMutation, setToast],
  );

  const onDuplicate = useCallback(
    (block: CalendarBlock) => {
      if (!activeDay) return;
      return duplicateToDay(block, activeDay);
    },
    [activeDay, duplicateToDay],
  );

  const onDuplicateTomorrow = useCallback(
    (block: CalendarBlock) => {
      if (!activeDay) return;
      return duplicateToDay(block, shiftDay(activeDay, 1));
    },
    [activeDay, duplicateToDay],
  );

  const onEdit = useCallback(
    (blockId: Id<"calendarBlocks">) => {
      router.push({ pathname: "/edit-busy-time" as any, params: { blockId } });
    },
    [router],
  );

  const onAddBusyTime = useCallback(() => {
    router.push({ pathname: "/add-busy-time" as any, params: activeDay ? { day: activeDay } : {} });
  }, [activeDay, router]);

  if (!today || !freeData || !activeDay) {
    return <TimeRealitySkeleton />;
  }

  return (
    <Container className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 border-b-2 border-divider pb-2">
          <MachineText variant="label" className="text-accent mb-1">
            REALITY_LAYER
          </MachineText>
          <MachineText variant="header" size="2xl">
            TIME_REALITY
          </MachineText>
          <MachineText className="text-xs text-foreground/70 mt-1">
            {formatDayLabel(activeDay).toUpperCase()}
          </MachineText>
        </View>

        <HardCard label="DAY" className="mb-6">
          <View className="gap-3 p-4">
            <View className="flex-row gap-2">
              <Button
                size="sm"
                className="flex-1 bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                onPress={() => prevDay && setSelectedDay(prevDay)}
              >
                <MachineText className="text-[10px] font-bold text-foreground">PREV</MachineText>
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                onPress={() => setSelectedDay(today.day)}
              >
                <MachineText className="text-[10px] font-bold text-accent-foreground">
                  TODAY
                </MachineText>
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                onPress={() => nextDay && setSelectedDay(nextDay)}
              >
                <MachineText className="text-[10px] font-bold text-foreground">NEXT</MachineText>
              </Button>
            </View>
            <MachineText className="text-xs text-foreground/70">
              Reason: inspect one day at a time and make fewer decisions.
            </MachineText>
          </View>
        </HardCard>

        <HardCard label="CAPACITY" className="mb-6">
          <View className="gap-4 p-4">
            <View className="flex-row justify-between">
              <View>
                <MachineText variant="label">FREE_TIME</MachineText>
                <MachineText variant="header" size="xl">
                  {formatMinutes(freeData.freeMinutes)}
                </MachineText>
              </View>
              <View className="items-end">
                <MachineText variant="label">EFFECTIVE_FREE</MachineText>
                <MachineText className="text-sm">
                  {formatMinutes(freeData.effectiveFreeMinutes)}
                </MachineText>
              </View>
            </View>
            <View className="flex-row justify-between">
              <MachineText className="text-xs">
                BUSY: {formatMinutes(freeData.busyMinutes)}
              </MachineText>
              <MachineText className="text-xs">
                FOCUS: {formatMinutes(freeData.focusMinutes)}
              </MachineText>
              <MachineText className="text-xs">TOTAL: {formatMinutes(totals.total)}</MachineText>
            </View>
            <MachineText className="text-[10px] text-foreground/60">
              Capacity baseline: {formatMinutes(freeData.capacityMinutes)}.
            </MachineText>
          </View>
        </HardCard>

        <HardCard label="BLOCKS" className="mb-6">
          <View className="gap-3 p-3">
            {sortedBlocks.length === 0 ? (
              <View className="items-center py-6">
                <MachineText className="opacity-50">NO_BLOCKS_YET</MachineText>
              </View>
            ) : (
              sortedBlocks.map((block) => (
                <CalendarBlockCard
                  key={block._id}
                  block={block}
                  expandedBlockId={expandedBlockId}
                  onToggleNotes={onToggleNotes}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onDuplicateTomorrow={onDuplicateTomorrow}
                  onRemove={onRemove}
                  isRemoving={workingBlockId === block._id}
                  showEdit
                />
              ))
            )}
          </View>
        </HardCard>

        <HardCard label="ACTION">
          <View className="gap-3 p-4">
            <Button
              className="bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
              onPress={onAddBusyTime}
            >
              <MachineText className="text-accent-foreground font-bold">ADD_BUSY_TIME</MachineText>
            </Button>
            <MachineText className="text-xs text-foreground/70">
              Reason: protect what this day actually allows.
            </MachineText>
          </View>
        </HardCard>
      </ScrollView>

      {toastMessage ? (
        <View className="absolute bottom-6 left-4 right-4">
          <View className="bg-foreground px-3 py-2 border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]">
            <MachineText className="text-background text-xs">{toastMessage}</MachineText>
          </View>
        </View>
      ) : null}
    </Container>
  );
}

import { Ionicons } from "@expo/vector-icons";
import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { withUniwind } from "uniwind";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { TimeRealitySkeleton } from "@/components/skeletons/time-reality-skeleton";
import { formatDayLabel, formatTime, shiftDay } from "@/lib/calendar-utils";
import { getTimezoneOffsetMinutes } from "@/lib/date";
import { CalendarBlockCard } from "@/components/calendar-block-card";

const StyledIonicons = withUniwind(Ionicons);

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
  const blocks = useQuery(api.calendar.listBlocksForDay, today ? { day: today.day } : "skip");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const activeDay = selectedDay ?? today?.day ?? null;
  const calendarBlocks = useQuery(
    api.calendar.listBlocksForDay,
    activeDay ? { day: activeDay } : "skip",
  );
  const freeData = useQuery(api.calendar.getFreeMinutesForDay, today ? { day: today.day } : "skip");

  const [removingId, setRemovingId] = useState<Id<"calendarBlocks"> | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedBlockId, setExpandedBlockId] = useState<Id<"calendarBlocks"> | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedBlocks = useMemo(() => {
    const data = ((blocks ?? []) as CalendarBlock[]).slice();
    return data.sort((a, b) => a.startMin - b.startMin);
  }, [blocks]);

  useEffect(() => {
    if (today?.day && !selectedDay) {
      setSelectedDay(today.day);
    }
  }, [selectedDay, today]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  const totals = useMemo(() => {
    const data = ((blocks ?? []) as CalendarBlock[]).slice();
    return data.reduce(
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

  const dayLabel = today ? formatDayLabel(today.day).toUpperCase() : "";
  const calendarDayLabel = activeDay ? formatDayLabel(activeDay).toUpperCase() : dayLabel;
  const sortedCalendarBlocks = useMemo(
    () =>
      ((calendarBlocks ?? []) as CalendarBlock[]).slice().sort((a, b) => a.startMin - b.startMin),
    [calendarBlocks],
  );
  const calendarTotalMinutes = useMemo(
    () =>
      ((calendarBlocks ?? []) as CalendarBlock[]).reduce(
        (total, block) => total + (block.endMin - block.startMin),
        0,
      ),
    [calendarBlocks],
  );
  const prevDay = activeDay ? shiftDay(activeDay, -1) : (today?.day ?? "");
  const nextDay = activeDay ? shiftDay(activeDay, 1) : (today?.day ?? "");
  const weekDays = useMemo(() => {
    if (!activeDay) return [] as string[];
    return [-3, -2, -1, 0, 1, 2, 3].map((offset) => shiftDay(activeDay, offset));
  }, [activeDay]);
  const freeMinutesLabel = formatMinutes(freeData?.freeMinutes ?? 0);
  const effectiveFreeLabel = formatMinutes(freeData?.effectiveFreeMinutes ?? 0);
  const focusMinutesLabel = formatMinutes(freeData?.focusMinutes ?? 0);
  const busyMinutesLabel = formatMinutes(freeData?.busyMinutes ?? 0);
  const capacityLabel = formatMinutes(freeData?.capacityMinutes ?? 0);
  const otherMinutesLabel = formatMinutes(totals.focus + totals.rest + totals.personal);
  const totalLoggedLabel = formatMinutes(totals.total);

  if (!today || !freeData) {
    return <TimeRealitySkeleton />;
  }

  const toggleNotes = useCallback((blockId: Id<"calendarBlocks">) => {
    setExpandedBlockId((current) => (current === blockId ? null : blockId));
  }, []);

  const removeBlock = useCallback(
    async (blockId: Id<"calendarBlocks">) => {
      setRemovingId(blockId);
      try {
        await removeBlockMutation({ blockId });
        setToastMessage("Block removed.");
        if (toastTimeout.current) clearTimeout(toastTimeout.current);
        toastTimeout.current = setTimeout(() => {
          setToastMessage(null);
        }, 900);
      } finally {
        setRemovingId(null);
      }
    },
    [removeBlockMutation],
  );

  const duplicateBlock = useCallback(
    async (block: CalendarBlock, dayOverride?: string) => {
      if (!today) return;
      setRemovingId(block._id);
      try {
        await addBlockMutation({
          day: dayOverride ?? today.day,
          startMin: block.startMin,
          endMin: block.endMin,
          kind: block.kind,
          source: "manual",
          title: block.title,
          notes: block.notes,
        });
        setToastMessage(dayOverride ? "Duplicated to tomorrow." : "Block duplicated.");
        if (toastTimeout.current) clearTimeout(toastTimeout.current);
        toastTimeout.current = setTimeout(() => {
          setToastMessage(null);
        }, 900);
      } finally {
        setRemovingId(null);
      }
    },
    [today, addBlockMutation],
  );

  const duplicateBlockTomorrow = useCallback(
    (block: CalendarBlock) => duplicateBlock(block, shiftDay(activeDay ?? today.day, 1)),
    [duplicateBlock, activeDay, today],
  );

  const duplicateBlockToday = useCallback(
    (block: CalendarBlock) => duplicateBlock(block, activeDay ?? today.day),
    [duplicateBlock, activeDay, today],
  );

  const confirmRemove = useCallback(
    (block: CalendarBlock) => {
      if (removingId) return;
      Alert.alert(
        "Remove block?",
        "Reason: this protects what the day allows. Removing reduces the system's reality signal.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => removeBlock(block._id),
          },
        ],
      );
    },
    [removingId, removeBlock],
  );

  const editBlock = useCallback(
    (blockId: Id<"calendarBlocks">) => {
      router.push({
        pathname: "/edit-busy-time" as any,
        params: { blockId },
      });
    },
    [router],
  );

  const handleAddBusyTime = useCallback(() => {
    router.push({
      pathname: "/add-busy-time" as any,
      params: { day: activeDay ?? today.day },
    });
  }, [router, activeDay, today]);

  const handleAddBusyTimeToday = useCallback(() => {
    router.push("/add-busy-time" as any);
  }, [router]);

  return (
    <Container className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 flex-row justify-between items-end border-b-2 border-divider pb-2">
          <View>
            <MachineText variant="label" className="text-accent mb-1">
              REALITY_LAYER
            </MachineText>
            <MachineText variant="header" size="2xl">
              TIME_REALITY
            </MachineText>
          </View>
          <View className="items-end gap-2">
            <Pressable
              onPress={() => setShowCalendar((current) => !current)}
              accessibilityLabel="Toggle calendar"
              className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)] px-2 py-1"
            >
              <StyledIonicons
                name={showCalendar ? "calendar" : "calendar-outline"}
                size={16}
                className="text-foreground"
              />
            </Pressable>
            <MachineText variant="value" className="text-sm">
              {dayLabel}
            </MachineText>
          </View>
        </View>

        <HardCard label="CALENDAR" className="mb-6">
          <View className="gap-3 p-4">
            <View className="flex-row justify-between items-end">
              <View>
                <MachineText variant="label" className="text-accent mb-1">
                  DAILY_VIEW
                </MachineText>
                <MachineText variant="header" size="lg">
                  {calendarDayLabel}
                </MachineText>
              </View>
              <View className="items-end">
                <MachineText variant="label">TOTAL_LOGGED</MachineText>
                <MachineText className="text-sm">{formatMinutes(calendarTotalMinutes)}</MachineText>
              </View>
            </View>

            {showCalendar ? (
              <View className="gap-3">
                <View className="flex-row gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                    onPress={() => setSelectedDay(prevDay)}
                  >
                    <MachineText className="text-[10px] font-bold text-foreground">
                      PREV_DAY
                    </MachineText>
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
                    onPress={() => setSelectedDay(nextDay)}
                  >
                    <MachineText className="text-[10px] font-bold text-foreground">
                      NEXT_DAY
                    </MachineText>
                  </Button>
                </View>
                <View className="flex-row justify-between">
                  <MachineText className="text-xs text-foreground/70">
                    {formatDayLabel(prevDay).toUpperCase()}
                  </MachineText>
                  <MachineText className="text-xs text-foreground/70">
                    {formatDayLabel(nextDay).toUpperCase()}
                  </MachineText>
                </View>
                <HardCard label="WEEK_STRIP">
                  <View className="gap-2 p-3">
                    <View className="flex-row flex-wrap gap-2">
                      {weekDays.map((day) => {
                        const isActive = day === activeDay;
                        return (
                          <Pressable
                            key={day}
                            onPress={() => setSelectedDay(day)}
                            className={`px-2 py-1 border border-foreground ${isActive ? "bg-accent" : "bg-surface shadow-[2px_2px_0px_var(--color-foreground)]"}`}
                          >
                            <MachineText
                              className={`text-[9px] font-bold ${isActive ? "text-accent-foreground" : "text-foreground"}`}
                            >
                              {formatDayLabel(day).toUpperCase()}
                            </MachineText>
                          </Pressable>
                        );
                      })}
                    </View>
                    <MachineText className="text-xs text-foreground/60">
                      Reason: move quickly across the week.
                    </MachineText>
                  </View>
                </HardCard>
                <HardCard label="BLOCKS">
                  <View className="gap-3 p-3">
                    {sortedCalendarBlocks.length === 0 ? (
                      <View className="items-center py-6">
                        <MachineText className="opacity-50">NO_BLOCKS_YET</MachineText>
                      </View>
                    ) : (
                      sortedCalendarBlocks.map((block) => (
                        <CalendarBlockCard
                          key={block._id}
                          block={block}
                          expandedBlockId={expandedBlockId}
                          onToggleNotes={toggleNotes}
                          onEdit={editBlock}
                          onDuplicate={duplicateBlockToday}
                          onDuplicateTomorrow={duplicateBlockTomorrow}
                          onRemove={confirmRemove}
                          isRemoving={removingId === block._id}
                        />
                      ))
                    )}
                  </View>
                </HardCard>
                <Button
                  className="bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                  onPress={handleAddBusyTime}
                >
                  <MachineText className="text-accent-foreground font-bold">
                    ADD_BUSY_TIME
                  </MachineText>
                </Button>
                <MachineText className="text-xs text-foreground/70">
                  Reason: verify reality across days.
                </MachineText>
              </View>
            ) : null}
          </View>
        </HardCard>

        <HardCard label="TODAY_CAPACITY" className="mb-6">
          <View className="gap-4 p-4">
            <View className="flex-row justify-between items-end">
              <View>
                <MachineText variant="label">FREE_TIME</MachineText>
                <MachineText variant="header" size="xl">
                  {freeMinutesLabel}
                </MachineText>
                <MachineText variant="label" className="mt-2">
                  EFFECTIVE_FREE
                </MachineText>
                <MachineText className="text-sm">{effectiveFreeLabel}</MachineText>
              </View>
              <View className="items-end">
                <MachineText variant="label">BUSY_COUNTS</MachineText>
                <MachineText className="text-sm">{busyMinutesLabel}</MachineText>
                <MachineText variant="label" className="mt-2">
                  OTHER_BLOCKS_NO_COUNT
                </MachineText>
                <MachineText className="text-sm">{otherMinutesLabel}</MachineText>
                <MachineText variant="label" className="mt-2">
                  FOCUS_BLOCKS
                </MachineText>
                <MachineText className="text-sm">{focusMinutesLabel}</MachineText>
                <MachineText variant="label" className="mt-2">
                  CAPACITY
                </MachineText>
                <MachineText className="text-sm">{capacityLabel}</MachineText>
              </View>
            </View>
            <View className="flex-row justify-between">
              <MachineText className="text-xs text-foreground/70">
                This is what the day allowed.
              </MachineText>
              <MachineText className="text-xs text-foreground/70">
                TOTAL_LOGGED: {totalLoggedLabel}
              </MachineText>
            </View>
            <MachineText className="text-[10px] text-foreground/60">
              BUSY reduces free time. FOCUS boosts effective free. Other kinds are shown only.
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
                  onToggleNotes={toggleNotes}
                  onEdit={editBlock}
                  onDuplicate={duplicateBlockToday}
                  onDuplicateTomorrow={(b) => duplicateBlock(b, shiftDay(today.day, 1))}
                  onRemove={confirmRemove}
                  isRemoving={removingId === block._id}
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
              onPress={handleAddBusyTimeToday}
            >
              <MachineText className="text-accent-foreground font-bold">ADD BUSY TIME</MachineText>
            </Button>
            <MachineText className="text-xs text-foreground/70">
              Reason: protect what the day allows.
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

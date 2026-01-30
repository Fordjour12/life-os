import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Button, Spinner } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type CalendarBlock = {
  _id: string;
  startMin: number;
  endMin: number;
  kind: "busy" | "focus" | "rest" | "personal";
  title?: string;
  notes?: string;
};

function formatTime(minutes: number) {
  const clamped = Math.max(0, Math.min(1440, minutes));
  const hours = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const mins = (clamped % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function formatMinutes(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours <= 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function formatDayLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

function shiftDay(day: string, deltaDays: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const kindStyles: Record<CalendarBlock["kind"], { label: string; badge: string }> = {
  busy: { label: "BUSY", badge: "bg-[#FF5800]" },
  focus: { label: "FOCUS", badge: "bg-[#1F6FEB]" },
  rest: { label: "REST", badge: "bg-[#32CD32]" },
  personal: { label: "PERSONAL", badge: "bg-[#111111]" },
};

export default function TimeReality() {
  const router = useRouter();
  const calendarApi = api as unknown as {
    calendar: {
      addBlock: any;
      listBlocksForDay: any;
      getFreeMinutesForDay: any;
      removeBlock: any;
    };
  };
  const today = useQuery(api.kernel.commands.getToday);
  const addBlockMutation = useMutation(calendarApi.calendar.addBlock);
  const removeBlockMutation = useMutation(calendarApi.calendar.removeBlock);
  const blocks = useQuery(
    calendarApi.calendar.listBlocksForDay,
    today ? { day: today.day } : "skip",
  );
  const freeData = useQuery(
    calendarApi.calendar.getFreeMinutesForDay,
    today ? { day: today.day } : "skip",
  );

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedBlocks = useMemo(() => {
    const data = ((blocks ?? []) as CalendarBlock[]).slice();
    return data.sort((a, b) => a.startMin - b.startMin);
  }, [blocks]);

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

  if (!today || !freeData) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  const dayLabel = formatDayLabel(today.day).toUpperCase();
  const freeMinutesLabel = formatMinutes(freeData.freeMinutes);
  const busyMinutesLabel = formatMinutes(freeData.busyMinutes ?? 0);
  const capacityLabel = formatMinutes(freeData.capacityMinutes ?? 0);
  const otherMinutesLabel = formatMinutes(
    totals.focus + totals.rest + totals.personal,
  );
  const totalLoggedLabel = formatMinutes(totals.total);

  const toggleNotes = (blockId: string) => {
    setExpandedBlockId((current) => (current === blockId ? null : blockId));
  };

  const removeBlock = async (blockId: string) => {
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
  };

  const duplicateBlock = async (block: CalendarBlock, dayOverride?: string) => {
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
  };

  const confirmRemove = (block: CalendarBlock) => {
    if (removingId) return;
    Alert.alert(
      "Remove block?",
      "Reason: this protects what the day allows. Removing reduces the system’s reality signal.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeBlock(block._id) },
      ],
    );
  };

  const editBlock = (blockId: string) => {
    router.push({
      pathname: "/edit-busy-time" as any,
      params: { blockId },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 flex-row justify-between items-end border-b-2 border-primary/20 pb-2">
          <View>
            <MachineText variant="label" className="text-primary mb-1">
              REALITY_LAYER
            </MachineText>
            <MachineText variant="header" size="2xl">
              TIME_REALITY
            </MachineText>
          </View>
          <MachineText variant="value" className="text-sm">
            {dayLabel}
          </MachineText>
        </View>

        <HardCard label="TODAY_CAPACITY" className="mb-6">
          <View className="gap-4 p-4">
            <View className="flex-row justify-between items-end">
              <View>
                <MachineText variant="label">FREE_TIME</MachineText>
                <MachineText variant="header" size="xl">
                  {freeMinutesLabel}
                </MachineText>
              </View>
              <View className="items-end">
                <MachineText variant="label">BUSY_COUNTS</MachineText>
                <MachineText className="text-sm">{busyMinutesLabel}</MachineText>
                <MachineText variant="label" className="mt-2">
                  OTHER_BLOCKS_NO_COUNT
                </MachineText>
                <MachineText className="text-sm">{otherMinutesLabel}</MachineText>
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
              BUSY blocks reduce free time. Other kinds are shown only.
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
                <View
                  key={block._id}
                  className="flex-row items-start justify-between border border-black/10 bg-white px-3 py-2"
                >
                  <View className={`w-1 self-stretch ${kindStyles[block.kind].badge}`} />
                  <Pressable
                    className="flex-1 ml-3 mr-2"
                    onPress={() => toggleNotes(block._id)}
                  >
                    <MachineText className="font-bold text-sm">
                      {formatTime(block.startMin)} - {formatTime(block.endMin)}
                    </MachineText>
                    <MachineText className="text-xs text-foreground/60">
                      {block.title ? block.title : "Untitled block"}
                    </MachineText>
                    {block.notes && expandedBlockId === block._id ? (
                      <MachineText className="text-[10px] text-foreground/50 mt-1">
                        NOTES: {block.notes}
                      </MachineText>
                    ) : null}
                    {block.notes && expandedBlockId !== block._id ? (
                      <MachineText className="text-[9px] text-foreground/40 mt-1">
                        TAP_TO_VIEW_NOTES
                      </MachineText>
                    ) : null}
                  </Pressable>
                  <View className="items-end gap-2">
                    <View className="flex-row items-center gap-2">
                      <View className={`w-2 h-2 ${kindStyles[block.kind].badge}`} />
                      <MachineText variant="label">{kindStyles[block.kind].label}</MachineText>
                      {block.kind === "busy" ? (
                        <MachineText className="text-[9px] text-foreground/60">
                          COUNTS_FREE
                        </MachineText>
                      ) : null}
                    </View>
                    <View className="flex-row flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        className="bg-white border border-black shadow-[2px_2px_0px_black] px-2"
                        onPress={() => editBlock(block._id)}
                      >
                        <MachineText className="text-[10px] font-bold text-black">
                          EDIT
                        </MachineText>
                      </Button>
                      <Button
                        size="sm"
                        className="bg-white border border-black shadow-[2px_2px_0px_black] px-2"
                        onPress={() => duplicateBlock(block)}
                        isDisabled={removingId === block._id}
                      >
                        {removingId === block._id ? (
                          <Spinner size="sm" color="black" />
                        ) : (
                          <MachineText className="text-[9px] font-bold text-black">
                            DUPLICATE
                          </MachineText>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-white border border-black shadow-[2px_2px_0px_black] px-2"
                        onPress={() =>
                          duplicateBlock(block, shiftDay(today.day, 1))
                        }
                        isDisabled={removingId === block._id}
                      >
                        {removingId === block._id ? (
                          <Spinner size="sm" color="black" />
                        ) : (
                          <MachineText className="text-[9px] font-bold text-black">
                            TOMORROW
                          </MachineText>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        className="bg-white border border-black shadow-[2px_2px_0px_black] px-2"
                        onPress={() => confirmRemove(block)}
                        isDisabled={removingId === block._id}
                      >
                        {removingId === block._id ? (
                          <Spinner size="sm" color="black" />
                        ) : (
                          <MachineText className="text-[9px] font-bold text-black">
                            REMOVE
                          </MachineText>
                        )}
                      </Button>
                    </View>
                  </View>
                </View>
              ))
            )}
          </View>
        </HardCard>

        <HardCard label="ACTION">
          <View className="gap-3 p-4">
            <Button
              className="bg-primary border border-black shadow-[2px_2px_0px_black]"
              onPress={() => router.push("/add-busy-time" as any)}
            >
              <MachineText className="text-white font-bold">ADD BUSY TIME</MachineText>
            </Button>
            <MachineText className="text-xs text-foreground/70">
              Reason: protect what the day allows.
            </MachineText>
          </View>
        </HardCard>
      </ScrollView>
      {toastMessage ? (
        <View className="absolute bottom-6 left-4 right-4">
          <View className="bg-black px-3 py-2 border border-black shadow-[2px_2px_0px_black]">
            <MachineText className="text-white text-xs">{toastMessage}</MachineText>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

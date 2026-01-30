import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, SafeAreaView, ScrollView, View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { storage } from "@/lib/storage";

type Mood = "low" | "neutral" | "ok" | "good";

type JournalEntry = {
  _id: Id<"journalEntries">;
  day: string;
  text?: string;
  mood?: Mood;
  createdAt: number;
};

type JournalFilters = {
  moodFilter: Mood | "all";
  windowFilter: "7" | "30" | "all";
};

const FILTERS_KEY = "journal.filters.v1";

function loadFilters(): JournalFilters {
  const raw = storage.getString(FILTERS_KEY);
  if (!raw) {
    return { moodFilter: "all", windowFilter: "30" };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<JournalFilters>;
    const moodFilter =
      parsed.moodFilter === "low" ||
      parsed.moodFilter === "neutral" ||
      parsed.moodFilter === "ok" ||
      parsed.moodFilter === "good"
        ? parsed.moodFilter
        : "all";
    const windowFilter =
      parsed.windowFilter === "7" || parsed.windowFilter === "30" ? parsed.windowFilter : "all";
    return { moodFilter, windowFilter };
  } catch {
    return { moodFilter: "all", windowFilter: "30" };
  }
}

export default function JournalScreen() {
  const entries = useQuery(api.identity.getRecentJournalEntries, { limit: 30 });
  const deleteEntryMutation = useMutation(api.identity.deleteJournalEntry);
  const [moodFilter, setMoodFilter] = useState<JournalFilters["moodFilter"]>(
    () => loadFilters().moodFilter,
  );
  const [windowFilter, setWindowFilter] = useState<JournalFilters["windowFilter"]>(
    () => loadFilters().windowFilter,
  );
  const [deletingId, setDeletingId] = useState<Id<"journalEntries"> | null>(null);

  useEffect(() => {
    storage.set(FILTERS_KEY, JSON.stringify({ moodFilter, windowFilter }));
  }, [moodFilter, windowFilter]);

  if (entries === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  const entriesData = (entries ?? []) as JournalEntry[];

  const filteredEntries = useMemo(() => {
    const now = Date.now();
    let list = entriesData;

    if (windowFilter !== "all") {
      const days = Number(windowFilter);
      const cutoff = now - days * 24 * 60 * 60 * 1000;
      list = list.filter((entry) => entry.createdAt >= cutoff);
    }

    if (moodFilter !== "all") {
      list = list.filter((entry) => entry.mood === moodFilter);
    }

    return list;
  }, [entriesData, moodFilter, windowFilter]);

  const confirmDelete = (entryId: Id<"journalEntries">) => {
    Alert.alert(
      "CONFIRM_DELETION",
      "THIS_WILL_REMOVE_DATA_FROM_KERNEL.",
      [
        { text: "CANCEL", style: "cancel" },
        {
          text: "DELETE",
          style: "destructive",
          onPress: async () => {
            setDeletingId(entryId);
            try {
              await deleteEntryMutation({ entryId });
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6 border-b-2 border-primary/20 pb-2">
          <MachineText variant="label" className="text-primary mb-1">SYSTEM://JOURNAL</MachineText>
          <MachineText variant="header" size="2xl">LOGS</MachineText>
        </View>

        <HardCard label="FILTER_MODULE" className="mb-6 bg-[#E0E0DE]">
          <View className="gap-4 p-2">
            <View className="gap-2">
              <MachineText variant="label">WINDOW_SELECTOR</MachineText>
              <View className="flex-row flex-wrap gap-2">
                {(["7", "30", "all"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    onPress={() => setWindowFilter(value)}
                    className={`border-2 rounded-none ${windowFilter === value ? "bg-black border-black" : "bg-white border-black/10 shadow-[2px_2px_0px_black]"}`}
                  >
                    <MachineText className={`${windowFilter === value ? "text-white" : "text-black"} font-bold text-[10px]`}>
                      {value === "all" ? "ALL_TIME" : `${value}D`}
                    </MachineText>
                  </Button>
                ))}
              </View>
            </View>

            <View className="gap-2">
              <MachineText variant="label">MOOD_FILTER</MachineText>
              <View className="flex-row flex-wrap gap-2">
                {(["all", "low", "neutral", "ok", "good"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    onPress={() => setMoodFilter(value)}
                    className={`border-2 rounded-none ${moodFilter === value ? "bg-black border-black" : "bg-white border-black/10 shadow-[2px_2px_0px_black]"}`}
                  >
                    <MachineText className={`${moodFilter === value ? "text-white" : "text-black"} font-bold text-[10px]`}>
                      {value.toUpperCase()}
                    </MachineText>
                  </Button>
                ))}
              </View>
            </View>
          </View>
        </HardCard>

        {filteredEntries.length === 0 ? (
          <HardCard variant="flat" className="p-8 items-center border-dashed">
            <MachineText className="text-muted">NO_REFLECTIONS_SAVED.</MachineText>
          </HardCard>
        ) : (
          <View className="gap-4">
            {filteredEntries.map((entry) => (
              <HardCard key={entry._id} label={`LOG_${entry.day}`} className="bg-white">
                <View className="gap-3 p-2">
                  <View className="flex-row justify-between items-center opacity-50">
                    <MachineText className="text-[10px] font-bold">{entry.day}</MachineText>
                    {entry.mood && (
                      <MachineText className="text-[10px] font-bold">STATE: {entry.mood.toUpperCase()}</MachineText>
                    )}
                  </View>

                  <View className="bg-black/5 p-3 border-l-4 border-black">
                    <MachineText className="text-sm">
                      {entry.text || "NO_DESCRIPTION_PROVIDED."}
                    </MachineText>
                  </View>

                  <View className="items-start">
                    <Button
                      size="sm"
                      onPress={() => confirmDelete(entry._id)}
                      isDisabled={deletingId === entry._id}
                      className="rounded-none bg-white border border-black shadow-[2px_2px_0px_black]"
                    >
                      <MachineText className="text-black text-[10px] font-bold">
                        {deletingId === entry._id ? "DELETING..." : "DELETE"}
                      </MachineText>
                    </Button>
                  </View>
                </View>
              </HardCard>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

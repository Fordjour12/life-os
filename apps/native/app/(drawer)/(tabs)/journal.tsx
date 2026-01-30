import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
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
  query: string;
};

type SavedView = {
  id: string;
  name: string;
  moodFilter: JournalFilters["moodFilter"];
  windowFilter: JournalFilters["windowFilter"];
  query: string;
};

const FILTERS_KEY = "journal.filters.v2";
const SAVED_VIEWS_KEY = "journal.savedViews.v1";

function loadFilters(): JournalFilters {
  const raw = storage.getString(FILTERS_KEY);
  if (!raw) {
    return { moodFilter: "all", windowFilter: "30", query: "" };
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
    const query = typeof parsed.query === "string" ? parsed.query : "";
    return { moodFilter, windowFilter, query };
  } catch {
    return { moodFilter: "all", windowFilter: "30", query: "" };
  }
}

function loadSavedViews(): SavedView[] {
  const raw = storage.getString(SAVED_VIEWS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as SavedView[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((view) =>
      typeof view?.id === "string" &&
      typeof view?.name === "string" &&
      typeof view?.query === "string",
    );
  } catch {
    return [];
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
  const [searchQuery, setSearchQuery] = useState<JournalFilters["query"]>(
    () => loadFilters().query,
  );
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [viewName, setViewName] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"journalEntries"> | null>(null);

  useEffect(() => {
    storage.set(FILTERS_KEY, JSON.stringify({ moodFilter, windowFilter, query: searchQuery }));
  }, [moodFilter, searchQuery, windowFilter]);

  useEffect(() => {
    storage.set(SAVED_VIEWS_KEY, JSON.stringify(savedViews));
  }, [savedViews]);

  const entriesData = useMemo(() => (entries ?? []) as JournalEntry[], [entries]);

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

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((entry) => {
        const textMatch = entry.text?.toLowerCase().includes(query) ?? false;
        const dayMatch = entry.day.toLowerCase().includes(query);
        const moodMatch = entry.mood?.toLowerCase().includes(query) ?? false;
        return textMatch || dayMatch || moodMatch;
      });
    }

    return list;
  }, [entriesData, moodFilter, searchQuery, windowFilter]);

  const presets = [
    { id: "all", name: "ALL_TIME", windowFilter: "all", moodFilter: "all", query: "" },
    { id: "last7", name: "LAST_7D", windowFilter: "7", moodFilter: "all", query: "" },
    { id: "low7", name: "LOW_7D", windowFilter: "7", moodFilter: "low", query: "" },
    { id: "good30", name: "GOOD_30D", windowFilter: "30", moodFilter: "good", query: "" },
  ] as const;

  const applyFilters = (next: JournalFilters) => {
    setWindowFilter(next.windowFilter);
    setMoodFilter(next.moodFilter);
    setSearchQuery(next.query);
  };

  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const next: SavedView = {
      id: `view-${Date.now()}`,
      name: name.toUpperCase(),
      moodFilter,
      windowFilter,
      query: searchQuery,
    };
    setSavedViews((prev) => [next, ...prev].slice(0, 6));
    setViewName("");
  };

  const deleteView = (id: string) => {
    setSavedViews((prev) => prev.filter((view) => view.id !== id));
  };

  const groupedEntries = useMemo(() => {
    return filteredEntries.reduce<Record<string, JournalEntry[]>>((acc, entry) => {
      if (!acc[entry.day]) acc[entry.day] = [];
      acc[entry.day].push(entry);
      return acc;
    }, {});
  }, [filteredEntries]);

  const groupedDays = useMemo(() => {
    return Object.keys(groupedEntries).sort((a, b) => (a < b ? 1 : -1));
  }, [groupedEntries]);

  if (entries === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

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

        <View className="mb-6">
          <Button
            size="sm"
            onPress={() => setShowFilters((value) => !value)}
            className="border-2 rounded-none bg-white border-black/10 shadow-[2px_2px_0px_black]"
          >
            <MachineText className="text-black font-bold text-[10px]">
              {showFilters ? "HIDE_FILTERS" : "SHOW_FILTERS"}
            </MachineText>
          </Button>
        </View>

        {showFilters ? (
          <HardCard label="FILTER_MODULE" className="mb-6 bg-[#E0E0DE]">
            <View className="gap-4 p-2">
              <View className="gap-2">
                <MachineText variant="label">PRESETS</MachineText>
                <View className="flex-row flex-wrap gap-2">
                  {presets.map((preset) => (
                    <Button
                      key={preset.id}
                      size="sm"
                      onPress={() => applyFilters(preset)}
                      className="border-2 rounded-none bg-white border-black/10 shadow-[2px_2px_0px_black]"
                    >
                      <MachineText className="text-black font-bold text-[10px]">{preset.name}</MachineText>
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    onPress={() => applyFilters({ moodFilter: "all", windowFilter: "30", query: "" })}
                    className="border-2 rounded-none bg-white border-black/10 shadow-[2px_2px_0px_black]"
                  >
                    <MachineText className="text-black font-bold text-[10px]">RESET</MachineText>
                  </Button>
                </View>
              </View>

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

              <View className="gap-2">
                <MachineText variant="label">SEARCH</MachineText>
                <View className="bg-white border border-black/20 p-1">
                  <TextField>
                    <TextField.Input
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="SEARCH_TEXT_OR_DAY"
                      placeholderTextColor="#999"
                      className="font-mono text-sm h-8"
                      style={{ fontFamily: "Menlo", fontSize: 12 }}
                    />
                  </TextField>
                </View>
              </View>

              <View className="gap-2">
                <MachineText variant="label">SAVED_VIEWS</MachineText>
                <View className="flex-row flex-wrap gap-2">
                  {savedViews.length === 0 ? (
                    <MachineText className="text-[10px] text-muted">NO_SAVED_VIEWS.</MachineText>
                  ) : (
                    savedViews.map((view) => (
                      <View key={view.id} className="flex-row gap-2 items-center">
                        <Button
                          size="sm"
                          onPress={() => applyFilters(view)}
                          className="border-2 rounded-none bg-white border-black/10 shadow-[2px_2px_0px_black]"
                        >
                          <MachineText className="text-black font-bold text-[10px]">{view.name}</MachineText>
                        </Button>
                        <Button
                          size="sm"
                          onPress={() => deleteView(view.id)}
                          className="border-2 rounded-none bg-white border-black/10 shadow-[2px_2px_0px_black]"
                        >
                          <MachineText className="text-black font-bold text-[10px]">DEL</MachineText>
                        </Button>
                      </View>
                    ))
                  )}
                </View>
                <View className="flex-row gap-2">
                  <View className="flex-1 bg-white border border-black/20 p-1">
                    <TextField>
                      <TextField.Input
                        value={viewName}
                        onChangeText={setViewName}
                        placeholder="NAME_VIEW"
                        placeholderTextColor="#999"
                        className="font-mono text-sm h-8"
                        style={{ fontFamily: "Menlo", fontSize: 12 }}
                      />
                    </TextField>
                  </View>
                  <Button
                    size="sm"
                    onPress={saveView}
                    className="bg-black px-4 shadow-[2px_2px_0px_#FF5800]"
                  >
                    <MachineText className="text-white font-bold text-[10px]">SAVE</MachineText>
                  </Button>
                </View>
              </View>
            </View>
          </HardCard>
        ) : null}

        {entriesData.length === 0 ? (
          <HardCard variant="flat" className="p-8 items-center border-dashed">
            <MachineText className="text-muted">NO_REFLECTIONS_YET.</MachineText>
            <MachineText className="text-muted text-[10px]">WRITE_WHEN_IT_FEELS_HELPFUL.</MachineText>
          </HardCard>
        ) : filteredEntries.length === 0 ? (
          <HardCard variant="flat" className="p-8 items-center border-dashed">
            <MachineText className="text-muted">NO_MATCHES_FOR_FILTERS.</MachineText>
            <MachineText className="text-muted text-[10px]">TRY_WIDER_WINDOW_OR_ALL_MOODS.</MachineText>
          </HardCard>
        ) : (
          <View className="gap-6">
            {groupedDays.map((day) => (
              <HardCard key={day} label={`DAY_${day}`} className="bg-white">
                <View className="gap-3 p-2">
                  <View className="flex-row justify-between items-center opacity-50">
                    <MachineText className="text-[10px] font-bold">{day}</MachineText>
                    <MachineText className="text-[10px] font-bold">LOGS: {groupedEntries[day]?.length ?? 0}</MachineText>
                  </View>

                  <View className="gap-3">
                    {groupedEntries[day]?.map((entry) => (
                      <View key={entry._id} className="gap-3 bg-black/5 p-3 border-l-4 border-black">
                        <View className="flex-row justify-between items-center">
                          <MachineText className="text-[10px] font-bold">
                            {new Date(entry.createdAt).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </MachineText>
                          {entry.mood && (
                            <MachineText className="text-[10px] font-bold">
                              STATE: {entry.mood.toUpperCase()}
                            </MachineText>
                          )}
                        </View>
                        <MachineText className="text-sm">
                          {entry.text || "NO_DESCRIPTION_PROVIDED."}
                        </MachineText>
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
                    ))}
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

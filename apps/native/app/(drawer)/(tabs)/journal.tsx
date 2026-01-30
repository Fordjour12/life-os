import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Spinner } from "heroui-native";
import { Button } from "heroui-native";
import { useMemo, useState } from "react";
import { Alert, PlatformColor, ScrollView, Text, View } from "react-native";

import { GlassCard } from "@/components/ui/glass-card";

type Mood = "low" | "neutral" | "ok" | "good";

type JournalEntry = {
  _id: Id<"journalEntries">;
  day: string;
  text?: string;
  mood?: Mood;
  createdAt: number;
};

export default function JournalScreen() {
  const entries = useQuery(api.identity.getRecentJournalEntries, { limit: 30 });
  const deleteEntryMutation = useMutation(api.identity.deleteJournalEntry);
  const [moodFilter, setMoodFilter] = useState<Mood | "all">("all");
  const [windowFilter, setWindowFilter] = useState<"7" | "30" | "all">("30");
  const [deletingId, setDeletingId] = useState<Id<"journalEntries"> | null>(null);

  if (entries === undefined) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Spinner size="lg" />
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
      "Delete reflection?",
      "This will remove it from your journal.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: 6 }}>
        <Text selectable style={{ fontSize: 26, fontWeight: "600", color: PlatformColor("label") }}>
          Journal
        </Text>
        <Text selectable style={{ fontSize: 14, color: PlatformColor("secondaryLabel") }}>
          Optional reflections. No streaks, no pressure.
        </Text>
      </View>

      <GlassCard intensity={30}>
        <View style={{ gap: 12 }}>
          <View style={{ gap: 8 }}>
            <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: PlatformColor("secondaryLabel") }}>
              WINDOW
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["7", "30", "all"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={windowFilter === value ? "primary" : "secondary"}
                  onPress={() => setWindowFilter(value)}
                >
                  <Text selectable>{value === "all" ? "All time" : `Last ${value}d`}</Text>
                </Button>
              ))}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: PlatformColor("secondaryLabel") }}>
              MOOD
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {(["all", "low", "neutral", "ok", "good"] as const).map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={moodFilter === value ? "primary" : "secondary"}
                  onPress={() => setMoodFilter(value)}
                >
                  <Text selectable>{value === "all" ? "All moods" : value}</Text>
                </Button>
              ))}
            </View>
          </View>
        </View>
      </GlassCard>

      {filteredEntries.length === 0 ? (
        <GlassCard intensity={35}>
          <Text selectable style={{ fontSize: 14, color: PlatformColor("secondaryLabel") }}>
            No reflections yet. You can write when it feels helpful.
          </Text>
        </GlassCard>
      ) : (
        <View style={{ gap: 12 }}>
          {filteredEntries.map((entry) => (
            <GlassCard key={entry._id} intensity={40}>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text selectable style={{ fontSize: 12, color: PlatformColor("secondaryLabel") }}>
                    {entry.day}
                  </Text>
                  {entry.mood ? (
                    <Text selectable style={{ fontSize: 12, color: PlatformColor("secondaryLabel") }}>
                      Mood: {entry.mood}
                    </Text>
                  ) : null}
                </View>
                {entry.text ? (
                  <Text selectable style={{ fontSize: 15, color: PlatformColor("label") }}>
                    {entry.text}
                  </Text>
                ) : (
                  <Text selectable style={{ fontSize: 14, color: PlatformColor("secondaryLabel") }}>
                    Reflection saved without text.
                  </Text>
                )}
                <View style={{ alignItems: "flex-start" }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => confirmDelete(entry._id)}
                    isDisabled={deletingId === entry._id}
                  >
                    <Text selectable>{deletingId === entry._id ? "Deleting..." : "Delete"}</Text>
                  </Button>
                </View>
              </View>
            </GlassCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

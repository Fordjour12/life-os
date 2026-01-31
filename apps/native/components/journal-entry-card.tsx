import React from "react";
import { View } from "react-native";
import { Button } from "heroui-native";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type JournalEntry = {
  _id: Id<"journalEntries">;
  day: string;
  text?: string;
  mood?: "low" | "neutral" | "ok" | "good";
  createdAt: number;
};

type EntryCardProps = {
  entry: JournalEntry;
  deletingId: Id<"journalEntries"> | null;
  onDelete: (entryId: Id<"journalEntries">) => void;
};

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

export const JournalEntryCard = React.memo(function JournalEntryCard({
  entry,
  deletingId,
  onDelete,
}: EntryCardProps) {
  return (
    <View className="gap-3 bg-muted p-3 border-l-4 border-foreground">
      <View className="flex-row justify-between items-center">
        <MachineText className="text-[10px] font-bold">{formatTime(entry.createdAt)}</MachineText>
        {entry.mood && (
          <MachineText className="text-[10px] font-bold">
            STATE: {entry.mood.toUpperCase()}
          </MachineText>
        )}
      </View>
      <MachineText className="text-sm">{entry.text || "NO_DESCRIPTION_PROVIDED."}</MachineText>
      <View className="items-start">
        <Button
          size="sm"
          onPress={() => onDelete(entry._id)}
          isDisabled={deletingId === entry._id}
          className="rounded-none bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
        >
          <MachineText className="text-foreground text-[10px] font-bold">
            {deletingId === entry._id ? "DELETING..." : "DELETE"}
          </MachineText>
        </Button>
      </View>
    </View>
  );
});

type DayHeaderProps = {
  day: string;
  count: number;
};

export const DayHeader = React.memo(function DayHeader({ day, count }: DayHeaderProps) {
  return (
    <View className="flex-row justify-between items-center opacity-50">
      <MachineText className="text-[10px] font-bold">{day}</MachineText>
      <MachineText className="text-[10px] font-bold">LOGS: {count}</MachineText>
    </View>
  );
});

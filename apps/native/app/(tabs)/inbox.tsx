import React, { useMemo, useState } from "react";
import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button } from "heroui-native";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { InboxSkeleton } from "@/components/skeletons/inbox-skeleton";
import { getTimezoneOffsetMinutes } from "@/lib/date";
import { useSemanticColors } from "@/lib/theme";

type SuggestionItem = {
  id: string;
  day: string;
  type: string;
  priority: number;
  reason?: { detail?: string };
  payload?: unknown;
  status: string;
  createdAt: number;
};

type SuggestionMode = "today" | "recent" | "queue";
type SuggestionStatus = "new" | "handled" | "all";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Inbox() {
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const [mode, setMode] = useState<SuggestionMode>("today");
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus>("new");
  const daysBack = mode === "recent" ? 7 : mode === "queue" ? 30 : undefined;
  const suggestions = useQuery(api.kernel.suggestions.getSuggestions, {
    mode,
    status: statusFilter,
    daysBack,
    tzOffsetMinutes,
  }) as SuggestionItem[] | undefined;
  const execute = useMutation(api.kernel.commands.executeCommand);

  const vote = async (suggestionId: string, voteValue: "up" | "down" | "ignore") => {
    await execute({
      command: {
        cmd: "submit_feedback",
        input: { suggestionId, vote: voteValue },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
  };

  const groupedSuggestions = useMemo(() => {
    const safeSuggestions = suggestions ?? [];
    if (mode === "today") {
      return [{ day: "TODAY", items: safeSuggestions }];
    }
    const grouped = new Map<string, SuggestionItem[]>();
    for (const suggestion of safeSuggestions) {
      if (!grouped.has(suggestion.day)) {
        grouped.set(suggestion.day, []);
      }
      grouped.get(suggestion.day)!.push(suggestion);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, items]) => ({ day, items }));
  }, [mode, suggestions]);
  const colors = useSemanticColors();
  const router = useRouter();

  if (!suggestions) {
    return <InboxSkeleton />;
  }

  return (
    <Container className="pt-6">
      <View className="mb-4 border-b-2 border-divider pb-2 flex-row items-center justify-between">
        <View>
          <MachineText variant="header" size="2xl">
            SUGGESTIONS
          </MachineText>
          <MachineText className="text-muted-foreground/40 text-xs mt-1 uppercase">
            AI Recommendations
          </MachineText>
        </View>

        <Pressable
          onPress={() => router.push("/threads")}
          accessibilityLabel="Toggle calendar"
          className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)] px-2 py-1"
        >
          <Ionicons name="chatbubbles-outline" size={16} color={colors.foreground} />
        </Pressable>
      </View>

      <View className="mb-5 gap-3">
        <View className="flex-row gap-2 flex-wrap">
          {([
            { key: "today", label: "TODAY" },
            { key: "recent", label: "RECENT_7D" },
            { key: "queue", label: "QUEUE" },
          ] as const).map((item) => (
            <Button
              key={item.key}
              size="sm"
              onPress={() => setMode(item.key)}
              className={
                mode === item.key
                  ? "bg-foreground rounded-none"
                  : "bg-surface border border-foreground rounded-none"
              }
            >
              <MachineText
                className={
                  mode === item.key ? "text-background text-[10px]" : "text-foreground text-[10px]"
                }
              >
                {item.label}
              </MachineText>
            </Button>
          ))}
        </View>
        <View className="flex-row gap-2 flex-wrap">
          {([
            { key: "new", label: "NEW" },
            { key: "handled", label: "HANDLED" },
            { key: "all", label: "ALL" },
          ] as const).map((item) => (
            <Button
              key={item.key}
              size="sm"
              onPress={() => setStatusFilter(item.key)}
              className={
                statusFilter === item.key
                  ? "bg-accent rounded-none"
                  : "bg-surface border border-foreground rounded-none"
              }
            >
              <MachineText
                className={
                  statusFilter === item.key
                    ? "text-accent-foreground text-[10px]"
                    : "text-foreground text-[10px]"
                }
              >
                {item.label}
              </MachineText>
            </Button>
          ))}
        </View>
      </View>

      {suggestions.length ? (
        <View className="gap-4">
          {groupedSuggestions.map((group) => (
            <View key={group.day} className="gap-3">
              {mode !== "today" ? (
                <MachineText variant="label" className="text-accent">
                  {group.day}
                </MachineText>
              ) : null}
              {group.items.map((suggestion) => {
                const isActionable = suggestion.status === "new";
                return (
                  <HardCard
                    key={suggestion.id}
                    label="SIGNAL_DETECTED"
                    className="gap-3 p-4 bg-surface"
                  >
                  <View className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <MachineText className="font-bold text-lg">{suggestion.type}</MachineText>
                      <MachineText className="text-[10px] text-muted">
                        PRIORITY {suggestion.priority}
                      </MachineText>
                    </View>
                    {suggestion.reason?.detail ? (
                      <MachineText className="text-muted text-xs">
                        {suggestion.reason.detail}
                      </MachineText>
                    ) : null}
                    <View className="flex-row gap-2">
                      <MachineText className="text-[10px] text-muted">
                        STATUS: {suggestion.status.toUpperCase()}
                      </MachineText>
                      <MachineText className="text-[10px] text-muted">
                        DAY: {suggestion.day}
                      </MachineText>
                    </View>
                  </View>

                  <View className="flex-row gap-2 flex-wrap pt-2 border-t border-divider">
                    <Button
                      size="sm"
                      isDisabled={!isActionable}
                      className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                      onPress={() => vote(suggestion.id, "up")}
                    >
                      <MachineText className="text-accent-foreground font-bold text-[10px]">
                        USEFUL
                      </MachineText>
                    </Button>
                    <Button
                      size="sm"
                      isDisabled={!isActionable}
                      className="bg-surface border border-foreground rounded-none"
                      onPress={() => vote(suggestion.id, "down")}
                    >
                      <MachineText className="text-foreground font-bold text-[10px]">
                        NOT_USEFUL
                      </MachineText>
                    </Button>
                    <Button
                      size="sm"
                      isDisabled={!isActionable}
                      className="bg-surface border border-foreground rounded-none opacity-50"
                      onPress={() => vote(suggestion.id, "ignore")}
                    >
                      <MachineText className="text-foreground font-bold text-[10px]">
                        IGNORE
                      </MachineText>
                    </Button>
                  </View>
                  </HardCard>
                );
              })}
            </View>
          ))}
        </View>
      ) : (
        <HardCard variant="flat" className="p-6 border-dashed items-center justify-center">
          <MachineText className="text-muted">
            {mode === "today" ? "NO_SIGNALS_TODAY" : "NO_SIGNALS_IN_WINDOW"}
          </MachineText>
        </HardCard>
      )}
    </Container>
  );
}

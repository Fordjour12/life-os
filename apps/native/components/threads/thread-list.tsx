import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import type { ThreadItem } from "./thread-types";

interface ThreadListProps {
  threads: ThreadItem[];
  isLoading?: boolean;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return "Today";
  }

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${monthNames[date.getMonth()]} ${date.getDate()}${isCurrentYear ? "" : ` ${date.getFullYear()}`}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

export function ThreadList({ threads, isLoading }: ThreadListProps) {
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="px-4 pb-6">
        <HardCard label="THREAD_STATUS" className="bg-surface" padding="sm">
          <MachineText className="text-xs text-muted-foreground">LOADING_THREADS...</MachineText>
        </HardCard>
      </View>
    );
  }

  if (threads.length === 0) {
    return (
      <View className="px-4 pb-6">
        <HardCard label="THREADS" className="bg-surface" padding="sm">
          <View className="gap-2">
            <MachineText variant="header" size="lg">
              NO_THREADS
            </MachineText>
            <MachineText className="text-xs text-muted-foreground">
              Start a conversation from the journal or inbox.
            </MachineText>
          </View>
        </HardCard>
      </View>
    );
  }

  return (
    <View className="px-4 pb-6 gap-4">
      {threads.map((thread) => {
        const shortId = thread.id.slice(0, 4).toUpperCase();
        return (
          <Pressable
            key={thread.id}
            onPress={() => router.push(`/threads/${thread.id}` as any)}
            className="active:opacity-80"
          >
            <HardCard label={`THREAD/${shortId}`} className="bg-surface" padding="sm">
              <View className="gap-3">
                <View className="flex-row items-start justify-between gap-3">
                  <MachineText variant="header" size="lg" className="flex-1">
                    {thread.title ?? "NEW_CONVERSATION"}
                  </MachineText>
                  <MachineText className="text-[10px] text-muted-foreground">
                    {formatDate(thread.updatedAt)}
                  </MachineText>
                </View>

                <View className="h-0.5 bg-accent/30" />

                {thread.lastMessage ? (
                  <MachineText className="text-sm text-muted-foreground" numberOfLines={2}>
                    <MachineText className="text-xs text-muted-foreground">
                      {thread.lastMessageRole === "user" ? "USER: " : "ASSISTANT: "}
                    </MachineText>
                    {truncateText(thread.lastMessage, 96)}
                  </MachineText>
                ) : thread.summary ? (
                  <MachineText className="text-sm text-muted-foreground" numberOfLines={2}>
                    {thread.summary}
                  </MachineText>
                ) : null}

                {thread.metadata && (
                  <View className="self-start border border-divider bg-muted px-2 py-1">
                    <MachineText className="text-[10px] text-muted-foreground tracking-widest">
                      {thread.metadata.type}
                    </MachineText>
                  </View>
                )}
              </View>
            </HardCard>
          </Pressable>
        );
      })}
    </View>
  );
}

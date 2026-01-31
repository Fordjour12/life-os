import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAppTheme } from "@/contexts/app-theme-context";
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

export function ThreadList({ threads, isLoading }: ThreadListProps) {
  const { currentTheme } = useAppTheme();
  const router = useRouter();
  const colors =
    currentTheme === "dark"
      ? {
          surface: "#1A1A1A",
          border: "#333333",
          text: "#FFFFFF",
          textMuted: "#888888",
          textSecondary: "#AAAAAA",
        }
      : {
          surface: "#FFFFFF",
          border: "#E0E0E0",
          text: "#000000",
          textMuted: "#888888",
          textSecondary: "#666666",
        };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <MachineText style={{ color: colors.textMuted }}>LOADING_THREADS...</MachineText>
      </View>
    );
  }

  if (threads.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MachineText style={[styles.emptyText, { color: colors.textMuted }]}>
          No threads yet. Start a conversation from the journal or inbox.
        </MachineText>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {threads.map((thread) => (
        <Pressable
          key={thread.id}
          onPress={() => router.push(`/threads/${thread.id}` as any)}
          style={[styles.item, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.header}>
            <MachineText style={[styles.title, { color: colors.text }]}>
              {thread.title ?? "Untitled Thread"}
            </MachineText>
            <MachineText style={[styles.date, { color: colors.textMuted }]}>
              {formatDate(thread.updatedAt)}
            </MachineText>
          </View>
          {thread.summary && (
            <MachineText
              style={[styles.summary, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {thread.summary}
            </MachineText>
          )}
          {thread.metadata && (
            <View style={styles.badge}>
              <MachineText style={[styles.badgeText, { color: colors.textMuted }]}>
                {thread.metadata.type}
              </MachineText>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
  },
  item: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  date: {
    fontSize: 13,
  },
  summary: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  badgeText: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

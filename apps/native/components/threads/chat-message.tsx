import { View, Text, StyleSheet } from "react-native";
import { useAppTheme } from "@/contexts/app-theme-context";
import type { UIMessage } from "@convex-dev/agent";

interface ChatMessageProps {
  message: UIMessage;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  const m = minutes < 10 ? `0${minutes}` : minutes;
  return `${h}:${m} ${ampm}`;
}

export function ChatMessageItem({ message }: ChatMessageProps) {
  const { currentTheme } = useAppTheme();
  const isUser = message.role === "user";
  const timestamp = message._creationTime ?? Date.now();
  const colors =
    currentTheme === "dark"
      ? {
          primary: "#0066CC",
          surfaceVariant: "#2A2A2A",
          text: "#FFFFFF",
          textMuted: "#888888",
          background: "#1A1A1A",
        }
      : {
          primary: "#0066CC",
          surfaceVariant: "#F0F0F0",
          text: "#000000",
          textMuted: "#888888",
          background: "#FFFFFF",
        };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: isUser ? colors.primary : colors.surfaceVariant,
          },
        ]}
      >
        <Text style={[styles.content, { color: isUser ? "#FFFFFF" : colors.text }]}>
          {message.text}
        </Text>
      </View>
      <Text style={[styles.timestamp, { color: colors.textMuted }]}>{formatTime(timestamp)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  userContainer: {
    alignItems: "flex-end",
  },
  assistantContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "85%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
    marginHorizontal: 4,
  },
});

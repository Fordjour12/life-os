import type { UIMessage } from "@convex-dev/agent";
import { View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

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
  const isUser = message.role === "user";
  const timestamp = message._creationTime ?? Date.now();
  const label = isUser ? "USER" : "ASSISTANT";
  const summary = isUser ? "INPUT_PACKET" : "OUTPUT_PACKET";
  const alignment = isUser ? "items-end" : "items-start";
  const cardWidth = isUser ? "max-w-[92%]" : "max-w-[96%]";

  return (
    <View className={`px-4 mb-3 ${alignment}`}>
      <HardCard
        label={label}
        className={`${cardWidth} ${isUser ? "bg-foreground" : "bg-surface"}`}
        padding="sm"
      >
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <MachineText className={isUser ? "text-background" : "text-accent"}>
              {summary}
            </MachineText>
            <MachineText className={isUser ? "text-background/70 text-[10px]" : "text-muted-foreground text-[10px]"}>
              {formatTime(timestamp)}
            </MachineText>
          </View>
          <View className={isUser ? "h-px bg-background/30" : "h-px bg-accent/30"} />
          <MachineText className={isUser ? "text-background text-sm" : "text-foreground text-sm"}>
            {message.text}
          </MachineText>
        </View>
      </HardCard>
    </View>
  );
}

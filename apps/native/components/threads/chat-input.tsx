import { useCallback, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!text.trim() || isSending || disabled) return;
    const messageText = text.trim();
    setText("");
    setIsSending(true);
    try {
      await onSend(messageText);
    } finally {
      setIsSending(false);
    }
  }, [text, isSending, disabled, onSend]);

  return (
    <View className="px-4 pb-4">
      <HardCard label="CONSOLE" className="bg-surface" padding="sm">
        <View className="gap-3">
          <View className="h-0.5 bg-accent/30" />
          <View className="flex-row items-end gap-2">
            <View className="flex-1 border border-field-border bg-field-background px-3 py-2">
              <TextInput
                className="text-field-foreground text-sm"
                value={text}
                onChangeText={setText}
                placeholder={placeholder ?? "Type a message..."}
                placeholderTextColor="var(--color-field-placeholder)"
                multiline
                maxLength={2000}
                editable={!disabled && !isSending}
              />
            </View>
            <Pressable
              onPress={handleSend}
              disabled={!text.trim() || isSending || disabled}
              className={
                text.trim() && !disabled && !isSending
                  ? "bg-foreground border border-foreground"
                  : "bg-muted border border-divider"
              }
            >
              <View className="px-4 py-3">
                <MachineText
                  className={
                    text.trim() && !disabled && !isSending
                      ? "text-background text-xs font-bold"
                      : "text-muted-foreground text-xs"
                  }
                >
                  SEND
                </MachineText>
              </View>
            </Pressable>
          </View>
        </View>
      </HardCard>
    </View>
  );
}

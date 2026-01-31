import { useState, useCallback } from "react";
import { View, TextInput, StyleSheet, Pressable, Text } from "react-native";
import { useAppTheme } from "@/contexts/app-theme-context";

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder }: ChatInputProps) {
  const { currentTheme } = useAppTheme();
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const colors =
    currentTheme === "dark"
      ? {
          surface: "#1A1A1A",
          border: "#333333",
          text: "#FFFFFF",
          textMuted: "#888888",
          primary: "#0066CC",
          surfaceVariant: "#2A2A2A",
        }
      : {
          surface: "#FFFFFF",
          border: "#E0E0E0",
          text: "#000000",
          textMuted: "#888888",
          primary: "#0066CC",
          surfaceVariant: "#F0F0F0",
        };

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
    <View style={styles.container}>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: colors.text }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder ?? "Type a message..."}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          editable={!disabled && !isSending}
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim() || isSending || disabled}
          style={[
            styles.sendButton,
            {
              backgroundColor: text.trim() ? colors.primary : colors.surfaceVariant,
            },
          ]}
        >
          <Text
            style={{
              color: text.trim() ? "#FFFFFF" : colors.textMuted,
              fontSize: 18,
              fontWeight: "bold",
            }}
          >
            ↑
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
});

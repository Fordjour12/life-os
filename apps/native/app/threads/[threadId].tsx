import type { UIMessage } from "@convex-dev/agent";
import { api } from "@life-os/backend/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { Container } from "@/components/container";
import { ChatInput } from "@/components/threads/chat-input";
import { ChatMessageItem } from "@/components/threads/chat-message";
import { MachineText } from "@/components/ui/machine-text";

export default function ThreadDetail() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const messagesData = useQuery(api.threads.getConversationMessages, {
    threadId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const sendMessage = useAction(api.threads.sendMessageWithResponse);

  const messages = messagesData?.page ?? [];
  const isLoading = messagesData === undefined;
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !threadId) return;
      setIsSending(true);
      try {
        await sendMessage({
          threadId,
          content: text,
        });
      } finally {
        setIsSending(false);
      }
    },
    [threadId, sendMessage],
  );

  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd?.({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  if (!threadId) {
    return (
      <Container className="pt-6">
        <MachineText className="text-muted-foreground">Invalid thread</MachineText>
      </Container>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="height"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Container className="pt-6 flex-1">
        <View className="relative px-4 pb-2">
          <View className="absolute -right-2 top-6 size-20 border border-divider/60" />
          <View className="absolute right-6 top-20 size-12 border border-divider/40" />

          <View className="mb-4 border-b-2 border-divider pb-3">
            <MachineText variant="label" className="text-accent mb-2">
              SYSTEM://THREAD
            </MachineText>
            <MachineText variant="header" size="xl">
              CONVERSATION
            </MachineText>
            <MachineText className="text-muted-foreground text-xs mt-1 uppercase">
              {threadId.slice(0, 8)}...
            </MachineText>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {isLoading ? (
            <MachineText className="text-muted-foreground text-center mt-8">
              LOADING_MESSAGES...
            </MachineText>
          ) : messages.length === 0 ? (
            <View className="items-center justify-center py-12">
              <MachineText className="text-muted-foreground text-center">
                NO_MESSAGES_YET
              </MachineText>
              <MachineText className="text-muted-foreground text-center text-xs mt-2">
                Start the conversation below
              </MachineText>
            </View>
          ) : (
            messages.map((message: UIMessage) => (
              <ChatMessageItem key={message.key} message={message} />
            ))
          )}
        </ScrollView>

        <ChatInput
          onSend={handleSend}
          disabled={isSending}
          placeholder="Type a message..."
        />
      </Container>
    </KeyboardAvoidingView>
  );
}

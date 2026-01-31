import { useLocalSearchParams } from "expo-router";
import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useState, useCallback, useRef, useEffect } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";

import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { ChatMessageItem } from "@/components/threads/chat-message";
import { ChatInput } from "@/components/threads/chat-input";
import type { ChatMessage } from "@/components/threads/thread-types";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function ThreadDetail() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const messagesData = useQuery(api.threads.getConversationMessages, { threadId });
  const sendMessage = useMutation(api.threads.addMessage);
  
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const messages = messagesData?.messages ?? [];
  const isLoading = messagesData === undefined;

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsSending(true);
    try {
      await sendMessage({
        threadId,
        content: text,
      });
    } finally {
      setIsSending(false);
    }
  }, [threadId, sendMessage]);

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
        <MachineText className="text-muted">Invalid thread</MachineText>
      </Container>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Container className="pt-6 flex-1">
        <View className="mb-4 border-b-2 border-divider pb-2">
          <MachineText variant="header" size="xl">
            THREAD
          </MachineText>
          <MachineText className="text-muted text-xs mt-1 uppercase">
            {threadId.slice(0, 8)}...
          </MachineText>
        </View>

        <ScrollView 
          ref={scrollRef}
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {isLoading ? (
            <MachineText className="text-muted text-center mt-8">
              LOADING_MESSAGES...
            </MachineText>
          ) : messages.length === 0 ? (
            <View className="items-center justify-center py-12">
              <MachineText className="text-muted text-center">
                NO_MESSAGES_YET
              </MachineText>
              <MachineText className="text-muted text-center text-xs mt-2">
                Start the conversation below
              </MachineText>
            </View>
          ) : (
            messages.map((message: ChatMessage) => (
              <ChatMessageItem key={message.id} message={message} />
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

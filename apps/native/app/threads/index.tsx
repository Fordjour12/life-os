import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { Button } from "heroui-native";

import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { ThreadList } from "@/components/threads/thread-list";

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function ThreadsIndex() {
  const router = useRouter();
  const threadsData = useQuery(api.threads.listConversations, {});
  const createThread = useMutation(api.threads.createConversation);

  const threads = threadsData?.threads ?? [];
  const isLoading = threadsData === undefined;

  const startConversation = async () => {
    const result = await createThread({ title: "New Conversation" });
    if (result.threadId) {
      router.push(`/threads/${result.threadId}`);
    }
  };

  return (
    <Container className="pt-6">
      <View className="relative px-4 pb-2">
        <View className="absolute -right-2 top-6 size-20 border border-divider/60" />
        <View className="absolute right-6 top-20 size-12 border border-divider/40" />

        <View className="mb-6 border-b-2 border-divider pb-3">
          <MachineText variant="label" className="text-accent mb-2">
            SYSTEM://THREADS
          </MachineText>
          <MachineText variant="header" size="2xl">
            CONVERSATIONS
          </MachineText>
          <MachineText className="text-muted-foreground text-xs mt-1 uppercase">
            Your Messages
          </MachineText>
        </View>
      </View>

      <View className="px-4 mb-4">
        <Button
          className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
          onPress={startConversation}
          size="sm"
        >
          <MachineText className="text-background font-bold text-[10px]">
            NEW_CONVERSATION
          </MachineText>
        </Button>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <ThreadList threads={threads} isLoading={isLoading} />
      </ScrollView>
    </Container>
  );
}

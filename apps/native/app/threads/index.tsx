import { api } from "@life-os/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { ScrollView, View } from "react-native";

import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { ThreadList } from "@/components/threads/thread-list";

export default function ThreadsIndex() {
  const threadsData = useQuery(api.threads.listConversations, {});

  const threads = threadsData?.threads ?? [];
  const isLoading = threadsData === undefined;

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
            Thread History
          </MachineText>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <ThreadList threads={threads} isLoading={isLoading} />
      </ScrollView>
    </Container>
  );
}

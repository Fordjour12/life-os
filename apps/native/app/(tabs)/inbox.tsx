import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button } from "heroui-native";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { InboxSkeleton } from "@/components/skeletons/inbox-skeleton";
import { getTimezoneOffsetMinutes } from "@/lib/date";

type SuggestionItem = {
  _id: string;
  type: string;
  reason?: { detail?: string };
};

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Inbox() {
  const router = useRouter();
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const data = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
  const execute = useMutation(api.kernel.commands.executeCommand);
  const createThread = useMutation(api.threads.createConversation);

  const vote = async (
    suggestionId: string,
    voteValue: "up" | "down" | "ignore",
  ) => {
    await execute({
      command: {
        cmd: "submit_feedback",
        input: { suggestionId, vote: voteValue },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
  };

  const startConversation = async () => {
    const result = await createThread({ title: "New Conversation" });
    if (result.threadId) {
      router.push(`/threads/${result.threadId}`);
    }
  };

  if (!data) {
    return <InboxSkeleton />;
  }

  const suggestions = (data.suggestions ?? []) as SuggestionItem[];

  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="header" size="2xl">
          SIGNAL_BUFFER
        </MachineText>
        <MachineText className="text-muted text-xs mt-1 uppercase">
          Incoming Telemetry Review
        </MachineText>
      </View>

      {suggestions.length ? (
        <View className="gap-4">
          {suggestions.map((suggestion) => (
            <HardCard
              key={suggestion._id}
              label="SIGNAL_DETECTED"
              className="gap-3 p-4 bg-surface"
            >
              <View className="gap-1">
                <MachineText className="font-bold text-lg">
                  {suggestion.type}
                </MachineText>
                <MachineText className="text-muted text-xs">
                  {suggestion.reason?.detail}
                </MachineText>
              </View>

              <View className="flex-row gap-2 flex-wrap pt-2 border-t border-divider">
                <Button
                  size="sm"
                  className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                  onPress={() => vote(suggestion._id, "up")}
                >
                  <MachineText className="text-accent-foreground font-bold text-[10px]">
                    USEFUL
                  </MachineText>
                </Button>
                <Button
                  size="sm"
                  className="bg-surface border border-foreground rounded-none"
                  onPress={() => vote(suggestion._id, "down")}
                >
                  <MachineText className="text-foreground font-bold text-[10px]">
                    NOT_USEFUL
                  </MachineText>
                </Button>
                <Button
                  size="sm"
                  className="bg-surface border border-foreground rounded-none opacity-50"
                  onPress={() => vote(suggestion._id, "ignore")}
                >
                  <MachineText className="text-foreground font-bold text-[10px]">
                    IGNORE
                  </MachineText>
                </Button>
              </View>
            </HardCard>
          ))}
        </View>
      ) : (
        <HardCard
          variant="flat"
          className="p-6 border-dashed items-center justify-center"
        >
          <MachineText className="text-muted">NO_SIGNALS_DETECTED</MachineText>
        </HardCard>
      )}

      <View className="mt-8 pt-4 border-t border-divider">
        <MachineText variant="label" className="mb-4">
          CONVERSATION
        </MachineText>

        <Button
          className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
          onPress={startConversation}
          size="sm"
        >
          <MachineText className="text-background font-bold text-[10px]">
            START_CONVERSATION
          </MachineText>
        </Button>

        <Button
          className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]  mt-6"
          onPress={() => router.push("/threads")}
          size="sm"
        >
          <MachineText className="text-background font-bold text-[10px]">
            CONVERSATIONS
          </MachineText>
        </Button>
      </View>
    </Container>
  );
}

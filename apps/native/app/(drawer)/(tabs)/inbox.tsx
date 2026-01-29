import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, Surface } from "heroui-native";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

type SuggestionItem = {
  _id: string;
  type: string;
  reason?: { detail?: string };
};

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Inbox() {
  const data = useQuery(api.kernel.commands.getToday);
  const execute = useMutation(api.kernel.commands.executeCommand);

  const vote = async (suggestionId: string, voteValue: "up" | "down" | "ignore") => {
    await execute({
      command: {
        cmd: "submit_feedback",
        input: { suggestionId, vote: voteValue },
        idempotencyKey: idem(),
      },
    });
  };

  if (!data) {
    return (
      <Container className="p-6">
        <View className="flex-1 justify-center items-center">
          <Spinner size="lg" />
        </View>
      </Container>
    );
  }

  const suggestions = (data.suggestions ?? []) as SuggestionItem[];

  return (
    <Container className="p-6 gap-4">
      <View>
        <Text className="text-3xl font-semibold text-foreground tracking-tight">Inbox</Text>
        <Text className="text-muted text-sm mt-1">Gentle suggestions to review</Text>
      </View>

      {suggestions.length ? (
        suggestions.map((suggestion) => (
          <Surface key={suggestion._id} variant="secondary" className="p-4 rounded-2xl gap-3">
            <View className="gap-1">
              <Text className="text-foreground font-semibold">{suggestion.type}</Text>
              <Text className="text-muted">{suggestion.reason?.detail}</Text>
            </View>

            <View className="flex-row gap-2">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => vote(suggestion._id, "up")}
              >
                Helpful
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => vote(suggestion._id, "down")}
              >
                Not helpful
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onPress={() => vote(suggestion._id, "ignore")}
              >
                Ignore
              </Button>
            </View>
          </Surface>
        ))
      ) : (
        <Surface variant="secondary" className="p-4 rounded-2xl">
          <Text className="text-muted">No suggestions</Text>
        </Surface>
      )}
    </Container>
  );
}

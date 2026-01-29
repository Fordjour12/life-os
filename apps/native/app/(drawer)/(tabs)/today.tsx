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

export default function Today() {
  const data = useQuery(api.kernel.commands.getToday);
  const execute = useMutation(api.kernel.commands.executeCommand);

  const completeDemoTask = async () => {
    await execute({
      command: {
        cmd: "complete_task",
        input: { taskId: "demo_task" },
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
        <Text className="text-3xl font-semibold text-foreground tracking-tight">Today</Text>
        <Text className="text-muted text-sm mt-1">Kernel state snapshot</Text>
      </View>

      <Surface variant="secondary" className="p-4 rounded-2xl gap-2">
        <Text className="text-foreground font-semibold">State</Text>
        <Text className="text-muted">Mode: {data.state?.mode ?? "-"}</Text>
        <Text className="text-muted">Load: {data.state?.load ?? "-"}</Text>
        <Text className="text-muted">Momentum: {data.state?.momentum ?? "-"}</Text>
        <Text className="text-muted">Focus: {data.state?.focusCapacity ?? "-"}</Text>
      </Surface>

      <Button onPress={completeDemoTask} variant="secondary">
        Complete demo task (creates event)
      </Button>

      <Surface variant="secondary" className="p-4 rounded-2xl gap-3">
        <Text className="text-foreground font-semibold">Top suggestions</Text>
        {suggestions.length ? (
          suggestions.map((suggestion) => (
            <Surface
              key={suggestion._id}
              variant="default"
              className="p-3 rounded-xl gap-1"
            >
              <Text className="text-foreground font-semibold">{suggestion.type}</Text>
              <Text className="text-muted">{suggestion.reason?.detail}</Text>
            </Surface>
          ))
        ) : (
          <Text className="text-muted">None</Text>
        )}
      </Surface>
    </Container>
  );
}

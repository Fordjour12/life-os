import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

type SuggestionItem = {
  _id: string;
  type: string;
  reason?: { detail?: string };
  payload?: { keepCount?: 1 | 2 };
};

type TaskItem = {
  _id: Id<"tasks">;
  title: string;
  estimateMin: number;
  status: string;
};

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Today() {
  const data = useQuery(api.kernel.commands.getToday);
  const tasksData = useQuery(api.kernel.taskQueries.getActiveTasks);
  const createTaskMutation = useMutation(api.kernel.taskCommands.createTask);
  const completeTaskMutation = useMutation(api.kernel.taskCommands.completeTask);
  const applyPlanResetMutation = useMutation(api.kernel.planReset.applyPlanReset);
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [isCreating, setIsCreating] = useState(false);

  const createTask = async () => {
    const trimmedTitle = title.trim();
    const estimateMin = Number.parseInt(estimate, 10);

    if (!trimmedTitle || !Number.isFinite(estimateMin) || estimateMin <= 0) {
      return;
    }

    setIsCreating(true);
    try {
      await createTaskMutation({
        title: trimmedTitle,
        estimateMin,
        priority: 2,
        idempotencyKey: idem(),
      });
      setTitle("");
      setEstimate("25");
    } finally {
      setIsCreating(false);
    }
  };

  const completeTask = async (taskId: Id<"tasks">) => {
    await completeTaskMutation({
      taskId,
      idempotencyKey: idem(),
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
  const tasks = (tasksData ?? []) as TaskItem[];

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

      <Surface variant="secondary" className="p-4 rounded-2xl gap-3">
        <Text className="text-foreground font-semibold">Tasks</Text>
        <View className="gap-3">
          <TextField>
            <TextField.Label>Task name</TextField.Label>
            <TextField.Input
              value={title}
              onChangeText={setTitle}
              placeholder="Write a tiny win"
            />
          </TextField>
          <TextField>
            <TextField.Label>Estimate (minutes)</TextField.Label>
            <TextField.Input
              value={estimate}
              onChangeText={setEstimate}
              placeholder="25"
              keyboardType="number-pad"
            />
          </TextField>
          <Button onPress={createTask} isDisabled={isCreating} variant="secondary">
            {isCreating ? <Spinner size="sm" color="default" /> : "Add task"}
          </Button>
        </View>

        {tasks.length ? (
          tasks.map((task) => (
            <Surface key={task._id} variant="default" className="p-3 rounded-xl">
              <View className="flex-row items-center justify-between">
                <View className="gap-1">
                  <Text className="text-foreground font-semibold">{task.title}</Text>
                  <Text className="text-muted text-xs">{task.estimateMin} min</Text>
                </View>
                <Button size="sm" variant="secondary" onPress={() => completeTask(task._id)}>
                  Done
                </Button>
              </View>
            </Surface>
          ))
        ) : (
          <Text className="text-muted">No open tasks yet</Text>
        )}
      </Surface>

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
              {suggestion.type === "PLAN_RESET" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    applyPlanResetMutation({
                      day: data.day,
                      keepCount: suggestion.payload?.keepCount ?? 1,
                      idempotencyKey: idem(),
                    })
                  }
                >
                  Apply Plan Reset
                </Button>
              ) : null}
            </Surface>
          ))
        ) : (
          <Text className="text-muted">None</Text>
        )}
      </Surface>
    </Container>
  );
}

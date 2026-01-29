import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

type TaskItem = {
  _id: Id<"tasks">;
  title: string;
  estimateMin: number;
  status: string;
};

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Tasks() {
  const tasksData = useQuery(api.kernel.taskQueries.getActiveTasks);
  const pausedTasksData = useQuery(api.kernel.taskQueries.getPausedTasks);
  const createTaskMutation = useMutation(api.kernel.taskCommands.createTask);
  const completeTaskMutation = useMutation(api.kernel.taskCommands.completeTask);
  const resumeTaskMutation = useMutation(api.kernel.resumeTasks.resumeTask);
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [isCreating, setIsCreating] = useState(false);
  const [showPaused, setShowPaused] = useState(false);

  const tasks = (tasksData ?? []) as TaskItem[];
  const pausedTasks = (pausedTasksData ?? []) as TaskItem[];

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
    await completeTaskMutation({ taskId, idempotencyKey: idem() });
  };

  const resumeTask = async (taskId: Id<"tasks">) => {
    await resumeTaskMutation({
      taskId,
      reason: "manual",
      idempotencyKey: idem(),
    });
  };

  if (!tasksData || !pausedTasksData) {
    return (
      <Container className="p-6">
        <View className="flex-1 justify-center items-center">
          <Spinner size="lg" />
        </View>
      </Container>
    );
  }

  return (
    <Container className="p-6 gap-4">
      <View>
        <Text className="text-3xl font-semibold text-foreground tracking-tight">Tasks</Text>
        <Text className="text-muted text-sm mt-1">
          Small, doable steps that feed momentum
        </Text>
      </View>

      <Surface variant="secondary" className="p-4 rounded-2xl gap-3">
        <Text className="text-foreground font-semibold">Create</Text>
        <View className="gap-3">
          <TextField>
            <TextField.Label>Task name</TextField.Label>
            <TextField.Input
              value={title}
              onChangeText={setTitle}
              placeholder="Small, doable task"
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
      </Surface>

      <Surface variant="secondary" className="p-4 rounded-2xl gap-3">
        <Text className="text-foreground font-semibold">Active</Text>
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
          <Text className="text-muted">No active tasks yet</Text>
        )}
      </Surface>

      {pausedTasks.length ? (
        <Surface variant="secondary" className="p-4 rounded-2xl gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-foreground font-semibold">
              Paused for now (Plan Reset)
            </Text>
            <Button size="sm" variant="secondary" onPress={() => setShowPaused(!showPaused)}>
              {showPaused ? "Hide" : `Show ${pausedTasks.length}`}
            </Button>
          </View>
          {showPaused ? (
            pausedTasks.map((task) => (
              <Surface key={task._id} variant="default" className="p-3 rounded-xl">
                <View className="flex-row items-center justify-between">
                  <View className="gap-1">
                    <Text className="text-foreground font-semibold">{task.title}</Text>
                    <Text className="text-muted text-xs">{task.estimateMin} min</Text>
                  </View>
                  <Button size="sm" variant="secondary" onPress={() => resumeTask(task._id)}>
                    Resume
                  </Button>
                </View>
              </Surface>
            ))
          ) : (
            <Text className="text-muted text-sm">Kept safe until you are ready.</Text>
          )}
        </Surface>
      ) : null}
    </Container>
  );
}

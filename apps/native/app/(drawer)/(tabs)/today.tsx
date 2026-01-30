import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GlassCard } from "@/components/ui/glass-card";
import { H1, H2, H3, Body, Caption, Label } from "@/components/ui/typography";
import { StatusBadge } from "@/components/ui/status-badge";

type SuggestionItem = {
  _id: string;
  type: string;
  reason?: { detail?: string };
  payload?: {
    keepCount?: 1 | 2;
    taskId?: Id<"tasks">;
    title?: string;
    estimateMin?: number;
  };
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
  const resumeTaskMutation = useMutation(api.kernel.resumeTasks.resumeTask);

  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [isCreating, setIsCreating] = useState(false);

  const createTask = async () => {
    const trimmedTitle = title.trim();
    const estimateMin = Number.parseInt(estimate, 10);
    if (!trimmedTitle || !Number.isFinite(estimateMin) || estimateMin <= 0) return;

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

  const resumeTask = async (taskId?: Id<"tasks">) => {
    if (!taskId) return;
    await resumeTaskMutation({
      taskId,
      reason: "gentle_return",
      idempotencyKey: idem(),
    });
  };

  const getStatusIntent = (value: string): "success" | "warning" | "danger" | "default" => {
    const val = value?.toLowerCase();
    if (["high", "balanced", "strong", "operational"].includes(val)) return "success";
    if (["medium", "steady", "stable"].includes(val)) return "warning";
    if (["low", "over", "fragile", "stalled", "disconnected"].includes(val)) return "danger";
    return "default";
  };

  const suggestions = useMemo(() => (data?.suggestions ?? []) as SuggestionItem[], [data]);
  const tasks = useMemo(() => (tasksData ?? []) as TaskItem[], [tasksData]);

  if (!data) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" />
      </View>
    );
  }

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <H1 className="mb-0">Daily View</H1>
          <Caption>{currentDate}</Caption>
        </View>

        {/* System State Row */}
        <GlassCard intensity={30} className="mb-6">
          <View className="flex-row flex-wrap justify-between gap-y-4">
            <StatusBadge label="Load" value={data.state?.load ?? "Balanced"} intent={getStatusIntent(data.state?.load ?? "Balanced")} />
            <StatusBadge label="Momentum" value={data.state?.momentum ?? "Steady"} intent={getStatusIntent(data.state?.momentum ?? "Steady")} />
            <StatusBadge label="Focus" value={data.state?.focusCapacity ?? "Medium"} intent={getStatusIntent(data.state?.focusCapacity ?? "Medium")} />
            <StatusBadge label="Health" value={data.state?.habitHealth ?? "Stable"} intent={getStatusIntent(data.state?.habitHealth ?? "Stable")} />
          </View>
        </GlassCard>

        {/* Suggestions Section - Highlighted */}
        {suggestions.length > 0 && (
          <View className="mb-6">
            <Label className="mb-3 ml-1">Top Suggestions</Label>
            <View className="gap-3">
              {suggestions.slice(0, 2).map((suggestion: SuggestionItem) => (
                <GlassCard key={suggestion._id} variant="highlight" intensity={80}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-4">
                      <H3 className="text-lg mb-1">{suggestion.type.replace(/_/g, " ")}</H3>
                      <Body variant="caption" className="opacity-80">
                        {suggestion.reason?.detail}
                      </Body>
                    </View>
                    <View className="gap-2">
                      {suggestion.type === "PLAN_RESET" && (
                        <Button
                          size="sm"
                          className="bg-primary"
                          onPress={() => applyPlanResetMutation({
                            day: data.day,
                            keepCount: suggestion.payload?.keepCount ?? 1,
                            idempotencyKey: idem(),
                          })}
                        >
                          <Body className="text-white text-xs font-bold">Apply</Body>
                        </Button>
                      )}
                      {suggestion.type === "GENTLE_RETURN" && (
                        <Button
                          size="sm"
                          className="bg-primary"
                          onPress={() => resumeTask(suggestion.payload?.taskId)}
                        >
                          <Body className="text-white text-xs font-bold">Resume</Body>
                        </Button>
                      )}
                    </View>
                  </View>
                </GlassCard>
              ))}
            </View>
          </View>
        )}

        {/* Tasks Section */}
        <View className="mb-6">
          <View className="flex-row justify-between items-end mb-4 px-1">
            <H2 className="mb-0 text-2xl">Tasks</H2>
            <Caption>{tasks.length} active</Caption>
          </View>

          <View className="gap-3 mb-6">
            {tasks.length > 0 ? (
              tasks.map((task: TaskItem) => (
                <GlassCard key={task._id} intensity={40} className="border-white/10">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-4">
                      <Body className="font-semibold text-lg">{task.title}</Body>
                      <Caption>{task.estimateMin} minutes</Caption>
                    </View>
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => completeTask(task._id)}
                      className="rounded-full px-4"
                    >
                      <Body className="text-xs font-bold text-primary">Done</Body>
                    </Button>
                  </View>
                </GlassCard>
              ))
            ) : (
              <GlassCard intensity={20} className="items-center py-6">
                <Caption>No open tasks. Start a tiny win below.</Caption>
              </GlassCard>
            )}
          </View>

          {/* Quick Add Form */}
          <GlassCard intensity={60} className="border-primary/20">
            <Label className="mb-3">Quick Add Task</Label>
            <View className="gap-3">
              <TextField>
                <TextField.Input
                  value={title}
                  onChangeText={setTitle}
                  placeholder="What's next?"
                  className="bg-background/50 rounded-xl"
                />
              </TextField>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField>
                    <TextField.Input
                      value={estimate}
                      onChangeText={setEstimate}
                      placeholder="25"
                      keyboardType="number-pad"
                      className="bg-background/50 rounded-xl"
                    />
                  </TextField>
                </View>
                <Button
                  onPress={createTask}
                  isDisabled={isCreating}
                  className="bg-primary rounded-xl px-10"
                >
                  {isCreating ? <Spinner size="sm" color="white" /> : <Body className="text-white font-bold">Add</Body>}
                </Button>
              </View>
            </View>
          </GlassCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

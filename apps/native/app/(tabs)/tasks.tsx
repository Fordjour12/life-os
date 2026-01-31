import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
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
  const generateNextStepDraftAction = useAction(api.kernel.vexAgents.generateNextStepDraft);

  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [isCreating, setIsCreating] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [nextStepDrafts, setNextStepDrafts] = useState<
    Record<
      string,
      {
        taskId: string;
        step: string;
        estimateMin: number;
        reason: { code: string; detail: string };
      }
    >
  >({});
  const [loadingNextStepId, setLoadingNextStepId] = useState<Id<"tasks"> | null>(null);
  const [applyingNextStepId, setApplyingNextStepId] = useState<Id<"tasks"> | null>(null);

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
    if (!taskId) {
      return;
    }
    await resumeTaskMutation({
      taskId,
      reason: "manual",
      idempotencyKey: idem(),
    });
  };

  const generateNextStep = async (taskId: Id<"tasks">) => {
    setLoadingNextStepId(taskId);
    try {
      const result = await generateNextStepDraftAction({ taskId });
      if (result.status === "success") {
        setNextStepDrafts((prev) => ({
          ...prev,
          [taskId]: result.draft,
        }));
      }
    } finally {
      setLoadingNextStepId(null);
    }
  };

  const applyNextStep = async (taskId: Id<"tasks">) => {
    const draft = nextStepDrafts[taskId];
    if (!draft) return;
    setApplyingNextStepId(taskId);
    try {
      await createTaskMutation({
        title: draft.step,
        estimateMin: draft.estimateMin,
        priority: 2,
        notes: `Next step for ${taskId}`,
        idempotencyKey: idem(),
      });
    } finally {
      setApplyingNextStepId(null);
    }
  };

  if (!tasksData || !pausedTasksData) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="header" size="2xl">
          ALL_TASKS
        </MachineText>
        <MachineText className="text-muted text-xs mt-1">EXECUTION QUEUE MONITOR</MachineText>
      </View>

      <View className="gap-6">
        <HardCard label="CREATE_TASK" className="bg-surface gap-4 p-4">
          <View className="gap-3">
            <View>
              <MachineText variant="label" className="mb-1">
                TASK NAME
              </MachineText>
              <TextField>
                <TextField.Input
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Small, doable task..."
                  className="bg-surface border text-sm font-mono h-10 border-divider"
                  style={{ fontFamily: "Menlo" }}
                />
              </TextField>
            </View>
            <View>
              <MachineText variant="label" className="mb-1">
                ESTIMATE (MIN)
              </MachineText>
              <TextField>
                <TextField.Input
                  value={estimate}
                  onChangeText={setEstimate}
                  placeholder="25"
                  keyboardType="number-pad"
                  className="bg-surface border text-sm font-mono h-10 border-divider"
                  style={{ fontFamily: "Menlo" }}
                />
              </TextField>
            </View>
            <Button
              onPress={createTask}
              isDisabled={isCreating}
              className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
            >
              {isCreating ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-accent-foreground font-bold">ADD_TASK</MachineText>
              )}
            </Button>
          </View>
        </HardCard>

        <View>
          <View className="flex-row justify-between items-end mb-2 border-b border-divider pb-1">
            <MachineText variant="header" size="md">
              ACTIVE_QUEUE
            </MachineText>
            <MachineText className="text-xs">COUNT: {tasks.length}</MachineText>
          </View>

          <View className="gap-3">
            {tasks.length ? (
              tasks.map((task) => {
                const draft = nextStepDrafts[task._id];
                const isLoading = loadingNextStepId === task._id;
                return (
                  <HardCard key={task._id} padding="sm" className="bg-surface">
                    <View className="gap-3">
                      <View className="flex-row items-center justify-between">
                        <View className="gap-1 flex-1">
                          <MachineText className="font-bold text-base">{task.title}</MachineText>
                          <MachineText className="text-muted text-xs">
                            {task.estimateMin} MIN
                          </MachineText>
                        </View>
                        <View className="gap-2 items-end">
                          <Button
                            size="sm"
                            className="bg-surface border border-foreground rounded-none"
                            onPress={() => completeTask(task._id)}
                          >
                            <MachineText className="text-foreground text-xs font-bold">
                              DONE
                            </MachineText>
                          </Button>
                          <Button
                            size="sm"
                            className="bg-foreground rounded-none"
                            onPress={() => generateNextStep(task._id)}
                            isDisabled={isLoading}
                          >
                            {isLoading ? (
                              <Spinner size="sm" color="white" />
                            ) : (
                              <MachineText className="text-background text-[10px]">
                                NEXT_STEP
                              </MachineText>
                            )}
                          </Button>
                        </View>
                      </View>
                      {draft ? (
                        <View className="gap-2 border border-divider p-2 bg-muted">
                          <MachineText variant="label" className="text-accent">
                            AI_NEXT_STEP
                          </MachineText>
                          <MachineText className="text-sm">
                            {draft.step} ({draft.estimateMin} MIN)
                          </MachineText>
                          <MachineText className="text-[10px] text-muted">
                            REASON: {draft.reason.detail}
                          </MachineText>
                          <Button
                            size="sm"
                            onPress={() => applyNextStep(task._id)}
                            isDisabled={applyingNextStepId === task._id}
                            className="bg-foreground rounded-none"
                          >
                            {applyingNextStepId === task._id ? (
                              <Spinner size="sm" color="white" />
                            ) : (
                              <MachineText className="text-background text-[10px]">
                                APPLY_STEP
                              </MachineText>
                            )}
                          </Button>
                        </View>
                      ) : null}
                    </View>
                  </HardCard>
                );
              })
            ) : (
              <HardCard variant="flat" className="p-4 border-dashed items-center">
                <MachineText className="text-muted">QUEUE_EMPTY</MachineText>
              </HardCard>
            )}
          </View>
        </View>

        {pausedTasks.length ? (
          <HardCard label="PARKED_TASKS" variant="flat" className="gap-3 p-4 bg-muted">
            <View className="flex-row items-center justify-between">
              <MachineText className="font-bold">PAUSED_ITEMS ({pausedTasks.length})</MachineText>
              <Button
                size="sm"
                className="bg-surface border border-foreground rounded-none"
                onPress={() => setShowPaused(!showPaused)}
              >
                <MachineText className="text-foreground text-xs">
                  {showPaused ? "HIDE" : "SHOW"}
                </MachineText>
              </Button>
            </View>
            {showPaused ? (
              <View className="gap-2 mt-2">
                {pausedTasks.map((task) => (
                  <HardCard key={task._id} padding="sm" className="bg-surface/70">
                    <View className="flex-row items-center justify-between">
                      <View className="gap-1 flex-1">
                        <MachineText className="font-bold text-sm">{task.title}</MachineText>
                        <MachineText className="text-muted text-[10px]">
                          {task.estimateMin} MIN
                        </MachineText>
                      </View>
                      <Button
                        size="sm"
                        className="bg-foreground rounded-none"
                        onPress={() => resumeTask(task._id)}
                      >
                        <MachineText className="text-background text-[10px]">RESUME</MachineText>
                      </Button>
                    </View>
                  </HardCard>
                ))}
              </View>
            ) : (
              <MachineText className="text-muted text-xs">
                Stored safely until plan reset.
              </MachineText>
            )}
          </HardCard>
        ) : null}
      </View>
    </Container>
  );
}

import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button, Spinner } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { DailyIntentCard } from "@/components/daily-intent-card";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { TodaySkeleton } from "@/components/skeletons/today-skeleton";
import { getTimezoneOffsetMinutes } from "@/lib/date";
import { TaskCard } from "@/components/task-card";

// We'll define a local component for the "Engineering Badge" for now to match the style
function EngBadge({
  label,
  value,
  intent,
}: {
  label: string;
  value: string;
  intent: "success" | "warning" | "danger" | "default";
}) {
  const colorMap = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    default: "bg-foreground",
  };
  const dotColor = colorMap[intent];

  return (
    <View className="items-start min-w-20">
      <MachineText variant="label" className="mb-1 text-[10px]">
        {label}
      </MachineText>
      <View className="flex-row gap-2 border border-divider items-center px-2 py-1 bg-surface">
        <View className={`w-2 h-2 ${dotColor}`} />
        <MachineText className="text-[12px] font-bold">{value.toUpperCase()}</MachineText>
      </View>
    </View>
  );
}

type SuggestionItem = {
  _id: string;
  type: string;
  reason?: { detail?: string };
  payload?: {
    keepCount?: 1 | 2;
    taskId?: Id<"tasks">;
    title?: string;
    estimateMin?: number;
    tinyWin?: {
      kind: "task" | "action";
      taskId?: Id<"tasks">;
      title: string;
      estimateMin: number;
    };
    rest?: { title: string; minutes: number };
    reflection?: { question: string };
  };
};

type TinyWinPayload = NonNullable<SuggestionItem["payload"]>["tinyWin"];

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
  const router = useRouter();
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const data = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
  const tasksData = useQuery(api.kernel.taskQueries.getActiveTasks);
  const createTaskMutation = useMutation(api.kernel.taskCommands.createTask);
  const completeTaskMutation = useMutation(api.kernel.taskCommands.completeTask);
  const applyPlanResetMutation = useMutation(api.kernel.planReset.applyPlanReset);
  const resumeTaskMutation = useMutation(api.kernel.resumeTasks.resumeTask);
  const executeCommandMutation = useMutation(api.kernel.commands.executeCommand);

  const [showReflection, setShowReflection] = useState(false);

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

  const acceptRest = async (minutes: number) => {
    await executeCommandMutation({
      command: {
        cmd: "accept_rest",
        input: { minutes, day: data?.day ?? "" },
        idempotencyKey: idem(),
        tzOffsetMinutes,
      },
    });
  };

  const doTinyWin = async (tinyWin?: TinyWinPayload) => {
    if (!tinyWin) return;
    if (tinyWin.kind === "task" && tinyWin.taskId) {
      await completeTask(tinyWin.taskId);
      return;
    }

    if (tinyWin.kind === "action") {
      const result = await createTaskMutation({
        title: tinyWin.title,
        estimateMin: tinyWin.estimateMin,
        priority: 2,
        idempotencyKey: idem(),
      });
      const createdId = (result as { taskId?: Id<"tasks"> })?.taskId;
      if (createdId) {
        await completeTask(createdId);
      }
    }
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
  const eventSummary = useMemo(
    () =>
      data?.eventSummary ?? {
        habitDone: 0,
        habitMissed: 0,
        expenseAdded: 0,
      },
    [data],
  );
  const plannedMinutes = data?.state?.plannedMinutes ?? 0;
  const completedMinutes = data?.state?.completedMinutes ?? 0;
  const completionPercent =
    plannedMinutes > 0 ? Math.min(100, Math.round((completedMinutes / plannedMinutes) * 100)) : 0;
  const primarySuggestion = suggestions[0] ?? null;
  const secondarySuggestions = suggestions.slice(1, 3);

  if (!data) {
    return <TodaySkeleton />;
  }

  const currentDate = new Date()
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <Container className="pt-8">
      <View className="mb-6 flex-row justify-between items-end border-b-2 border-divider pb-2">
        <View>
          <MachineText variant="label" className="text-accent mb-1">
            SYSTEM://OVERVIEW
          </MachineText>
          <MachineText variant="header" size="2xl">
            TODAY
          </MachineText>
        </View>
        <MachineText variant="value" className="text-sm">
          {currentDate}
        </MachineText>
      </View>

      {/* System State Row */}
      <HardCard className="mb-8" padding="sm" label="KERNEL SYSTEM STATUS">
        <View className="flex-row flex-wrap justify-between gap-y-4 p-2">
          <EngBadge
            label="SYS.LOAD"
            value={data.state?.load ?? "BALANCED"}
            intent={getStatusIntent(data.state?.load ?? "Balanced")}
          />
          <EngBadge
            label="FLUX"
            value={data.state?.momentum ?? "STEADY"}
            intent={getStatusIntent(data.state?.momentum ?? "Steady")}
          />
          <EngBadge
            label="CPU"
            value={data.state?.focusCapacity ?? "MEDIUM"}
            intent={getStatusIntent(data.state?.focusCapacity ?? "Medium")}
          />
          <EngBadge
            label="PWR"
            value={data.state?.habitHealth ?? "STABLE"}
            intent={getStatusIntent(data.state?.habitHealth ?? "Stable")}
          />
        </View>
      </HardCard>

      <HardCard className="mb-8" padding="sm" label="PLAN_PROGRESS">
        <View className="gap-3 p-2">
          <View className="flex-row justify-between items-center">
            <MachineText variant="label" className="text-[10px]">
              COMPLETED
            </MachineText>
            <MachineText variant="value" className="text-sm">
              {completedMinutes} / {plannedMinutes} MIN ({completionPercent}%)
            </MachineText>
          </View>
          <View className="h-2 border border-divider bg-surface">
            <View className="h-full bg-accent" style={{ width: `${completionPercent}%` }} />
          </View>
        </View>
      </HardCard>

      <HardCard className="mb-8" padding="sm" label="TODAY_EVENTS">
        <View className="gap-3 p-2">
          <View className="flex-row justify-between">
            <MachineText variant="label" className="text-[10px]">
              HABITS DONE
            </MachineText>
            <MachineText variant="value" className="text-sm">
              {eventSummary.habitDone}
            </MachineText>
          </View>
          <View className="flex-row justify-between">
            <MachineText variant="label" className="text-[10px]">
              HABITS MISSED
            </MachineText>
            <MachineText variant="value" className="text-sm">
              {eventSummary.habitMissed}
            </MachineText>
          </View>
          <View className="flex-row justify-between">
            <MachineText variant="label" className="text-[10px]">
              EXPENSES
            </MachineText>
            <MachineText variant="value" className="text-sm">
              {eventSummary.expenseAdded}
            </MachineText>
          </View>
        </View>
      </HardCard>

      <DailyIntentCard
        plan={
          (data.plan ?? null) as {
            day: string;
            version: number;
            reason: string;
            focusItems: Array<{
              id: string;
              label: string;
              estimatedMinutes: number;
            }>;
          } | null
        }
        plannedMinutes={data.state?.plannedMinutes ?? null}
        completedMinutes={data.state?.completedMinutes ?? null}
      />

      {primarySuggestion ? (
        <HardCard label="NEXT_BEST_ACTION" className="mb-8 border-accent bg-surface">
          <View className="gap-3 p-2">
            <MachineText className="font-bold text-base">
              {primarySuggestion.type.replace(/_/g, " ")}
            </MachineText>
            <MachineText className="text-xs opacity-70">
              {primarySuggestion.reason?.detail ?? "Small next step with clear reason."}
            </MachineText>
            <View className="flex-row gap-2">
              {primarySuggestion.type === "PLAN_RESET" ? (
                <Button
                  size="sm"
                  className="bg-accent border border-foreground rounded-none"
                  onPress={() =>
                    applyPlanResetMutation({
                      day: data.day,
                      keepCount: primarySuggestion.payload?.keepCount ?? 1,
                      idempotencyKey: idem(),
                      tzOffsetMinutes,
                    })
                  }
                >
                  <MachineText className="text-xs font-bold text-accent-foreground">
                    EXECUTE
                  </MachineText>
                </Button>
              ) : null}
              {primarySuggestion.type === "GENTLE_RETURN" ? (
                <Button
                  size="sm"
                  className="bg-accent border border-foreground rounded-none"
                  onPress={() => resumeTask(primarySuggestion.payload?.taskId)}
                >
                  <MachineText className="text-xs font-bold text-accent-foreground">
                    RESUME
                  </MachineText>
                </Button>
              ) : null}
              {primarySuggestion.type === "MICRO_RECOVERY_PROTOCOL" ? (
                <>
                  <Button
                    size="sm"
                    className="bg-accent border border-foreground rounded-none"
                    onPress={() => doTinyWin(primarySuggestion.payload?.tinyWin)}
                  >
                    <MachineText className="text-xs font-bold text-accent-foreground">
                      DO TINY WIN
                    </MachineText>
                  </Button>
                  <Button
                    size="sm"
                    className="bg-surface border border-foreground rounded-none"
                    onPress={() => acceptRest(primarySuggestion.payload?.rest?.minutes ?? 15)}
                  >
                    <MachineText className="text-xs font-bold text-foreground">REST</MachineText>
                  </Button>
                </>
              ) : null}
            </View>
          </View>
        </HardCard>
      ) : null}

      {/* Suggestions Section - Highlighted */}
      {secondarySuggestions.length > 0 && (
        <View className="mb-8">
          <MachineText variant="label" className="mb-2 text-accent">
            INPUT_SIGNALS ({secondarySuggestions.length})
          </MachineText>
          <View className="gap-3">
            {secondarySuggestions.map((suggestion: SuggestionItem) => (
              <HardCard
                key={suggestion._id}
                variant="default"
                className="border-accent"
                label={`SIG-${suggestion.type}`}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-4">
                    <MachineText className="font-bold text-lg mb-1">
                      {suggestion.type.replace(/_/g, " ")}
                    </MachineText>
                    <MachineText className="text-xs opacity-70">
                      {suggestion.reason?.detail}
                    </MachineText>
                  </View>
                  <View className="gap-2">
                    {suggestion.type === "PLAN_RESET" && (
                      <Button
                        size="sm"
                        className="bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                        onPress={() =>
                          applyPlanResetMutation({
                            day: data.day,
                            keepCount: suggestion.payload?.keepCount ?? 1,
                            idempotencyKey: idem(),
                            tzOffsetMinutes,
                          })
                        }
                      >
                        <MachineText className="text-accent-foreground text-xs font-bold">
                          EXECUTE
                        </MachineText>
                      </Button>
                    )}
                    {suggestion.type === "GENTLE_RETURN" && (
                      <Button
                        size="sm"
                        className="bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                        onPress={() => resumeTask(suggestion.payload?.taskId)}
                      >
                        <MachineText className="text-accent-foreground text-xs font-bold">
                          RESUME
                        </MachineText>
                      </Button>
                    )}
                    {suggestion.type === "MICRO_RECOVERY_PROTOCOL" && (
                      <View className="gap-2">
                        <Button
                          size="sm"
                          className="bg-accent shadow-[2px_2px_0px_var(--color-foreground)] rounded-none border border-foreground"
                          onPress={() => doTinyWin(suggestion.payload?.tinyWin)}
                        >
                          <MachineText className="text-accent-foreground text-xs font-bold">
                            DO TINY WIN
                          </MachineText>
                        </Button>
                        <Button
                          size="sm"
                          className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                          onPress={() => acceptRest(suggestion.payload?.rest?.minutes ?? 15)}
                        >
                          <MachineText className="text-xs font-bold text-foreground">
                            REST
                          </MachineText>
                        </Button>
                        <Button
                          size="sm"
                          className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                          onPress={() => setShowReflection(!showReflection)}
                        >
                          <MachineText className="text-xs font-bold text-foreground">
                            REFLECT
                          </MachineText>
                        </Button>
                      </View>
                    )}
                  </View>
                </View>
                {suggestion.type === "MICRO_RECOVERY_PROTOCOL" && showReflection ? (
                  <View className="mt-3 p-2 bg-muted border-t border-divider">
                    <MachineText className="text-xs italic">
                      {suggestion.payload?.reflection?.question}
                    </MachineText>
                  </View>
                ) : null}
              </HardCard>
            ))}
          </View>
        </View>
      )}

      {/* Tasks Section */}
      <View className="mb-8">
        <View className="flex-row justify-between items-end mb-4 px-1 border-b border-divider pb-2">
          <View>
            <MachineText variant="header" size="lg">
              EXECUTION_QUEUE
            </MachineText>
            <MachineText className="text-[10px] text-foreground/60">
              MARK DONE OR CAPTURE THE NEXT CONCRETE ACTION.
            </MachineText>
          </View>
          <View className="items-end">
            <MachineText className="text-xs">COUNT: {tasks.length}</MachineText>
            {tasks.length > 0 ? (
              <MachineText className="text-[10px] text-foreground/60">
                NEXT: {tasks[0]?.estimateMin ?? 0} MIN
              </MachineText>
            ) : null}
          </View>
        </View>

        <View className="gap-2 mb-6 min-h-25">
          {tasks.length > 0 ? (
            <FlashList
              data={tasks}
              renderItem={({ item, index }) => <TaskCard task={item} index={index} />}
              estimatedItemSize={72}
              keyExtractor={(item) => item._id}
              contentContainerStyle={{ gap: 8 }}
              showsVerticalScrollIndicator={false}
            />
          ) : (
            <HardCard variant="flat" className="items-center py-6 border-dashed">
              <MachineText className="opacity-50">QUEUE_EMPTY</MachineText>
            </HardCard>
          )}
        </View>

        <HardCard label="TASK_CAPTURE" className="bg-surface">
          <View className="gap-3">
            <MachineText className="text-[10px] text-foreground/60">
              USE THE BOTTOM ADD CONTROL TO CAPTURE A TASK.
            </MachineText>
          </View>
        </HardCard>

        <View className="items-end mt-2 mb-4">
          <Button
            onPress={() => router.push("/new-task?estimate=25")}
            className="w-14 h-14 min-w-14 rounded-none bg-foreground border border-foreground shadow-[3px_3px_0px_var(--color-accent)]"
          >
            <Ionicons name="add" size={24} color="white" />
          </Button>
          <MachineText className="text-[10px] mt-1">ADD_TASK</MachineText>
        </View>
      </View>
    </Container>
  );
}

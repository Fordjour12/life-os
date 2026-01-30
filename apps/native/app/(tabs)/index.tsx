import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useState, useMemo } from "react";
import { View, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DailyIntentCard } from "@/components/daily-intent-card";
import { DriftSignalsCard } from "@/components/drift-signals-card";
import { JournalPromptCard } from "@/components/journal-prompt-card";
import { PatternInsightsCard } from "@/components/pattern-insights-card";
import { WeeklyReviewCard } from "@/components/weekly-review-card";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

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
    <View className="items-start min-w-[80px]">
      <MachineText variant="label" className="mb-1 text-[10px]">
        {label}
      </MachineText>
      <View className="flex-row items-center gap-2 border border-divider items-center px-2 py-1 bg-surface">
        <View className={`w-2 h-2 ${dotColor}`} />
        <MachineText className="text-[12px] font-bold">
          {value.toUpperCase()}
        </MachineText>
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

type JournalMood = "low" | "neutral" | "ok" | "good";

type JournalPromptReason =
  | "quiet"
  | "reflection"
  | "recovery"
  | "plan_reset"
  | "micro_recovery"
  | null;

const allowedJournalReasons = new Set([
  "quiet",
  "reflection",
  "recovery",
  "plan_reset",
  "micro_recovery",
]);

function normalizeJournalReason(value: unknown): JournalPromptReason {
  if (typeof value !== "string") return null;
  return allowedJournalReasons.has(value)
    ? (value as JournalPromptReason)
    : null;
}

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Today() {
  const data = useQuery(api.kernel.commands.getToday);
  const tasksData = useQuery(api.kernel.taskQueries.getActiveTasks);
  const createTaskMutation = useMutation(api.kernel.taskCommands.createTask);
  const completeTaskMutation = useMutation(
    api.kernel.taskCommands.completeTask,
  );
  const applyPlanResetMutation = useMutation(
    api.kernel.planReset.applyPlanReset,
  );
  const resumeTaskMutation = useMutation(api.kernel.resumeTasks.resumeTask);
  const executeCommandMutation = useMutation(
    api.kernel.commands.executeCommand,
  );
  const weeklyReview = useQuery(api.identity.weeklyReview.getWeeklyReview, {});
  const generateWeeklyReviewMutation = useMutation(
    api.identity.weeklyReview.generateWeeklyReview,
  );
  const patternInsights = useQuery(api.identity.getPatternInsights, {
    window: "week",
  });
  const driftSignals = useQuery(api.identity.getDriftSignals, {
    window: "month",
  });
  const journalPrompt = useQuery(
    api.identity.getJournalPrompt,
    data ? { day: data.day } : "skip",
  );
  const createJournalEntryMutation = useMutation(
    api.identity.createJournalEntry,
  );
  const journalEntries = useQuery(
    api.identity.getJournalEntriesForDay,
    data ? { day: data.day } : "skip",
  );
  const createJournalSkipMutation = useMutation(api.identity.createJournalSkip);

  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [isCreating, setIsCreating] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [isGeneratingWeeklyReview, setIsGeneratingWeeklyReview] =
    useState(false);
  const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);
  const [isSkippingJournal, setIsSkippingJournal] = useState(false);

  const createTask = async () => {
    const trimmedTitle = title.trim();
    const estimateMin = Number.parseInt(estimate, 10);
    if (!trimmedTitle || !Number.isFinite(estimateMin) || estimateMin <= 0)
      return;

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

  const acceptRest = async (minutes: number) => {
    await executeCommandMutation({
      command: {
        cmd: "accept_rest",
        input: { minutes, day: data?.day ?? "" },
        idempotencyKey: idem(),
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

  const generateWeeklyReview = async () => {
    setIsGeneratingWeeklyReview(true);
    try {
      await generateWeeklyReviewMutation({});
    } finally {
      setIsGeneratingWeeklyReview(false);
    }
  };

  const submitJournalEntry = async (input: {
    day: string;
    text?: string;
    mood?: JournalMood;
  }) => {
    setIsSubmittingJournal(true);
    try {
      await createJournalEntryMutation(input);
    } finally {
      setIsSubmittingJournal(false);
    }
  };

  const skipJournal = async (day: string) => {
    setIsSkippingJournal(true);
    try {
      await createJournalSkipMutation({ day });
    } finally {
      setIsSkippingJournal(false);
    }
  };

  const getStatusIntent = (
    value: string,
  ): "success" | "warning" | "danger" | "default" => {
    const val = value?.toLowerCase();
    if (["high", "balanced", "strong", "operational"].includes(val))
      return "success";
    if (["medium", "steady", "stable"].includes(val)) return "warning";
    if (["low", "over", "fragile", "stalled", "disconnected"].includes(val))
      return "danger";
    return "default";
  };

  const suggestions = useMemo(
    () => (data?.suggestions ?? []) as SuggestionItem[],
    [data],
  );
  const tasks = useMemo(() => (tasksData ?? []) as TaskItem[], [tasksData]);

  if (!data) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  const currentDate = new Date()
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
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

        {weeklyReview && (
          <WeeklyReviewCard
            review={weeklyReview ?? null}
            onGenerate={generateWeeklyReview}
            isGenerating={isGeneratingWeeklyReview}
          />
        )}

        {patternInsights !== undefined ? (
          <PatternInsightsCard
            insights={patternInsights ?? null}
            windowLabel="WEEK_WINDOW"
          />
        ) : null}

        {driftSignals !== undefined ? (
          <DriftSignalsCard
            signals={driftSignals ?? null}
            windowLabel="MONTH_WINDOW"
          />
        ) : null}

        {journalPrompt !== undefined ? (
          <JournalPromptCard
            day={data.day}
            prompt={journalPrompt?.prompt ?? null}
            quiet={journalPrompt?.quiet}
            reason={normalizeJournalReason(journalPrompt?.reason)}
            onSubmit={submitJournalEntry}
            onSkip={skipJournal}
            entries={
              (journalEntries ?? []) as Array<{
                _id: string;
                text?: string;
                mood?: JournalMood;
                createdAt: number;
              }>
            }
            isSkipping={isSkippingJournal}
            isSubmitting={isSubmittingJournal}
          />
        ) : null}

        {/* Suggestions Section - Highlighted */}
        {suggestions.length > 0 && (
          <View className="mb-8">
            <MachineText variant="label" className="mb-2 text-accent">
              INPUT_SIGNALS ({suggestions.length})
            </MachineText>
            <View className="gap-3">
              {suggestions.slice(0, 2).map((suggestion: SuggestionItem) => (
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
                            onPress={() =>
                              doTinyWin(suggestion.payload?.tinyWin)
                            }
                          >
                            <MachineText className="text-accent-foreground text-xs font-bold">
                              DO TINY WIN
                            </MachineText>
                          </Button>
                          <Button
                            size="sm"
                            className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                            onPress={() =>
                              acceptRest(
                                suggestion.payload?.rest?.minutes ?? 15,
                              )
                            }
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
                  {suggestion.type === "MICRO_RECOVERY_PROTOCOL" &&
                  showReflection ? (
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
            <MachineText variant="header" size="lg">
              EXECUTION_QUEUE
            </MachineText>
            <MachineText className="text-xs">COUNT: {tasks.length}</MachineText>
          </View>

          <View className="gap-2 mb-6">
            {tasks.length > 0 ? (
              tasks.map((task: TaskItem, index) => (
                <HardCard key={task._id} padding="sm" className="bg-surface">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3 flex-1">
                      <MachineText
                        variant="label"
                        className="w-4 text-center text-foreground/30"
                      >
                        {index + 1}
                      </MachineText>
                      <View>
                        <MachineText className="font-bold text-base">
                          {task.title}
                        </MachineText>
                        <MachineText className="text-xs opacity-50">
                          {task.estimateMin} MIN
                        </MachineText>
                      </View>
                    </View>
                    <Button
                      size="sm"
                      onPress={() => completeTask(task._id)}
                      className="border border-divider bg-muted shadow-[2px_2px_0px_var(--color-foreground)]"
                    >
                      <MachineText className="text-[10px] font-bold text-foreground">
                        DONE
                      </MachineText>
                    </Button>
                  </View>
                </HardCard>
              ))
            ) : (
              <HardCard
                variant="flat"
                className="items-center py-6 border-dashed"
              >
                <MachineText className="opacity-50">QUEUE_EMPTY</MachineText>
              </HardCard>
            )}
          </View>

          {/* Quick Add Form */}
        <HardCard label="CMD_LINE_INPUT" className="bg-surface">
          <View className="gap-3">
            <View className="bg-surface border border-divider p-1">
              <TextField>
                <TextField.Input
                  value={title}
                  onChangeText={setTitle}
                  placeholder="> TYPE_TASK_NAME..."
                  className="font-mono text-sm h-8"
                  style={{ fontFamily: "Menlo", fontSize: 14 }}
                />
              </TextField>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1 bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={estimate}
                    onChangeText={setEstimate}
                    placeholder="MIN"
                    keyboardType="number-pad"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
              <Button
                onPress={createTask}
                isDisabled={isCreating}
                className="bg-foreground px-6 shadow-[2px_2px_0px_var(--color-accent)]"
              >
                {isCreating ? (
                  <Spinner size="sm" color="white" />
                ) : (
                  <MachineText className="text-background font-bold">
                    ENTER
                  </MachineText>
                )}
              </Button>
            </View>
          </View>
        </HardCard>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

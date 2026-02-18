import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { DailyIntentCard } from "@/components/daily-intent-card";
import { JournalPromptCard } from "@/components/journal-prompt-card";
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
  return allowedJournalReasons.has(value) ? (value as JournalPromptReason) : null;
}

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function Today() {
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const data = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
  const tasksData = useQuery(api.kernel.taskQueries.getActiveTasks);
  const createTaskMutation = useMutation(api.kernel.taskCommands.createTask);
  const completeTaskMutation = useMutation(api.kernel.taskCommands.completeTask);
  const applyPlanResetMutation = useMutation(api.kernel.planReset.applyPlanReset);
  const resumeTaskMutation = useMutation(api.kernel.resumeTasks.resumeTask);
  const executeCommandMutation = useMutation(api.kernel.commands.executeCommand);
  const generateJournalPromptDraft = useAction(api.kernel.vexAgents.generateJournalPromptDraft);
  const createJournalEntryMutation = useMutation(api.identity.createJournalEntry);
  const journalEntries = useQuery(
    api.identity.getJournalEntriesForDay,
    data ? { day: data.day } : "skip",
  );
  const createJournalSkipMutation = useMutation(api.identity.createJournalSkip);

  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [isCreating, setIsCreating] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [journalDraft, setJournalDraft] = useState<{
    day: string;
    prompt: string | null;
    reason: { code: string; detail: string } | null;
    quiet: boolean;
  } | null>(null);
  const [isLoadingJournalDraft, setIsLoadingJournalDraft] = useState(false);
  const [isRegeneratingJournalDraft, setIsRegeneratingJournalDraft] = useState(false);
  const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);
  const [isSkippingJournal, setIsSkippingJournal] = useState(false);
  const trimmedTitle = title.trim();
  const parsedEstimate = Number.parseInt(estimate, 10);
  const isEstimateValid =
    Number.isFinite(parsedEstimate) && parsedEstimate >= 5 && parsedEstimate <= 480;
  const canCreateTask = trimmedTitle.length > 0 && isEstimateValid && !isCreating;

  const createTask = async () => {
    if (!canCreateTask) return;

    setIsCreating(true);
    try {
      await createTaskMutation({
        title: trimmedTitle,
        estimateMin: parsedEstimate,
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

  const submitJournalEntry = async (input: { day: string; text?: string; mood?: JournalMood }) => {
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

  const getStatusIntent = (value: string): "success" | "warning" | "danger" | "default" => {
    const val = value?.toLowerCase();
    if (["high", "balanced", "strong", "operational"].includes(val)) return "success";
    if (["medium", "steady", "stable"].includes(val)) return "warning";
    if (["low", "over", "fragile", "stalled", "disconnected"].includes(val)) return "danger";
    return "default";
  };

  const suggestions = useMemo(() => (data?.suggestions ?? []) as SuggestionItem[], [data]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setIsLoadingJournalDraft(true);
    generateJournalPromptDraft({ day: data.day })
      .then((result) => {
        if (cancelled) return;
        if (result.status === "success") {
          setJournalDraft(result.draft);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingJournalDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, generateJournalPromptDraft]);

  const regenerateJournalPrompt = async () => {
    if (!data) return;
    setIsRegeneratingJournalDraft(true);
    try {
      const result = await generateJournalPromptDraft({ day: data.day });
      if (result.status === "success") {
        setJournalDraft(result.draft);
      }
    } finally {
      setIsRegeneratingJournalDraft(false);
    }
  };

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

      {isLoadingJournalDraft && !journalDraft ? (
        <HardCard label="REFLECTION_MODULE" className="mb-6 bg-surface">
          <View className="p-4 items-center">
            <Spinner size="sm" color="warning" />
          </View>
        </HardCard>
      ) : journalDraft ? (
        <JournalPromptCard
          day={data.day}
          prompt={journalDraft.prompt}
          quiet={journalDraft.quiet}
          reason={normalizeJournalReason(journalDraft.reason?.code)}
          onSubmit={submitJournalEntry}
          onSkip={skipJournal}
          onRegenerate={regenerateJournalPrompt}
          isRegenerating={isRegeneratingJournalDraft}
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

        {/* Quick Add Form */}
        <HardCard label="CMD_LINE_INPUT" className="bg-surface">
          <View className="gap-3">
            <View className="bg-surface border border-divider p-1">
              <TextField>
                <TextField.Input
                  value={title}
                  onChangeText={setTitle}
                  placeholder="> TYPE_TASK_NAME..."
                  className="font-mono text-sm"
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
                    className="font-mono text-sm"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
              <Button
                onPress={createTask}
                isDisabled={!canCreateTask}
                className="bg-foreground px-6 shadow-[2px_2px_0px_var(--color-accent)]"
              >
                {isCreating ? (
                  <Spinner size="sm" color="white" />
                ) : (
                  <MachineText className="text-background font-bold">ENTER</MachineText>
                )}
              </Button>
            </View>

            <View className="flex-row gap-2">
              {[10, 25, 45].map((minutes) => (
                <Button
                  key={minutes}
                  size="sm"
                  onPress={() => setEstimate(String(minutes))}
                  className={`border border-foreground rounded-none ${
                    estimate === String(minutes) ? "bg-accent" : "bg-surface"
                  }`}
                >
                  <MachineText
                    className={`text-xs font-bold ${
                      estimate === String(minutes) ? "text-accent-foreground" : "text-foreground"
                    }`}
                  >
                    {minutes} MIN
                  </MachineText>
                </Button>
              ))}
            </View>

            {trimmedTitle.length > 0 ? (
              <View className="border border-divider bg-muted px-2 py-2">
                <MachineText className="text-[10px] text-foreground/70">WILL ADD:</MachineText>
                <MachineText className="text-xs font-bold">
                  {trimmedTitle} ({estimate || "?"} MIN)
                </MachineText>
              </View>
            ) : (
              <MachineText className="text-[10px] text-foreground/60">
                TIP: Keep tasks concrete, e.g. "Send invoice draft", "10 min walk".
              </MachineText>
            )}

            {!isEstimateValid && estimate.length > 0 ? (
              <MachineText className="text-[10px] text-danger">
                ESTIMATE MUST BE BETWEEN 5 AND 480 MINUTES.
              </MachineText>
            ) : null}
          </View>
        </HardCard>
      </View>
    </Container>
  );
}

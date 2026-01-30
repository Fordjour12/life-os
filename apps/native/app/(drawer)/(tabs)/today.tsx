import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useState, useMemo } from "react";
import { View, ScrollView } from "react-native";

import { JournalPromptCard } from "@/components/journal-prompt-card";
import { WeeklyReviewCard } from "@/components/weekly-review-card";
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
  const executeCommandMutation = useMutation(api.kernel.commands.executeCommand);
  const weeklyReview = useQuery(api.identity.weeklyReview.getWeeklyReview, {});
  const generateWeeklyReviewMutation = useMutation(api.identity.weeklyReview.generateWeeklyReview);
  const journalPrompt = useQuery(
    api.identity.getJournalPrompt,
    data ? { day: data.day } : "skip",
  );
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
  const [isGeneratingWeeklyReview, setIsGeneratingWeeklyReview] = useState(false);
  const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);
  const [isSkippingJournal, setIsSkippingJournal] = useState(false);

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
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        className="flex-1 bg-background"
      >
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

        <WeeklyReviewCard
          review={weeklyReview ?? null}
          onGenerate={generateWeeklyReview}
          isGenerating={isGeneratingWeeklyReview}
        />

        <JournalPromptCard
          day={data.day}
          prompt={journalPrompt?.prompt ?? null}
          quiet={journalPrompt?.quiet}
          onSubmit={submitJournalEntry}
          onSkip={skipJournal}
          entries={(journalEntries ?? []) as Array<{
            _id: string;
            text?: string;
            mood?: JournalMood;
            createdAt: number;
          }>}
          isSkipping={isSkippingJournal}
          isSubmitting={isSubmittingJournal}
        />

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
                      {suggestion.type === "MICRO_RECOVERY_PROTOCOL" && (
                        <View className="gap-2">
                          <Button
                            size="sm"
                            className="bg-primary"
                            onPress={() => doTinyWin(suggestion.payload?.tinyWin)}
                          >
                            <Body className="text-white text-xs font-bold">Do tiny win</Body>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() =>
                              acceptRest(suggestion.payload?.rest?.minutes ?? 15)
                            }
                          >
                            <Body className="text-xs font-bold">Take short rest</Body>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() => setShowReflection(!showReflection)}
                          >
                            <Body className="text-xs font-bold">Answer reflection</Body>
                          </Button>
                        </View>
                      )}
                    </View>
                  </View>
                  {suggestion.type === "MICRO_RECOVERY_PROTOCOL" && showReflection ? (
                    <Body variant="caption" className="mt-3 opacity-80">
                      {suggestion.payload?.reflection?.question}
                    </Body>
                  ) : null}
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
                      variant="secondary"
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
  );
}

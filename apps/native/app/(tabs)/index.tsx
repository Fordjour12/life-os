import { api } from "@life-os/backend/convex/_generated/api";
import type { Id } from "@life-os/backend/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";

import { DailyIntentCard } from "@/components/daily-intent-card";
import { DriftSignalsCard } from "@/components/drift-signals-card";
import { JournalPromptCard } from "@/components/journal-prompt-card";
import { PatternInsightsCard } from "@/components/pattern-insights-card";
import { WeeklyReviewCard } from "@/components/weekly-review-card";
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
  const weeklyReview = useQuery(api.identity.weeklyReview.getWeeklyReview, {});
  const generateWeeklyReviewMutation = useMutation(api.identity.weeklyReview.generateWeeklyReview);
  const patternInsights = useQuery(api.identity.getPatternInsights, {
    window: "week",
  });
  const driftSignals = useQuery(api.identity.getDriftSignals, {
    window: "month",
  });
  const generateWeeklyReviewDraft = useAction(api.kernel.vexAgents.generateWeeklyReviewDraft);
  const generateJournalPromptDraft = useAction(api.kernel.vexAgents.generateJournalPromptDraft);
  const generateRecoveryProtocolDraft = useAction(
    api.kernel.vexAgents.generateRecoveryProtocolDraft,
  );
  const createJournalEntryMutation = useMutation(api.identity.createJournalEntry);
  const journalEntries = useQuery(
    api.identity.getJournalEntriesForDay,
    data ? { day: data.day } : "skip",
  );
  const createJournalSkipMutation = useMutation(api.identity.createJournalSkip);

  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState("25");
  const [habitId, setHabitId] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoggingHabit, setIsLoggingHabit] = useState(false);
  const [isLoggingExpense, setIsLoggingExpense] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [journalDraft, setJournalDraft] = useState<{
    day: string;
    prompt: string | null;
    reason: { code: string; detail: string } | null;
    quiet: boolean;
  } | null>(null);
  const [isLoadingJournalDraft, setIsLoadingJournalDraft] = useState(false);
  const [isRegeneratingJournalDraft, setIsRegeneratingJournalDraft] = useState(false);
  const [recoveryDraft, setRecoveryDraft] = useState<{
    day: string;
    title: string;
    steps: string[];
    minutes: number;
    reason: { code: string; detail: string };
  } | null>(null);
  const [isLoadingRecoveryDraft, setIsLoadingRecoveryDraft] = useState(false);
  const [weeklyDraft, setWeeklyDraft] = useState<{
    highlights: string[];
    frictionPoints: string[];
    reflectionQuestion: string;
    narrative: string;
    reason: { code: string; detail: string };
    week: string;
  } | null>(null);
  const [isLoadingWeeklyDraft, setIsLoadingWeeklyDraft] = useState(false);
  const [isGeneratingWeeklyReview, setIsGeneratingWeeklyReview] = useState(false);
  const [isSubmittingJournal, setIsSubmittingJournal] = useState(false);
  const [isSkippingJournal, setIsSkippingJournal] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [eventFilter, setEventFilter] = useState<"all" | "habits" | "expenses">("all");

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
        tzOffsetMinutes,
      },
    });
  };

  const logHabit = async (status: "done" | "missed") => {
    const trimmedHabitId = habitId.trim();
    if (!trimmedHabitId) return;
    setIsLoggingHabit(true);
    try {
      await executeCommandMutation({
        command: {
          cmd: "log_habit",
          input: { habitId: trimmedHabitId, status },
          idempotencyKey: idem(),
          tzOffsetMinutes,
        },
      });
      setHabitId("");
    } finally {
      setIsLoggingHabit(false);
    }
  };

  const logExpense = async () => {
    const amount = Number(expenseAmount);
    const category = expenseCategory.trim();
    if (!Number.isFinite(amount) || amount <= 0 || !category) return;
    setIsLoggingExpense(true);
    try {
      await executeCommandMutation({
        command: {
          cmd: "add_expense",
          input: { amount, category },
          idempotencyKey: idem(),
          tzOffsetMinutes,
        },
      });
      setExpenseAmount("");
      setExpenseCategory("");
    } finally {
      setIsLoggingExpense(false);
    }
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

  const formatEventTime = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  const formatEventLabel = (event: { type: string; meta?: Record<string, unknown> }) => {
    if (event.type === "HABIT_DONE") return "Habit done";
    if (event.type === "HABIT_MISSED") return "Habit missed";
    if (event.type === "EXPENSE_ADDED") {
      const amount = Number(event.meta?.amount ?? 0);
      const category = String(event.meta?.category ?? "").trim();
      if (Number.isFinite(amount) && amount > 0 && category) {
        return `Expense $${amount} (${category})`;
      }
      if (Number.isFinite(amount) && amount > 0) {
        return `Expense $${amount}`;
      }
      return "Expense added";
    }
    return "Event";
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

  useEffect(() => {
    if (!weeklyReview?.week) return;
    let cancelled = false;
    setIsLoadingWeeklyDraft(true);
    generateWeeklyReviewDraft({ week: weeklyReview.week })
      .then((result) => {
        if (cancelled) return;
        if (result.status === "success") {
          setWeeklyDraft({ ...result.draft, week: result.week });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWeeklyDraft(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generateWeeklyReviewDraft, weeklyReview?.week]);

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

  const loadRecoveryProtocol = async () => {
    if (!data) return;
    setIsLoadingRecoveryDraft(true);
    try {
      const result = await generateRecoveryProtocolDraft({
        day: data.day,
        tzOffsetMinutes,
      });
      if (result.status === "success") {
        setRecoveryDraft(result.draft);
      }
    } finally {
      setIsLoadingRecoveryDraft(false);
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
  const todayEvents = useMemo(
    () =>
      (data?.dailyEvents ?? []) as Array<{
        type: string;
        ts: number;
        meta?: Record<string, unknown>;
      }>,
    [data],
  );
  const filteredEvents = useMemo(() => {
    if (eventFilter === "habits") {
      return todayEvents.filter(
        (event) => event.type === "HABIT_DONE" || event.type === "HABIT_MISSED",
      );
    }
    if (eventFilter === "expenses") {
      return todayEvents.filter((event) => event.type === "EXPENSE_ADDED");
    }
    return todayEvents;
  }, [eventFilter, todayEvents]);

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

      <HardCard className="mb-8" padding="sm" label="TODAY EVENTS">
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

          <View className="flex-row gap-2 pt-1">
            <Button
              size="sm"
              className={`border border-foreground rounded-none ${
                eventFilter === "all" ? "bg-accent" : "bg-surface"
              }`}
              onPress={() => setEventFilter("all")}
            >
              <MachineText
                className={`text-xs font-bold ${
                  eventFilter === "all" ? "text-accent-foreground" : "text-foreground"
                }`}
              >
                ALL
              </MachineText>
            </Button>
            <Button
              size="sm"
              className={`border border-foreground rounded-none ${
                eventFilter === "habits" ? "bg-accent" : "bg-surface"
              }`}
              onPress={() => setEventFilter("habits")}
            >
              <MachineText
                className={`text-xs font-bold ${
                  eventFilter === "habits" ? "text-accent-foreground" : "text-foreground"
                }`}
              >
                HABITS
              </MachineText>
            </Button>
            <Button
              size="sm"
              className={`border border-foreground rounded-none ${
                eventFilter === "expenses" ? "bg-accent" : "bg-surface"
              }`}
              onPress={() => setEventFilter("expenses")}
            >
              <MachineText
                className={`text-xs font-bold ${
                  eventFilter === "expenses" ? "text-accent-foreground" : "text-foreground"
                }`}
              >
                EXPENSES
              </MachineText>
            </Button>
          </View>

          {filteredEvents.length > 0 ? (
            <View className="gap-2 pt-2">
              {(showAllEvents ? filteredEvents : filteredEvents.slice(0, 3)).map((event, index) => (
                <View
                  key={`${event.type}-${event.ts}-${index}`}
                  className="flex-row justify-between"
                >
                  <MachineText variant="label" className="text-[10px] text-foreground/70">
                    {formatEventLabel(event)}
                  </MachineText>
                  <MachineText variant="value" className="text-xs">
                    {formatEventTime(event.ts)}
                  </MachineText>
                </View>
              ))}
              {filteredEvents.length > 3 ? (
                <Button
                  size="sm"
                  className="self-start bg-surface border border-foreground rounded-none"
                  onPress={() => setShowAllEvents((value) => !value)}
                >
                  <MachineText className="text-xs font-bold text-foreground">
                    {showAllEvents ? "SHOW LESS" : "SHOW ALL"}
                  </MachineText>
                </Button>
              ) : null}
            </View>
          ) : (
            <MachineText variant="label" className="pt-2 text-[10px] text-foreground/60">
              No events in this filter yet today.
            </MachineText>
          )}
        </View>
      </HardCard>

      <HardCard className="mb-8" padding="sm" label="QUICK LOG">
        <View className="gap-4 p-2">
          <View className="gap-2">
            <MachineText variant="label" className="text-[10px]">
              HABIT ID
            </MachineText>
            <TextField>
              <TextField.Input
                value={habitId}
                onChangeText={setHabitId}
                placeholder="habit-id"
                className="font-mono text-sm text-foreground bg-surface border-b border-divider py-2 h-10"
                style={{ fontFamily: "Menlo" }}
              />
            </TextField>
            <View className="flex-row gap-2">
              <Button
                size="sm"
                className="bg-accent border border-foreground rounded-none"
                onPress={() => logHabit("done")}
                isDisabled={isLoggingHabit || !habitId.trim()}
              >
                <MachineText className="text-xs font-bold text-accent-foreground">DONE</MachineText>
              </Button>
              <Button
                size="sm"
                className="bg-surface border border-foreground rounded-none"
                onPress={() => logHabit("missed")}
                isDisabled={isLoggingHabit || !habitId.trim()}
              >
                <MachineText className="text-xs font-bold text-foreground">MISSED</MachineText>
              </Button>
            </View>
          </View>

          <View className="gap-2">
            <MachineText variant="label" className="text-[10px]">
              EXPENSE
            </MachineText>
            <View className="flex-row gap-2">
              <TextField className="flex-1">
                <TextField.Input
                  value={expenseAmount}
                  onChangeText={setExpenseAmount}
                  placeholder="$"
                  keyboardType="numeric"
                  className="font-mono text-sm text-foreground bg-surface border-b border-divider py-2 h-10"
                  style={{ fontFamily: "Menlo" }}
                />
              </TextField>
              <TextField className="flex-[2]">
                <TextField.Input
                  value={expenseCategory}
                  onChangeText={setExpenseCategory}
                  placeholder="category"
                  className="font-mono text-sm text-foreground bg-surface border-b border-divider py-2 h-10"
                  style={{ fontFamily: "Menlo" }}
                />
              </TextField>
            </View>
            <Button
              size="sm"
              className="bg-accent border border-foreground rounded-none self-start"
              onPress={logExpense}
              isDisabled={
                isLoggingExpense ||
                !expenseCategory.trim() ||
                !Number.isFinite(Number(expenseAmount)) ||
                Number(expenseAmount) <= 0
              }
            >
              <MachineText className="text-xs font-bold text-accent-foreground">
                ADD EXPENSE
              </MachineText>
            </Button>
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

      {weeklyReview && (
        <WeeklyReviewCard
          review={weeklyReview ?? null}
          onGenerate={generateWeeklyReview}
          isGenerating={isGeneratingWeeklyReview}
        />
      )}

      {weeklyReview ? (
        <HardCard label="AI_NARRATIVE" className="mb-6 bg-surface">
          <View className="p-2 gap-3">
            <MachineText variant="label" className="text-accent">
              WEEKLY_AI_SUMMARY
            </MachineText>
            {weeklyDraft ? (
              <View className="gap-2">
                <MachineText className="text-sm">{weeklyDraft.narrative}</MachineText>
                <MachineText className="text-[10px] text-muted">
                  REASON: {weeklyDraft.reason.detail}
                </MachineText>
              </View>
            ) : isLoadingWeeklyDraft ? (
              <Spinner size="sm" color="warning" />
            ) : (
              <MachineText className="text-sm">NO_AI_DRAFT_YET.</MachineText>
            )}
          </View>
        </HardCard>
      ) : null}

      {patternInsights !== undefined ? (
        <PatternInsightsCard insights={patternInsights ?? null} windowLabel="WEEK_WINDOW" />
      ) : null}

      {driftSignals !== undefined ? (
        <DriftSignalsCard signals={driftSignals ?? null} windowLabel="MONTH_WINDOW" />
      ) : null}

      {data?.state?.mode === "recovery" ? (
        <HardCard label="RECOVERY_PROTOCOL" className="mb-6 bg-surface">
          <View className="p-2 gap-3">
            <MachineText variant="label" className="text-accent">
              RECOVERY_MODE_ACTIVE
            </MachineText>
            {recoveryDraft ? (
              <View className="gap-2">
                <MachineText className="text-lg font-bold">{recoveryDraft.title}</MachineText>
                <View className="gap-1">
                  {recoveryDraft.steps.map((step, index) => (
                    <MachineText key={`${step}-${index}`} className="text-sm">
                      {index + 1}. {step}
                    </MachineText>
                  ))}
                </View>
                <MachineText className="text-[10px] text-muted">
                  REASON: {recoveryDraft.reason.detail}
                </MachineText>
              </View>
            ) : (
              <MachineText className="text-sm">NO_RECOVERY_DRAFT_YET.</MachineText>
            )}
            <Button
              size="sm"
              onPress={loadRecoveryProtocol}
              isDisabled={isLoadingRecoveryDraft}
              className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
            >
              {isLoadingRecoveryDraft ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-background font-bold">GENERATE_PROTOCOL</MachineText>
              )}
            </Button>
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
          <MachineText variant="header" size="lg">
            EXECUTION_QUEUE
          </MachineText>
          <MachineText className="text-xs">COUNT: {tasks.length}</MachineText>
        </View>

        <View className="gap-2 mb-6 min-h-[100px]">
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
                isDisabled={isCreating}
                className="bg-foreground px-6 shadow-[2px_2px_0px_var(--color-accent)]"
              >
                {isCreating ? (
                  <Spinner size="sm" color="white" />
                ) : (
                  <MachineText className="text-background font-bold">ENTER</MachineText>
                )}
              </Button>
            </View>
          </View>
        </HardCard>
      </View>
    </Container>
  );
}

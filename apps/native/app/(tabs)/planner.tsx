import { api } from "@life-os/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { PlannerSkeleton } from "@/components/skeletons/planner-skeleton";
import { SuggestionInbox } from "@/components/suggestion-inbox";
import { getTimezoneOffsetMinutes } from "@/lib/date";

type PlanItem = {
  id: string;
  label: string;
  estimatedMinutes: number;
};

type DraftItem = {
  id: string;
  label: string;
  estimatedMinutes: string;
};

type PlanData = {
  day: string;
  version: number;
  reason: "initial" | "adjust" | "reset" | "recovery" | "return";
  focusItems: PlanItem[];
};

type DailyPlanDraft = {
  day: string;
  focusItems: PlanItem[];
  reason: { code: string; detail: string };
};

type DailyPlanDraftResult = {
  status: "success";
  source: "ai" | "fallback";
  draft: DailyPlanDraft;
};

type PlannerState = "NO_PLAN" | "PLANNED_OK" | "OVERLOADED" | "STALLED" | "RECOVERY" | "RETURNING";

const allowedEstimates = [10, 25, 45, 60];

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function normalizeEstimate(value: number) {
  if (!Number.isFinite(value)) return 25;
  return allowedEstimates.reduce((closest, estimate) =>
    Math.abs(estimate - value) < Math.abs(closest - value) ? estimate : closest,
  );
}

function formatMinutes(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} MIN`;
}

function toLabel(value?: string | null) {
  if (!value) return "UNKNOWN";
  return String(value).replace(/_/g, " ").toUpperCase();
}

function createEmptyDraft(): DraftItem[] {
  return Array.from({ length: 3 }).map((_, index) => ({
    id: `focus-${Date.now()}-${index}`,
    label: "",
    estimatedMinutes: "25",
  }));
}

function toDraftItems(items: PlanItem[]): DraftItem[] {
  const filled = items.map((item) => ({
    id: item.id,
    label: item.label,
    estimatedMinutes: String(item.estimatedMinutes),
  }));
  while (filled.length < 3) {
    filled.push({
      id: `focus-${Date.now()}-${filled.length}`,
      label: "",
      estimatedMinutes: "25",
    });
  }
  return filled.slice(0, 3);
}

export default function Planner() {
  const tzOffsetMinutes = getTimezoneOffsetMinutes();
  const data = useQuery(api.kernel.commands.getToday, { tzOffsetMinutes });
  const execute = useMutation(api.kernel.commands.executeCommand);
  const generateDailyPlanDraftAction = useAction(api.kernel.vexAgents.generateDailyPlanDraft);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(() => createEmptyDraft());
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nextStepIndex, setNextStepIndex] = useState(0);
  const [nextStepMinutes, setNextStepMinutes] = useState(10);
  const [showNextStep, setShowNextStep] = useState(false);
  const [aiPlanDraft, setAiPlanDraft] = useState<DailyPlanDraft | null>(null);
  const [aiPlanSource, setAiPlanSource] = useState<"ai" | "fallback" | null>(null);
  const [isGeneratingAiPlan, setIsGeneratingAiPlan] = useState(false);
  const [isApplyingAiPlan, setIsApplyingAiPlan] = useState(false);

  const plan = (data?.plan ?? null) as PlanData | null;
  const plannerState = (data?.plannerState ?? "NO_PLAN") as PlannerState;
  const lifeState = data?.state ?? null;
  const eventSummary = data?.eventSummary ?? {
    habitDone: 0,
    habitMissed: 0,
    expenseAdded: 0,
  };
  const totalMinutes = plan
    ? plan.focusItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)
    : 0;
  const freeMinutes = typeof lifeState?.freeMinutes === "number" ? lifeState.freeMinutes : undefined;
  const completionRate = typeof lifeState?.completionRate === "number" ? lifeState.completionRate : undefined;
  const backlogPressure =
    typeof lifeState?.backlogPressure === "number" ? lifeState.backlogPressure : undefined;
  const planQuality = toLabel(lifeState?.planQuality);
  const loadLabel = toLabel(lifeState?.load);
  const modeLabel = toLabel(lifeState?.mode);
  const momentumLabel = toLabel(lifeState?.momentum);
  const capacityLabel = toLabel(lifeState?.focusCapacity);
  const habitLabel = toLabel(lifeState?.habitHealth);
  const financeLabel = toLabel(lifeState?.financialDrift);

  const stateItems = useMemo(
    () => [
      { label: "MODE", value: modeLabel, tone: modeLabel === "RECOVERY" ? "warning" : "accent" },
      {
        label: "CAPACITY",
        value: capacityLabel,
        tone: capacityLabel === "VERY LOW" || capacityLabel === "LOW" ? "warning" : "success",
      },
      { label: "LOAD", value: loadLabel, tone: loadLabel === "OVERLOADED" ? "warning" : "neutral" },
      {
        label: "MOMENTUM",
        value: momentumLabel,
        tone: momentumLabel === "STALLED" ? "warning" : "success",
      },
      {
        label: "HABITS",
        value: habitLabel,
        tone: habitLabel === "FRAGILE" ? "warning" : "neutral",
      },
      {
        label: "FINANCE",
        value: financeLabel,
        tone: financeLabel === "RISK" ? "warning" : "neutral",
      },
      {
        label: "PLAN_QUALITY",
        value: planQuality,
        tone: planQuality === "NONE" ? "warning" : "neutral",
      },
    ],
    [
      modeLabel,
      capacityLabel,
      loadLabel,
      momentumLabel,
      habitLabel,
      financeLabel,
      planQuality,
    ],
  );

  const stateReasons = Array.isArray(lifeState?.reasons) ? lifeState?.reasons : [];

  const showEditor = plannerState === "NO_PLAN" || isEditing;

  if (!data) {
    return <PlannerSkeleton />;
  }

  const updateDraft = (index: number, patch: Partial<DraftItem>) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const setPlan = async (
    reason: "initial" | "adjust" | "reset" | "recovery" | "return",
    items: PlanItem[],
  ) => {
    if (!items.length) return;
    setIsSaving(true);
    try {
      await execute({
        command: {
          cmd: "set_daily_plan",
          input: { day: data.day, focusItems: items.slice(0, 3), reason },
          idempotencyKey: idem(),
          tzOffsetMinutes,
        },
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const generateAiPlanDraft = async () => {
    setIsGeneratingAiPlan(true);
    try {
      const result = (await generateDailyPlanDraftAction({
        day: data.day,
      })) as DailyPlanDraftResult;
      if (result.status === "success") {
        setAiPlanDraft(result.draft);
        setAiPlanSource(result.source);
      }
    } finally {
      setIsGeneratingAiPlan(false);
    }
  };

  const loadAiPlan = () => {
    if (!aiPlanDraft) return;
    setDraftItems(toDraftItems(aiPlanDraft.focusItems));
    setIsEditing(true);
  };

  const applyAiPlan = async () => {
    if (!aiPlanDraft) return;
    setIsApplyingAiPlan(true);
    try {
      const reason = plan ? "adjust" : "initial";
      await setPlan(reason, aiPlanDraft.focusItems);
    } finally {
      setIsApplyingAiPlan(false);
    }
  };

  const savePlan = async () => {
    const focusItems = draftItems
      .map((item, index) => {
        const label = item.label.trim();
        if (!label) return null;
        const estimatedMinutes = normalizeEstimate(Number(item.estimatedMinutes));
        const id = item.id || `focus-${Date.now()}-${index}`;
        return { id, label, estimatedMinutes };
      })
      .filter((item): item is PlanItem => Boolean(item));

    if (!focusItems.length) return;
    const reason = plan ? "adjust" : "initial";
    await setPlan(reason, focusItems);
  };

  const startAdjust = () => {
    if (plan) {
      setDraftItems(toDraftItems(plan.focusItems));
    }
    setIsEditing(true);
  };

  const resetPlan = async () => {
    await setPlan("reset", [
      {
        id: "recovery",
        label: "One small stabilizing task",
        estimatedMinutes: 10,
      },
    ]);
  };

  const restPlan = async () => {
    await setPlan("recovery", [
      {
        id: "rest",
        label: "Rest and recover",
        estimatedMinutes: 5,
      },
    ]);
  };

  const shrinkPlan = async (keepCount: 1 | 2) => {
    if (!plan) return;
    const items = plan.focusItems.slice(0, keepCount);
    await setPlan("reset", items);
  };

  const getNextStepMinutes = () => {
    if (lifeState?.mode === "recovery" || lifeState?.focusCapacity === "very_low") return 10;
    if (lifeState?.focusCapacity === "low") return 10;
    if (lifeState?.focusCapacity === "high") return 25;
    return 15;
  };

  const startNextStep = (forcedMinutes?: number) => {
    if (!plan || plan.focusItems.length === 0) return;
    setNextStepIndex(0);
    setNextStepMinutes(forcedMinutes ?? getNextStepMinutes());
    setShowNextStep(true);
  };

  const shrinkNextStep = () => {
    const min = lifeState?.mode === "recovery" || lifeState?.focusCapacity === "very_low" ? 5 : 10;
    setNextStepMinutes((minutes) => Math.max(min, minutes - 5));
  };

  const skipNextStep = () => {
    if (!plan) return;
    const nextIndex = nextStepIndex + 1;
    if (nextIndex >= plan.focusItems.length) {
      setShowNextStep(false);
      return;
    }
    setNextStepIndex(nextIndex);
  };

  const subtitle = (() => {
    if (plannerState === "RETURNING") return "Welcome back. No pressure.";
    if (plannerState === "RECOVERY") return "Recovery mode. Keep it small.";
    if (plannerState === "OVERLOADED") return "This plan is heavier than your available time.";
    if (plannerState === "STALLED") return "No momentum yet. Let's make it easy.";
    return "What would make today a win?";
  })().toUpperCase();

  return (
    <Container className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-4 pt-6 gap-6">
          <View className="border-b-2 border-divider pb-3">
            <MachineText variant="label" className="text-accent mb-2">
              KERNEL://PLANNER
            </MachineText>
            <View className="flex-row items-end justify-between">
              <View>
                <MachineText variant="header" size="2xl">
                  DAILY_PLAN
                </MachineText>
                <MachineText className="text-muted text-xs mt-1">{subtitle}</MachineText>
              </View>
              <View className="items-end">
                <MachineText variant="label" className="text-[9px]">
                  MODE
                </MachineText>
                <View className="border border-foreground bg-surface px-2 py-1 shadow-[2px_2px_0px_var(--color-foreground)]">
                  <MachineText className="text-[10px] font-bold">{modeLabel}</MachineText>
                </View>
              </View>
            </View>
          </View>

          <HardCard className="mb-1" padding="sm" label="STATE_MATRIX">
            <View className="gap-3 p-2">
              <View className="flex-row flex-wrap gap-2">
                {stateItems.map((item) => (
                  <View
                    key={item.label}
                    className={`border border-foreground px-2 py-1 ${
                      item.tone === "accent"
                        ? "bg-accent"
                        : item.tone === "success"
                          ? "bg-success"
                          : item.tone === "warning"
                            ? "bg-warning"
                            : "bg-surface"
                    }`}
                  >
                    <MachineText
                      className={`text-[9px] font-bold ${
                        item.tone === "accent" ? "text-accent-foreground" : "text-foreground"
                      }`}
                    >
                      {item.label}: {item.value}
                    </MachineText>
                  </View>
                ))}
              </View>
              <View className="flex-row flex-wrap gap-4">
                <View>
                  <MachineText variant="label" className="text-[9px]">
                    FREE_TIME
                  </MachineText>
                  <MachineText className="text-sm font-bold">{formatMinutes(freeMinutes)}</MachineText>
                </View>
                <View>
                  <MachineText variant="label" className="text-[9px]">
                    PLAN_TIME
                  </MachineText>
                  <MachineText className="text-sm font-bold">{formatMinutes(totalMinutes)}</MachineText>
                </View>
                <View>
                  <MachineText variant="label" className="text-[9px]">
                    COMPLETION_RATE
                  </MachineText>
                  <MachineText className="text-sm font-bold">
                    {typeof completionRate === "number" ? `${Math.round(completionRate * 100)}%` : "—"}
                  </MachineText>
                </View>
                <View>
                  <MachineText variant="label" className="text-[9px]">
                    BACKLOG_PRESSURE
                  </MachineText>
                  <MachineText className="text-sm font-bold">
                    {typeof backlogPressure === "number" ? `${Math.round(backlogPressure)}` : "—"}
                  </MachineText>
                </View>
              </View>
            </View>
          </HardCard>

          <HardCard className="mb-1" padding="sm" label="REASONS">
            <View className="gap-2 p-2">
              {stateReasons.length ? (
                stateReasons.slice(0, 3).map((reason: { code: string; detail: string }) => (
                  <View key={reason.code} className="border-l-2 border-divider pl-2">
                    <MachineText className="text-[10px] text-foreground/70">{reason.code}</MachineText>
                    <MachineText className="text-xs">Reason: {reason.detail}</MachineText>
                  </View>
                ))
              ) : (
                <MachineText className="text-xs text-muted">
                  Reason: No kernel reasons available yet.
                </MachineText>
              )}
            </View>
          </HardCard>

          <SuggestionInbox />

          <HardCard className="mb-1" padding="sm" label="AI_PLAN_DRAFT">
            <View className="gap-3 p-2">
              <View className="gap-1">
                <MachineText className="font-bold">AI_PLAN</MachineText>
                <MachineText className="text-xs text-muted">DRAFT_ONLY. YOU_DECIDE.</MachineText>
              </View>
              {aiPlanDraft ? (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    <MachineText className="text-[10px] text-muted">
                      SOURCE: {aiPlanSource === "ai" ? "AI" : "FALLBACK"}
                    </MachineText>
                    <MachineText className="text-[10px] text-muted">DAY: {aiPlanDraft.day}</MachineText>
                  </View>
                  <View className="gap-2">
                    {aiPlanDraft.focusItems.map((item) => (
                      <View key={item.id} className="border border-divider p-2">
                        <MachineText className="text-sm font-bold">{item.label}</MachineText>
                        <MachineText className="text-[10px] text-muted">
                          {item.estimatedMinutes} MIN
                        </MachineText>
                      </View>
                    ))}
                  </View>
                  <MachineText className="text-[10px] text-muted">
                    Reason: {aiPlanDraft.reason.detail}
                  </MachineText>
                </View>
              ) : (
                <MachineText className="text-sm">NO_AI_DRAFT_YET.</MachineText>
              )}
              <View className="flex-row gap-2 flex-wrap">
                <Button
                  onPress={generateAiPlanDraft}
                  isDisabled={isGeneratingAiPlan}
                  className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
                  size="sm"
                >
                  {isGeneratingAiPlan ? (
                    <Spinner size="sm" color="white" />
                  ) : (
                    <MachineText className="text-background font-bold">GENERATE_AI_PLAN</MachineText>
                  )}
                </Button>
                {aiPlanDraft ? (
                  <>
                    <Button
                      onPress={loadAiPlan}
                      isDisabled={isSaving}
                      className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                      size="sm"
                    >
                      <MachineText className="text-foreground font-bold">LOAD_TO_EDITOR</MachineText>
                    </Button>
                    <Button
                      onPress={applyAiPlan}
                      isDisabled={isSaving || isApplyingAiPlan}
                      className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                      size="sm"
                    >
                      {isApplyingAiPlan ? (
                        <Spinner size="sm" color="white" />
                      ) : (
                        <MachineText className="text-accent-foreground font-bold">
                          APPLY_AI_PLAN
                        </MachineText>
                      )}
                    </Button>
                  </>
                ) : null}
              </View>
              <MachineText className="text-[10px] text-muted">
                Reason: AI proposes a small draft; you choose what becomes real.
              </MachineText>
            </View>
          </HardCard>

          <HardCard className="mb-1" padding="sm" label="EVENT SUMMARY">
            <View className="flex-row justify-between p-2">
              <View className="items-start">
                <MachineText variant="label" className="text-[10px]">
                  HABITS DONE
                </MachineText>
                <MachineText variant="value" className="text-sm">
                  {eventSummary.habitDone}
                </MachineText>
              </View>
              <View className="items-start">
                <MachineText variant="label" className="text-[10px]">
                  HABITS MISSED
                </MachineText>
                <MachineText variant="value" className="text-sm">
                  {eventSummary.habitMissed}
                </MachineText>
              </View>
              <View className="items-start">
                <MachineText variant="label" className="text-[10px]">
                  EXPENSES
                </MachineText>
                <MachineText variant="value" className="text-sm">
                  {eventSummary.expenseAdded}
                </MachineText>
              </View>
            </View>
            <MachineText className="text-[10px] text-muted px-2 pb-2">
              Reason: events are the truth; planning reads from them.
            </MachineText>
          </HardCard>

          {showEditor ? (
            <HardCard label="EDIT_PLAN" className="gap-4 p-4">
              <View className="gap-1">
                <MachineText className="font-bold">TODAY'S FOCUS</MachineText>
                <MachineText className="text-xs text-muted">
                  Up to three items, rough effort only.
                </MachineText>
              </View>
              <View className="gap-4">
                {draftItems.map((item, index) => (
                  <HardCard
                    key={item.id}
                    variant="flat"
                    padding="sm"
                    className="gap-2 bg-surface border-dashed"
                  >
                    <View>
                      <MachineText variant="label" className="mb-1">
                        FOCUS ITEM {index + 1}
                      </MachineText>
                      <TextField>
                        <TextField.Input
                          value={item.label}
                          onChangeText={(value) => updateDraft(index, { label: value })}
                          placeholder="Small, meaningful thing"
                          className="font-mono text-sm text-foreground bg-surface border-b border-divider py-2 h-10"
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
                          value={item.estimatedMinutes}
                          onChangeText={(value) => updateDraft(index, { estimatedMinutes: value })}
                          placeholder="25"
                          keyboardType="number-pad"
                          className="font-mono text-sm text-foreground bg-surface border-b border-divider py-2 h-10"
                          style={{ fontFamily: "Menlo" }}
                        />
                      </TextField>
                    </View>
                  </HardCard>
                ))}
              </View>
              <View className="flex-row gap-2 flex-wrap">
                <Button
                  onPress={savePlan}
                  isDisabled={isSaving}
                  className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
                  size="sm"
                >
                  {isSaving ? (
                    <Spinner size="sm" color="white" />
                  ) : (
                    <MachineText className="text-background font-bold">SAVE_PLAN</MachineText>
                  )}
                </Button>
                {plan ? (
                  <Button
                    onPress={() => setIsEditing(false)}
                    isDisabled={isSaving}
                    className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                    size="sm"
                  >
                    <MachineText className="text-foreground font-bold">CANCEL</MachineText>
                  </Button>
                ) : null}
                {plannerState === "NO_PLAN" ? (
                  <Button
                    onPress={restPlan}
                    isDisabled={isSaving}
                    className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                    size="sm"
                  >
                    <MachineText className="text-foreground font-bold">REST_DAY</MachineText>
                  </Button>
                ) : null}
              </View>
              <MachineText className="text-[10px] text-muted">
                Reason: a small, explicit plan lowers friction and protects capacity.
              </MachineText>
            </HardCard>
          ) : (
            <HardCard label="CURRENT_PLAN" className="gap-4 p-4">
              <View className="gap-1">
                <MachineText className="font-bold">TODAY'S PLAN</MachineText>
                <MachineText className="text-xs text-muted">TOTAL: {totalMinutes} MIN</MachineText>
                {plan?.reason ? (
                  <MachineText className="text-[10px] text-muted">Reason: {plan.reason}</MachineText>
                ) : null}
              </View>
              <View className="gap-3">
                {plan?.focusItems.map((item) => (
                  <HardCard key={item.id} variant="default" padding="sm" className="bg-surface">
                    <View className="flex-row items-center justify-between">
                      <View className="gap-1">
                        <MachineText className="font-bold">{item.label}</MachineText>
                        <MachineText className="text-xs text-muted">
                          {item.estimatedMinutes} MIN
                        </MachineText>
                      </View>
                    </View>
                  </HardCard>
                ))}
              </View>

              {showNextStep ? (
                <HardCard variant="flat" className="gap-3 border-accent/40 bg-accent/10">
                  <View className="gap-1">
                    <MachineText className="font-bold text-accent">NEXT_STEP</MachineText>
                    <MachineText className="text-xs text-muted">Keep it small and doable.</MachineText>
                  </View>
                  <View>
                    <MachineText className="font-bold text-lg">
                      {plan?.focusItems[nextStepIndex]?.label}
                    </MachineText>
                    <MachineText className="text-xs text-muted">{nextStepMinutes} MIN</MachineText>
                  </View>
                  <View className="flex-row gap-2 flex-wrap">
                    <Button
                      className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                      onPress={() => setShowNextStep(false)}
                      size="sm"
                    >
                      <MachineText className="text-accent-foreground font-bold">START</MachineText>
                    </Button>
                    <Button
                      className="bg-surface border border-foreground rounded-none"
                      onPress={shrinkNextStep}
                      size="sm"
                    >
                      <MachineText className="text-foreground text-[10px] font-bold">
                        SMALLER
                      </MachineText>
                    </Button>
                    {plan && plan.focusItems.length > 1 ? (
                      <Button
                        className="bg-surface border border-foreground rounded-none"
                        onPress={skipNextStep}
                        size="sm"
                      >
                        <MachineText className="text-foreground text-[10px] font-bold">
                          SKIP
                        </MachineText>
                      </Button>
                    ) : null}
                  </View>
                  <MachineText className="text-[10px] text-muted">
                    Reason: smallest viable step keeps momentum without overload.
                  </MachineText>
                </HardCard>
              ) : null}

              <View className="flex-row gap-2 flex-wrap mt-2">
                {plannerState === "OVERLOADED" ? (
                  <>
                    <Button
                      onPress={resetPlan}
                      className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                      isDisabled={isSaving}
                      size="sm"
                    >
                      <MachineText className="text-foreground text-[10px] font-bold">
                        PLAN_RESET
                      </MachineText>
                    </Button>
                    <Button
                      onPress={() => shrinkPlan(1)}
                      className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                      isDisabled={isSaving}
                      size="sm"
                    >
                      <MachineText className="text-foreground text-[10px] font-bold">
                        SHRINK_TO_1
                      </MachineText>
                    </Button>
                  </>
                ) : null}
                {plannerState === "STALLED" || plannerState === "PLANNED_OK" ? (
                  <>
                    <Button
                      onPress={() => startNextStep()}
                      className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
                      isDisabled={isSaving}
                      size="sm"
                    >
                      <MachineText className="text-background font-bold">START_SESSION</MachineText>
                    </Button>
                    {plannerState === "STALLED" ? (
                      <Button
                        onPress={() => startNextStep(10)}
                        className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                        isDisabled={isSaving}
                        size="sm"
                      >
                        <MachineText className="text-foreground font-bold">TINY_WIN</MachineText>
                      </Button>
                    ) : null}
                  </>
                ) : null}
                <Button
                  onPress={startAdjust}
                  className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
                  isDisabled={isSaving}
                  size="sm"
                >
                  <MachineText className="text-foreground font-bold">ADJUST</MachineText>
                </Button>
              </View>
              <MachineText className="text-[10px] text-muted">
                Reason: adjust only if the plan and reality diverge.
              </MachineText>
            </HardCard>
          )}
        </View>
      </ScrollView>
    </Container>
  );
}

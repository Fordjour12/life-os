import { api } from "@life-os/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { Button, Spinner, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Container } from "@/components/container";
import { PlannerSkeleton } from "@/components/skeletons/planner-skeleton";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
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

type PlannerState = "NO_PLAN" | "PLANNED_OK" | "OVERLOADED" | "STALLED" | "RECOVERY" | "RETURNING";

type WeeklyPlanDraft = {
  week: string;
  days: Array<{
    day: string;
    focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
    reason: { code: string; detail: string };
    conflict?: { code: string; detail: string };
    adjustment?: { code: string; detail: string };
    reservations?: Array<{
      itemId: string;
      label: string;
      startMin?: number;
      endMin?: number;
      status: "reserved" | "unplaced";
    }>;
  }>;
  reason: { code: string; detail: string };
};

const allowedEstimates = [10, 25, 45, 60];

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function getCurrentIsoWeekId() {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const year = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000) + 1) / 7,
  );
  return `${year}-${String(week).padStart(2, "0")}`;
}

function formatMinuteOfDay(totalMinutes: number) {
  const minutes = Math.max(0, Math.min(24 * 60, Math.floor(totalMinutes)));
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = ((hour24 + 11) % 12) + 1;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

function normalizeEstimate(value: number) {
  if (!Number.isFinite(value)) return 25;
  return allowedEstimates.reduce((closest, estimate) =>
    Math.abs(estimate - value) < Math.abs(closest - value) ? estimate : closest,
  );
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
  const generateWeeklyPlanDraft = useAction(api.kernel.vexAgents.generateWeeklyPlanDraft);
  const applyWeeklyPlanDraft = useAction(api.kernel.vexAgents.applyWeeklyPlanDraft);
  const plannerPrefs = useQuery(api.kernel.commands.getPlannerPrefs, {});

  const [draftItems, setDraftItems] = useState<DraftItem[]>(() => createEmptyDraft());
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nextStepIndex, setNextStepIndex] = useState(0);
  const [nextStepMinutes, setNextStepMinutes] = useState(10);
  const [showNextStep, setShowNextStep] = useState(false);
  const [isGeneratingWeekPlan, setIsGeneratingWeekPlan] = useState(false);
  const [isApplyingWeekPlan, setIsApplyingWeekPlan] = useState(false);
  const [hardModeEnabled, setHardModeEnabled] = useState(false);
  const [weeklyPlanDraft, setWeeklyPlanDraft] = useState<WeeklyPlanDraft | null>(null);
  const [acceptedDays, setAcceptedDays] = useState<string[]>([]);
  const [declinedDays, setDeclinedDays] = useState<string[]>([]);

  useEffect(() => {
    if (typeof plannerPrefs?.weeklyPlannerHardMode === "boolean") {
      setHardModeEnabled(plannerPrefs.weeklyPlannerHardMode);
    }
  }, [plannerPrefs?.weeklyPlannerHardMode]);

  if (!data) {
    return <PlannerSkeleton />;
  }

  const plan = (data.plan ?? null) as PlanData | null;
  const plannerState = (data.plannerState ?? "NO_PLAN") as PlannerState;
  const lifeState = data.state ?? null;
  const eventSummary = data.eventSummary ?? {
    habitDone: 0,
    habitMissed: 0,
    expenseAdded: 0,
  };
  const totalMinutes = plan
    ? plan.focusItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)
    : 0;

  const showEditor = plannerState === "NO_PLAN" || isEditing;

  const updateDraft = (index: number, patch: Partial<DraftItem>) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const setPlan = async (
    reason: "initial" | "adjust" | "reset" | "recovery" | "return",
    items: PlanItem[],
    dayOverride?: string,
  ) => {
    if (!items.length) return;
    setIsSaving(true);
    try {
      await execute({
        command: {
          cmd: "set_daily_plan",
          input: { day: dayOverride ?? data.day, focusItems: items.slice(0, 3), reason },
          idempotencyKey: idem(),
          tzOffsetMinutes,
        },
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const applyAcceptedDays = async (daysToApply: string[], draftOverride?: WeeklyPlanDraft) => {
    const draft = draftOverride ?? weeklyPlanDraft;
    if (!draft || !daysToApply.length) return;
    setIsApplyingWeekPlan(true);
    try {
      await applyWeeklyPlanDraft({
        draft,
        acceptedDays: daysToApply,
        hardMode: false,
        tzOffsetMinutes,
      });
    } finally {
      setIsApplyingWeekPlan(false);
    }
  };

  const generateWeekPlannerSuggestion = async () => {
    setIsGeneratingWeekPlan(true);
    try {
      const result = await generateWeeklyPlanDraft({ week: getCurrentIsoWeekId() });
      if (result.status !== "success") return;

      const draft = result.draft as WeeklyPlanDraft;
      setWeeklyPlanDraft(draft);

      if (hardModeEnabled) {
        const nonConflictingDays = draft.days
          .filter((dayPlan) => !dayPlan.conflict)
          .map((dayPlan) => dayPlan.day);
        setAcceptedDays(nonConflictingDays);
        setDeclinedDays(
          draft.days.filter((dayPlan) => dayPlan.conflict).map((dayPlan) => dayPlan.day),
        );
        setIsApplyingWeekPlan(true);
        try {
          await applyWeeklyPlanDraft({
            draft,
            hardMode: true,
            tzOffsetMinutes,
          });
        } finally {
          setIsApplyingWeekPlan(false);
        }
      } else {
        setAcceptedDays([]);
        setDeclinedDays([]);
      }
    } finally {
      setIsGeneratingWeekPlan(false);
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

  const acceptSuggestionDay = (day: string) => {
    setAcceptedDays((days) => Array.from(new Set([...days, day])));
    setDeclinedDays((days) => days.filter((entry) => entry !== day));
  };

  const declineSuggestionDay = (day: string) => {
    setDeclinedDays((days) => Array.from(new Set([...days, day])));
    setAcceptedDays((days) => days.filter((entry) => entry !== day));
  };

  const subtitle = (() => {
    if (plannerState === "RETURNING") return "Welcome back. No pressure.";
    if (plannerState === "RECOVERY") return "Recovery mode. Keep it small.";
    if (plannerState === "OVERLOADED") return "This plan is heavier than your available time.";
    if (plannerState === "STALLED") return "No momentum yet. Let's make it easy.";
    return "What would make today a win?";
  })().toUpperCase();

  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="header" size="2xl">
          PLANNER
        </MachineText>
        <MachineText className="text-muted text-xs mt-1">{subtitle}</MachineText>
      </View>

      <HardCard className="mb-6" padding="sm" label="EVENT SUMMARY">
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
      </HardCard>

      <HardCard label="WEEKLY_AI_PLANNER" className="mb-6 gap-3 p-4">
        <View className="gap-1">
          <MachineText className="font-bold">SUGGESTED_WEEK_PLAN</MachineText>
          <MachineText className="text-xs text-muted">
            AI proposes. You decide. Hard mode auto-applies non-conflicting days.
          </MachineText>
          <MachineText className="text-xs text-muted">
            HARD MODE: {hardModeEnabled ? "ON" : "OFF"} (CHANGE IN SETTINGS TAB)
          </MachineText>
        </View>
        <View className="flex-row gap-2 flex-wrap">
          <Button
            onPress={generateWeekPlannerSuggestion}
            isDisabled={isGeneratingWeekPlan || isApplyingWeekPlan}
            className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
            size="sm"
          >
            {isGeneratingWeekPlan ? (
              <Spinner size="sm" color="white" />
            ) : (
              <MachineText className="text-background font-bold">
                GENERATE_WEEKLY_AI_PLAN
              </MachineText>
            )}
          </Button>
          {!hardModeEnabled ? (
            <Button
              onPress={() => applyAcceptedDays(acceptedDays)}
              isDisabled={!acceptedDays.length || isApplyingWeekPlan || isGeneratingWeekPlan}
              className="bg-surface border border-foreground rounded-none"
              size="sm"
            >
              {isApplyingWeekPlan ? (
                <Spinner size="sm" />
              ) : (
                <MachineText className="text-foreground font-bold">APPLY_ACCEPTED</MachineText>
              )}
            </Button>
          ) : null}
        </View>

        {weeklyPlanDraft ? (
          <View className="gap-2">
            <MachineText className="text-[10px] text-muted">
              REASON: {weeklyPlanDraft.reason.detail}
            </MachineText>
            {weeklyPlanDraft.days.map((dayPlan) => {
              const isAccepted = acceptedDays.includes(dayPlan.day);
              const isDeclined = declinedDays.includes(dayPlan.day);
              return (
                <HardCard
                  key={dayPlan.day}
                  variant="flat"
                  padding="sm"
                  className="gap-2 bg-surface border-dashed"
                >
                  <View className="flex-row items-center justify-between">
                    <MachineText className="font-bold text-xs">{dayPlan.day}</MachineText>
                    {dayPlan.conflict ? (
                      <MachineText className="text-[10px] text-danger">CONFLICT</MachineText>
                    ) : isAccepted ? (
                      <MachineText className="text-[10px] text-accent">ACCEPTED</MachineText>
                    ) : isDeclined ? (
                      <MachineText className="text-[10px] text-muted">DECLINED</MachineText>
                    ) : (
                      <MachineText className="text-[10px] text-muted">PENDING</MachineText>
                    )}
                  </View>
                  <View className="gap-1">
                    {dayPlan.focusItems.map((item) => (
                      <MachineText key={item.id} className="text-sm">
                        {item.label} ({item.estimatedMinutes} MIN)
                      </MachineText>
                    ))}
                  </View>
                  <MachineText className="text-[10px] text-muted">
                    REASON: {dayPlan.reason.detail}
                  </MachineText>
                  {dayPlan.adjustment ? (
                    <MachineText className="text-[10px] text-accent">
                      ADAPTIVE_GUARD: {dayPlan.adjustment.detail}
                    </MachineText>
                  ) : null}
                  {dayPlan.reservations?.length ? (
                    <View className="gap-1">
                      {dayPlan.reservations.map((reservation) => (
                        <MachineText
                          key={`${dayPlan.day}:${reservation.itemId}:${reservation.status}`}
                          className="text-[10px] text-muted"
                        >
                          {reservation.label}:{" "}
                          {reservation.status === "reserved" &&
                          typeof reservation.startMin === "number" &&
                          typeof reservation.endMin === "number"
                            ? `${formatMinuteOfDay(reservation.startMin)} - ${formatMinuteOfDay(reservation.endMin)}`
                            : "NO_SLOT"}
                        </MachineText>
                      ))}
                    </View>
                  ) : null}
                  {dayPlan.conflict ? (
                    <MachineText className="text-[10px] text-danger">
                      CONFLICT_REASON: {dayPlan.conflict.detail}
                    </MachineText>
                  ) : hardModeEnabled ? (
                    <MachineText className="text-[10px] text-accent">
                      HARD_MODE_AUTO_ATTACHES_THIS_DAY
                    </MachineText>
                  ) : (
                    <View className="flex-row gap-2">
                      <Button
                        onPress={() => acceptSuggestionDay(dayPlan.day)}
                        size="sm"
                        className="bg-foreground rounded-none"
                      >
                        <MachineText className="text-background text-[10px]">ACCEPT</MachineText>
                      </Button>
                      <Button
                        onPress={() => declineSuggestionDay(dayPlan.day)}
                        size="sm"
                        className="bg-surface border border-foreground rounded-none"
                      >
                        <MachineText className="text-foreground text-[10px]">DECLINE</MachineText>
                      </Button>
                    </View>
                  )}
                </HardCard>
              );
            })}
          </View>
        ) : (
          <MachineText className="text-xs text-muted">NO_WEEKLY_SUGGESTION_YET.</MachineText>
        )}
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
        </HardCard>
      ) : (
        <HardCard label="CURRENT_Plan" className="gap-4 p-4">
          <View className="gap-1">
            <MachineText className="font-bold">TODAY'S PLAN</MachineText>
            <MachineText className="text-xs text-muted">TOTAL: {totalMinutes} MIN</MachineText>
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
        </HardCard>
      )}
    </Container>
  );
}

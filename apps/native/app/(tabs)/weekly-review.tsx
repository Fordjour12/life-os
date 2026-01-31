import { api } from "@life-os/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { DriftSignalsCard } from "@/components/drift-signals-card";
import { PatternInsightsCard } from "@/components/pattern-insights-card";
import { WeeklyReviewCard } from "@/components/weekly-review-card";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";

export default function WeeklyReviewScreen() {
  const weeklyReview = useQuery(api.identity.weeklyReview.getWeeklyReview, {});
  const patternInsights = useQuery(api.identity.getPatternInsights, {
    window: "week",
  });
  const driftSignals = useQuery(api.identity.getDriftSignals, {
    window: "month",
  });
  const generateWeeklyReviewMutation = useMutation(api.identity.weeklyReview.generateWeeklyReview);
  const generateWeeklyReviewDraftAction = useAction(api.kernel.vexAgents.generateWeeklyReviewDraft);
  const generateWeeklyPlanDraftAction = useAction(api.kernel.vexAgents.generateWeeklyPlanDraft);
  const executeCommandMutation = useMutation(api.kernel.commands.executeCommand);
  const [isGeneratingWeeklyReview, setIsGeneratingWeeklyReview] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [aiDraft, setAiDraft] = useState<
    | {
        highlights: string[];
        frictionPoints: string[];
        reflectionQuestion: string;
        narrative: string;
        reason: { code: string; detail: string };
      }
    | null
  >(null);
  const [weeklyPlanDraft, setWeeklyPlanDraft] = useState<
    | {
        week: string;
        days: Array<{
          day: string;
          focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
          reason: { code: string; detail: string };
        }>;
        reason: { code: string; detail: string };
      }
    | null
  >(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [applyingDay, setApplyingDay] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  const generateWeeklyReview = async () => {
    setIsGeneratingWeeklyReview(true);
    try {
      await generateWeeklyReviewMutation({});
    } finally {
      setIsGeneratingWeeklyReview(false);
    }
  };

  const generateWeeklyReviewDraft = async () => {
    setIsGeneratingDraft(true);
    try {
      const result = await generateWeeklyReviewDraftAction({});
      if (result.status === "success") {
        setAiDraft(result.draft);
      }
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const generateWeeklyPlanDraft = async () => {
    setIsGeneratingPlan(true);
    try {
      const result = await generateWeeklyPlanDraftAction({
        week: weeklyReview?.week,
      });
      if (result.status === "success") {
        setWeeklyPlanDraft(result.draft);
      }
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const applyPlanDay = async (day: string) => {
    if (!weeklyPlanDraft) return;
    const dayPlan = weeklyPlanDraft.days.find((entry) => entry.day === day);
    if (!dayPlan) return;
    setApplyingDay(day);
    try {
      await executeCommandMutation({
        command: {
          cmd: "set_daily_plan",
          input: {
            day,
            reason: "adjust",
            focusItems: dayPlan.focusItems,
          },
          idempotencyKey: `plan:${day}:${Date.now()}`,
        },
      });
    } finally {
      setApplyingDay(null);
    }
  };

  const applyAllDays = async () => {
    if (!weeklyPlanDraft) return;
    setIsApplyingAll(true);
    try {
      for (const dayPlan of weeklyPlanDraft.days) {
        await executeCommandMutation({
          command: {
            cmd: "set_daily_plan",
            input: {
              day: dayPlan.day,
              reason: "adjust",
              focusItems: dayPlan.focusItems,
            },
            idempotencyKey: `plan:${dayPlan.day}:${Date.now()}`,
          },
        });
      }
    } finally {
      setIsApplyingAll(false);
    }
  };

  if (weeklyReview === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="label" className="text-accent mb-1">
          SYSTEM://REVIEW
        </MachineText>
        <MachineText variant="header" size="2xl">
          WEEKLY_MIRROR
        </MachineText>
      </View>

      <WeeklyReviewCard
        review={weeklyReview ?? null}
        onGenerate={generateWeeklyReview}
        isGenerating={isGeneratingWeeklyReview}
      />

      <HardCard label="AI_NARRATIVE" className="mb-6 bg-surface">
        <View className="p-2 gap-4">
          <View className="gap-1">
            <MachineText variant="label" className="text-accent">
              AI_DRAFT
            </MachineText>
            <MachineText className="text-xs text-muted">
              DRAFT_ONLY. YOU_DECIDE.
            </MachineText>
          </View>
          {aiDraft ? (
            <View className="gap-3">
              <MachineText className="text-sm">{aiDraft.narrative}</MachineText>
              <View className="gap-2">
                <MachineText variant="label" className="text-accent">
                  POSITIVE_SIGNALS
                </MachineText>
                <MachineText className="text-sm">
                  {aiDraft.highlights.length ? aiDraft.highlights.join(" ") : "NO_SIGNAL"}
                </MachineText>
              </View>
              <View className="gap-2">
                <MachineText variant="label" className="text-accent">
                  FRICTION_DETECTED
                </MachineText>
                <MachineText className="text-sm">
                  {aiDraft.frictionPoints.length ? aiDraft.frictionPoints.join(" ") : "CLEAR_PATH"}
                </MachineText>
              </View>
              <View className="gap-2 p-3 bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]">
                <MachineText variant="label" className="text-accent mb-1">
                  GENTLE_PROMPT
                </MachineText>
                <MachineText className="font-bold text-base">
                  {aiDraft.reflectionQuestion}
                </MachineText>
              </View>
              <MachineText className="text-[10px] text-muted">
                REASON: {aiDraft.reason.detail}
              </MachineText>
            </View>
          ) : (
            <MachineText className="text-sm">NO_AI_DRAFT_YET.</MachineText>
          )}
          <Button
            onPress={generateWeeklyReviewDraft}
            isDisabled={isGeneratingDraft}
            className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
          >
            {isGeneratingDraft ? (
              <Spinner size="sm" color="white" />
            ) : (
              <MachineText className="text-background font-bold">GENERATE_AI_DRAFT</MachineText>
            )}
          </Button>
        </View>
      </HardCard>

      <HardCard label="WEEKLY_PLAN" className="mb-6 bg-surface">
        <View className="p-2 gap-4">
          <View className="gap-1">
            <MachineText variant="label" className="text-accent">
              PLAN_DRAFT
            </MachineText>
            <MachineText className="text-xs text-muted">
              DRAFT_ONLY. APPLY_PER_DAY.
            </MachineText>
          </View>
          {weeklyPlanDraft ? (
            <View className="gap-3">
              <MachineText className="text-[10px] text-muted">
                REASON: {weeklyPlanDraft.reason.detail}
              </MachineText>
              <View className="gap-3">
                {weeklyPlanDraft.days.map((dayPlan) => (
                  <View key={dayPlan.day} className="gap-2 border border-divider p-2">
                    <View className="flex-row items-center justify-between">
                      <MachineText className="font-bold text-xs">{dayPlan.day}</MachineText>
                      <Button
                        size="sm"
                        onPress={() => applyPlanDay(dayPlan.day)}
                        isDisabled={applyingDay === dayPlan.day}
                        className="bg-foreground rounded-none"
                      >
                        {applyingDay === dayPlan.day ? (
                          <Spinner size="sm" color="white" />
                        ) : (
                          <MachineText className="text-background text-[10px]">
                            APPLY_DAY
                          </MachineText>
                        )}
                      </Button>
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
                  </View>
                ))}
              </View>
              <Button
                onPress={applyAllDays}
                isDisabled={isApplyingAll}
                className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
              >
                {isApplyingAll ? (
                  <Spinner size="sm" />
                ) : (
                  <MachineText className="font-bold">APPLY_ALL_DAYS</MachineText>
                )}
              </Button>
            </View>
          ) : (
            <MachineText className="text-sm">NO_PLAN_DRAFT_YET.</MachineText>
          )}
          <Button
            onPress={generateWeeklyPlanDraft}
            isDisabled={isGeneratingPlan}
            className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
          >
            {isGeneratingPlan ? (
              <Spinner size="sm" color="white" />
            ) : (
              <MachineText className="text-background font-bold">GENERATE_WEEK_PLAN</MachineText>
            )}
          </Button>
        </View>
      </HardCard>

      <PatternInsightsCard insights={patternInsights ?? null} windowLabel="WEEK_WINDOW" />

      <DriftSignalsCard signals={driftSignals ?? null} windowLabel="MONTH_WINDOW" />

      <HardCard label="DOCUMENTATION" className="bg-surface">
        <View className="p-2 gap-2">
          <MachineText variant="label" className="text-accent">
            CORE_LOGIC
          </MachineText>
          <MachineText className="text-xs">
            THIS_VIEW_IS_DERIVED_FROM_KERNEL_EVENTS_AND_DAILY_STATE_SNAPSHOTS.
            IT_IS_NON_JUDGEMENTAL_INPUT_FOR_SYSTEM_CALIBRATION.
          </MachineText>
        </View>
      </HardCard>
    </Container>
  );
}

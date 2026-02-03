import { api } from "@life-os/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import React, { useCallback, useState } from "react";
import { View } from "react-native";

import { AIDraftSection } from "@/components/weekly-review/ai-draft-section";
import { WeeklyPlanSection } from "@/components/weekly-review/weekly-plan-section";
import { DriftSignalsCard } from "@/components/drift-signals-card";
import { PatternInsightsCard } from "@/components/pattern-insights-card";
import { WeeklyReviewCard } from "@/components/weekly-review-card";
import type { AIDraft, WeeklyPlanDraft } from "@/types/weekly-review";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { WeeklyReviewSkeleton } from "@/components/skeletons/weekly-review-skeleton";

type AIDraftActionResult =
  | {
      status: "success";
      draft: AIDraft;
    }
  | {
      status: "error";
      message: string;
    };

type WeeklyPlanActionResult =
  | {
      status: "success";
      draft: WeeklyPlanDraft;
    }
  | {
      status: "error";
      message: string;
    };

type ApplyDayResult =
  | {
      status: "success";
    }
  | {
      status: "error";
      message: string;
    };

const WeeklyReviewScreen = React.memo(function WeeklyReviewScreen() {
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
  const [aiDraft, setAiDraft] = useState<AIDraft | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [weeklyPlanDraft, setWeeklyPlanDraft] = useState<WeeklyPlanDraft | null>(null);
  const [applyingDay, setApplyingDay] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  const generateWeeklyReview = useCallback(async () => {
    setIsGeneratingWeeklyReview(true);
    try {
      await generateWeeklyReviewMutation({});
    } catch {
      console.error("Failed to generate weekly review");
    } finally {
      setIsGeneratingWeeklyReview(false);
    }
  }, [generateWeeklyReviewMutation]);

  const generateWeeklyReviewDraft = useCallback(async (): Promise<AIDraftActionResult> => {
    setIsGeneratingDraft(true);
    try {
      const result = await generateWeeklyReviewDraftAction({});
      setAiDraft(result.draft);
      return { status: "success", draft: result.draft };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { status: "error", message };
    } finally {
      setIsGeneratingDraft(false);
    }
  }, [generateWeeklyReviewDraftAction]);

  const generateWeeklyPlanDraft = useCallback(
    async (week: string): Promise<WeeklyPlanActionResult> => {
      if (!week) {
        return { status: "error", message: "Week information is required" };
      }
      setIsGeneratingPlan(true);
      try {
        const result = await generateWeeklyPlanDraftAction({ week });
        setWeeklyPlanDraft(result.draft);
        return { status: "success", draft: result.draft };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { status: "error", message };
      } finally {
        setIsGeneratingPlan(false);
      }
    },
    [generateWeeklyPlanDraftAction],
  );

  const applyPlanDay = useCallback(
    async (
      day: string,
      focusItems: WeeklyPlanDraft["days"][0]["focusItems"],
    ): Promise<ApplyDayResult> => {
      setApplyingDay(day);
      try {
        await executeCommandMutation({
          command: {
            cmd: "set_daily_plan",
            input: {
              day,
              reason: "adjust",
              focusItems,
            },
            idempotencyKey: `plan:${day}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
          },
        });
        return { status: "success" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { status: "error", message };
      } finally {
        setApplyingDay(null);
      }
    },
    [executeCommandMutation],
  );

  const applyAllDays = useCallback(
    async (days: WeeklyPlanDraft["days"]) => {
      setIsApplyingAll(true);
      try {
        const results = await Promise.all(
          days.map((dayPlan) =>
            executeCommandMutation({
              command: {
                cmd: "set_daily_plan",
                input: {
                  day: dayPlan.day,
                  reason: "adjust",
                  focusItems: dayPlan.focusItems,
                },
                idempotencyKey: `plan:${dayPlan.day}:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
              },
            }),
          ),
        );
        const hasError = results.some((result, index) => {
          if (result instanceof Error) {
            console.error(`Failed to apply plan for ${days[index].day}:`, result);
            return true;
          }
          return false;
        });
        if (hasError) {
          console.error("Some days failed to apply");
        }
      } finally {
        setIsApplyingAll(false);
      }
    },
    [executeCommandMutation],
  );

  if (weeklyReview === undefined) {
    return <WeeklyReviewSkeleton />;
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

      <AIDraftSection
        aiDraft={aiDraft}
        isGeneratingDraft={isGeneratingDraft}
        onGenerateDraft={generateWeeklyReviewDraft}
      />

      <WeeklyPlanSection
        week={weeklyReview?.week ?? ""}
        weeklyPlanDraft={weeklyPlanDraft}
        isGeneratingPlan={isGeneratingPlan}
        onGeneratePlan={generateWeeklyPlanDraft}
        onApplyDay={applyPlanDay}
        onApplyAllDays={applyAllDays}
        isApplyingDay={applyingDay}
        isApplyingAll={isApplyingAll}
      />

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
});

export default WeeklyReviewScreen;

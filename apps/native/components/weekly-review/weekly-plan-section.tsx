import { Button, Spinner } from "heroui-native";
import React, { useCallback, useState } from "react";
import { View } from "react-native";

import type { WeeklyPlanDraft } from "@/types/weekly-review";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

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

type Props = {
  week: string;
  weeklyPlanDraft: WeeklyPlanDraft | null;
  isGeneratingPlan: boolean;
  onGeneratePlan: (week: string) => Promise<WeeklyPlanActionResult>;
  onApplyDay: (
    day: string,
    focusItems: WeeklyPlanDraft["days"][0]["focusItems"],
  ) => Promise<ApplyDayResult>;
  onApplyAllDays: (days: WeeklyPlanDraft["days"]) => Promise<void>;
  isApplyingDay: string | null;
  isApplyingAll: boolean;
};

export const WeeklyPlanSection = React.memo(function WeeklyPlanSection({
  week,
  weeklyPlanDraft,
  isGeneratingPlan,
  onGeneratePlan,
  onApplyDay,
  onApplyAllDays,
  isApplyingDay,
  isApplyingAll,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [showConfirmApplyAll, setShowConfirmApplyAll] = useState(false);

  const handleGenerate = useCallback(async () => {
    setError(null);
    setShowConfirmApplyAll(false);
    const result = await onGeneratePlan(week);
    if (result.status === "error") {
      setError(result.message);
    }
  }, [week, onGeneratePlan]);

  const handleApplyDay = useCallback(
    async (day: string, focusItems: WeeklyPlanDraft["days"][0]["focusItems"]) => {
      setError(null);
      const result = await onApplyDay(day, focusItems);
      if (result.status === "error") {
        setError(result.message);
      }
    },
    [onApplyDay],
  );

  const handleApplyAllClick = useCallback(() => {
    if (weeklyPlanDraft && weeklyPlanDraft.days.length > 1) {
      setShowConfirmApplyAll(true);
    } else {
      onApplyAllDays(weeklyPlanDraft!.days);
    }
  }, [weeklyPlanDraft, onApplyAllDays]);

  const handleConfirmApplyAll = useCallback(async () => {
    setShowConfirmApplyAll(false);
    setError(null);
    if (weeklyPlanDraft) {
      await onApplyAllDays(weeklyPlanDraft.days);
    }
  }, [weeklyPlanDraft, onApplyAllDays]);

  const handleCancelApplyAll = useCallback(() => {
    setShowConfirmApplyAll(false);
  }, []);

  return (
    <HardCard label="WEEKLY_PLAN" className="mb-6 bg-surface">
      <View className="p-2 gap-4">
        <View className="gap-1">
          <MachineText variant="label" className="text-accent">
            PLAN_DRAFT
          </MachineText>
          <MachineText className="text-xs text-muted">DRAFT_ONLY. APPLY_PER_DAY.</MachineText>
        </View>

        {error && <MachineText className="text-sm text-danger">ERROR: {error}</MachineText>}

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
                      onPress={() => handleApplyDay(dayPlan.day, dayPlan.focusItems)}
                      isDisabled={isApplyingDay === dayPlan.day || isApplyingAll}
                      className="bg-foreground rounded-none"
                    >
                      {isApplyingDay === dayPlan.day ? (
                        <Spinner size="sm" color="white" />
                      ) : (
                        <MachineText className="text-background text-[10px]">APPLY_DAY</MachineText>
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

            {showConfirmApplyAll ? (
              <View className="gap-2 p-3 bg-muted border border-divider">
                <MachineText className="text-sm font-bold">APPLY ALL DAYS?</MachineText>
                <MachineText className="text-xs text-muted">
                  This will set daily plans for all days.
                </MachineText>
                <View className="flex-row gap-2">
                  <Button
                    onPress={handleConfirmApplyAll}
                    isDisabled={isApplyingAll}
                    className="bg-foreground rounded-none flex-1"
                  >
                    <MachineText className="text-background text-xs">CONFIRM</MachineText>
                  </Button>
                  <Button
                    onPress={handleCancelApplyAll}
                    isDisabled={isApplyingAll}
                    className="bg-surface border border-divider rounded-none flex-1"
                  >
                    <MachineText className="text-xs">CANCEL</MachineText>
                  </Button>
                </View>
              </View>
            ) : (
              <Button
                onPress={handleApplyAllClick}
                isDisabled={isApplyingAll}
                className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
              >
                {isApplyingAll ? (
                  <Spinner size="sm" />
                ) : (
                  <MachineText className="font-bold">APPLY_ALL_DAYS</MachineText>
                )}
              </Button>
            )}
          </View>
        ) : (
          <MachineText className="text-sm">NO_PLAN_DRAFT_YET.</MachineText>
        )}
        <Button
          onPress={handleGenerate}
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
  );
});

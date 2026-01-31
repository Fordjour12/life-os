import { Button, Spinner } from "heroui-native";
import { useMemo } from "react";
import { View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type WeeklyReviewFacts = {
  recoveryDays: number;
  balancedDays: number;
  tinyWins: number;
  planResets: number;
};

type WeeklyReview = {
  week: string;
  facts: WeeklyReviewFacts;
  highlights: string[];
  frictionPoints: string[];
  reflectionQuestion: string;
  createdAt: number;
};

type Props = {
  review?: WeeklyReview | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
};

export function WeeklyReviewCard({ review, onGenerate, isGenerating }: Props) {
  const facts = review?.facts;
  const highlights = review?.highlights ?? [];
  const frictionPoints = review?.frictionPoints ?? [];

  const title = review ? `WEEK_${review.week}` : "WEEKLY_REVIEW";
  const summaryNote = "KERNEL_SNAPSHOT_v1.0";

  const highlightText = useMemo(() => {
    if (highlights.length === 0) return "NO_SIGNAL";
    return highlights.join(" ");
  }, [highlights]);

  const frictionText = useMemo(() => {
    if (frictionPoints.length === 0) return "CLEAR_PATH";
    return frictionPoints.join(" ");
  }, [frictionPoints]);

  return (
    <HardCard label="WEEKLY_MIRROR" className="mb-6 bg-surface">
      <View className="gap-4 p-2">
        <View className="gap-1">
          <MachineText variant="header" size="lg">
            {title}
          </MachineText>
          <MachineText className="text-[10px] text-muted">{summaryNote}</MachineText>
        </View>

        {!review && (
          <View className="gap-4">
            <MachineText className="text-sm">READY_TO_GENERATE_CALM_MIRROR.</MachineText>
            <Button
              onPress={onGenerate}
              isDisabled={!onGenerate || isGenerating}
              className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
            >
              {isGenerating ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-background font-bold">GENERATE_REVIEW</MachineText>
              )}
            </Button>
          </View>
        )}

        {review && (
          <View className="gap-6">
            <View className="gap-3">
              <MachineText variant="label" className="text-accent">
                METRICS
              </MachineText>
              <View className="flex-row flex-wrap gap-4">
                <Fact label="RECOVERY_DAYS" value={facts?.recoveryDays ?? 0} />
                <Fact label="BALANCED_DAYS" value={facts?.balancedDays ?? 0} />
                <Fact label="TINY_WINS" value={facts?.tinyWins ?? 0} />
                <Fact label="PLAN_RESETS" value={facts?.planResets ?? 0} />
              </View>
            </View>

            <View className="h-[1px] bg-divider" />

            <View className="gap-2">
              <MachineText variant="label" className="text-accent">
                POSITIVE_SIGNALS
              </MachineText>
              <MachineText className="text-sm">{highlightText}</MachineText>
            </View>

            <View className="gap-2">
              <MachineText variant="label" className="text-accent">
                FRICTION_DETECTED
              </MachineText>
              <MachineText className="text-sm">{frictionText}</MachineText>
            </View>

            <View className="gap-2 p-3 bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]">
              <MachineText variant="label" className="text-accent mb-1">
                GENTLE_PROMPT
              </MachineText>
              <MachineText className="font-bold text-base">{review.reflectionQuestion}</MachineText>
            </View>

            <Button
              onPress={onGenerate}
              isDisabled={!onGenerate || isGenerating}
              className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
            >
              {isGenerating ? (
                <Spinner size="sm" />
              ) : (
                <MachineText className="font-bold">REFRESH_LOGS</MachineText>
              )}
            </Button>
          </View>
        )}
      </View>
    </HardCard>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-[120px] gap-1">
      <MachineText className="text-2xl font-bold">{value}</MachineText>
      <MachineText variant="label" className="text-[10px]">
        {label}
      </MachineText>
    </View>
  );
}

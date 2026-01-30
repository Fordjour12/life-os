import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Spinner } from "heroui-native";
import { useState } from "react";
import { ScrollView, View, SafeAreaView } from "react-native";

import { DriftSignalsCard } from "@/components/drift-signals-card";
import { PatternInsightsCard } from "@/components/pattern-insights-card";
import { WeeklyReviewCard } from "@/components/weekly-review-card";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function WeeklyReviewScreen() {
  const weeklyReview = useQuery(api.identity.weeklyReview.getWeeklyReview, {});
  const patternInsights = useQuery(api.identity.getPatternInsights, { window: "week" });
  const driftSignals = useQuery(api.identity.getDriftSignals, { window: "month" });
  const generateWeeklyReviewMutation = useMutation(api.identity.weeklyReview.generateWeeklyReview);
  const [isGeneratingWeeklyReview, setIsGeneratingWeeklyReview] = useState(false);

  const generateWeeklyReview = async () => {
    setIsGeneratingWeeklyReview(true);
    try {
      await generateWeeklyReviewMutation({});
    } finally {
      setIsGeneratingWeeklyReview(false);
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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6 border-b-2 border-divider pb-2">
          <MachineText variant="label" className="text-accent mb-1">SYSTEM://REVIEW</MachineText>
          <MachineText variant="header" size="2xl">WEEKLY_MIRROR</MachineText>
        </View>

        <WeeklyReviewCard
          review={weeklyReview ?? null}
          onGenerate={generateWeeklyReview}
          isGenerating={isGeneratingWeeklyReview}
        />

        <PatternInsightsCard
          insights={patternInsights ?? null}
          windowLabel="WEEK_WINDOW"
        />

        <DriftSignalsCard
          signals={driftSignals ?? null}
          windowLabel="MONTH_WINDOW"
        />

        <HardCard label="DOCUMENTATION" className="bg-surface">
          <View className="p-2 gap-2">
            <MachineText variant="label" className="text-accent">CORE_LOGIC</MachineText>
            <MachineText className="text-xs">
              THIS_VIEW_IS_DERIVED_FROM_KERNEL_EVENTS_AND_DAILY_STATE_SNAPSHOTS.
              IT_IS_NON_JUDGEMENTAL_INPUT_FOR_SYSTEM_CALIBRATION.
            </MachineText>
          </View>
        </HardCard>
      </ScrollView>
    </SafeAreaView>
  );
}

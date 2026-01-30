import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Spinner } from "heroui-native";
import { useState } from "react";
import { PlatformColor, ScrollView, Text, View } from "react-native";

import { WeeklyReviewCard } from "@/components/weekly-review-card";

export default function WeeklyReviewScreen() {
  const weeklyReview = useQuery(api.identity.weeklyReview.getWeeklyReview, {});
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Spinner size="lg" />
      </View>
    );
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ gap: 6 }}>
        <Text selectable style={{ fontSize: 26, fontWeight: "600", color: PlatformColor("label") }}>
          Weekly Review
        </Text>
        <Text selectable style={{ fontSize: 14, color: PlatformColor("secondaryLabel") }}>
          A calm mirror of your week. Nothing to fix, only notice.
        </Text>
      </View>

      <WeeklyReviewCard
        review={weeklyReview ?? null}
        onGenerate={generateWeeklyReview}
        isGenerating={isGeneratingWeeklyReview}
      />

      <View style={{ gap: 8 }}>
        <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: PlatformColor("secondaryLabel") }}>
          ABOUT THIS VIEW
        </Text>
        <Text selectable style={{ fontSize: 14, color: PlatformColor("label") }}>
          This review is derived from events and daily state. It never labels or judges.
        </Text>
      </View>
    </ScrollView>
  );
}

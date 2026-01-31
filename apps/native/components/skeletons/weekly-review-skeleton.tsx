import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";
import { ScrollView } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";

export function WeeklyReviewSkeleton() {
  return (
    <Container className="pt-6">
      <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-6 px-4">
        <View className="mb-6 border-b-2 border-divider pb-2">
          <SkeletonGroup.Item className="h-3 w-24 rounded-md" />
          <SkeletonGroup.Item className="h-8 w-48 rounded-md mt-1" />
        </View>

        <HardCard label="WEEKLY_REVIEW" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-4 w-32 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-24 rounded-md" />
            <SkeletonGroup.Item className="h-10 w-full rounded-md" />
          </View>
        </HardCard>

        <HardCard label="AI_NARRATIVE" className="mb-6 bg-surface">
          <View className="p-2 gap-4">
            <View className="gap-1">
              <SkeletonGroup.Item className="h-3 w-12 rounded-md" />
              <SkeletonGroup.Item className="h-4 w-32 rounded-md" />
            </View>
            <SkeletonGroup.Item className="h-20 w-full rounded-md" />
            <SkeletonGroup.Item className="h-4 w-48 rounded-md" />
            <SkeletonGroup.Item className="h-4 w-40 rounded-md" />
            <View className="h-16 w-full rounded-md" />
            <SkeletonGroup.Item className="h-10 w-full rounded-md" />
          </View>
        </HardCard>

        <HardCard label="WEEKLY_PLAN" className="mb-6 bg-surface">
          <View className="p-2 gap-4">
            <View className="gap-1">
              <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
              <SkeletonGroup.Item className="h-4 w-32 rounded-md" />
            </View>
            <SkeletonGroup.Item className="h-3 w-48 rounded-md" />
            <View className="gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <View key={`day-${index}`} className="gap-2 border border-divider p-2">
                  <View className="flex-row items-center justify-between">
                    <SkeletonGroup.Item className="h-4 w-16 rounded-md" />
                    <SkeletonGroup.Item className="h-8 w-20 rounded-md" />
                  </View>
                  <View className="gap-1">
                    <SkeletonGroup.Item className="h-4 w-full rounded-md" />
                    <SkeletonGroup.Item className="h-4 w-5/6 rounded-md" />
                  </View>
                  <SkeletonGroup.Item className="h-3 w-40 rounded-md" />
                </View>
              ))}
            </View>
            <SkeletonGroup.Item className="h-10 w-32 rounded-md" />
          </View>
        </HardCard>

        <HardCard label="PATTERN_INSIGHTS" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-4 w-32 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-3 w-5/6 rounded-md" />
            <SkeletonGroup.Item className="h-24 w-full rounded-md" />
          </View>
        </HardCard>

        <HardCard label="DRIFT_SIGNALS" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-4 w-28 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-24 w-full rounded-md" />
          </View>
        </HardCard>
      </SkeletonGroup>
    </Container>
  );
}

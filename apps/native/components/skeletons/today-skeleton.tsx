import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";

export function TodaySkeleton() {
  return (
    <Container className="pt-8">
      <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-6 px-4 pb-10">
        <View className="flex-row justify-between items-end border-b-2 border-divider pb-2">
          <View className="gap-2">
            <SkeletonGroup.Item className="h-3 w-28 rounded-md" />
            <SkeletonGroup.Item className="h-8 w-32 rounded-md" />
          </View>
          <SkeletonGroup.Item className="h-4 w-20 rounded-md" />
        </View>

        <HardCard padding="sm" label="KERNEL SYSTEM STATUS">
          <View className="flex-row flex-wrap justify-between gap-y-4 p-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <View key={`status-${index}`} className="gap-2 min-w-20">
                <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                <SkeletonGroup.Item className="h-6 w-20 rounded-md" />
              </View>
            ))}
          </View>
        </HardCard>

        <HardCard label="DAILY_INTENT" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-4 w-40 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-3 w-5/6 rounded-md" />
            <SkeletonGroup.Item className="h-8 w-28 rounded-md" />
          </View>
        </HardCard>

        <HardCard label="WEEKLY_REVIEW" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-4 w-48 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-3 w-4/5 rounded-md" />
            <SkeletonGroup.Item className="h-8 w-36 rounded-md" />
          </View>
        </HardCard>

        <HardCard label="PATTERN_INSIGHTS" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-3 w-3/4 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-3 w-2/3 rounded-md" />
            <SkeletonGroup.Item className="h-24 w-full rounded-md" />
          </View>
        </HardCard>

        <HardCard label="DRIFT_SIGNALS" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-3 w-2/3 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-24 w-full rounded-md" />
          </View>
        </HardCard>

        <HardCard label="JOURNAL_PROMPT" className="bg-surface">
          <View className="gap-3 p-3">
            <SkeletonGroup.Item className="h-4 w-56 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-full rounded-md" />
            <SkeletonGroup.Item className="h-16 w-full rounded-md" />
            <View className="flex-row gap-3">
              <SkeletonGroup.Item className="h-8 w-24 rounded-md" />
              <SkeletonGroup.Item className="h-8 w-24 rounded-md" />
            </View>
          </View>
        </HardCard>

        <View className="gap-3">
          <SkeletonGroup.Item className="h-3 w-40 rounded-md" />
          {Array.from({ length: 2 }).map((_, index) => (
            <HardCard key={`signal-${index}`} className="bg-surface" label="SIGNAL">
              <View className="gap-3 p-3">
                <SkeletonGroup.Item className="h-4 w-40 rounded-md" />
                <SkeletonGroup.Item className="h-3 w-full rounded-md" />
                <View className="flex-row gap-2">
                  <SkeletonGroup.Item className="h-7 w-20 rounded-md" />
                  <SkeletonGroup.Item className="h-7 w-20 rounded-md" />
                </View>
              </View>
            </HardCard>
          ))}
        </View>

        <View className="gap-4">
          <View className="flex-row justify-between items-end border-b border-divider pb-2">
            <SkeletonGroup.Item className="h-4 w-40 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
          </View>
          <View className="gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <HardCard key={`task-${index}`} padding="sm" className="bg-surface">
                <View className="flex-row items-center justify-between">
                  <View className="gap-2 flex-1">
                    <SkeletonGroup.Item className="h-4 w-48 rounded-md" />
                    <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                  </View>
                  <SkeletonGroup.Item className="h-7 w-14 rounded-md" />
                </View>
              </HardCard>
            ))}
          </View>

          <HardCard label="CMD_LINE_INPUT" className="bg-surface">
            <View className="gap-3">
              <SkeletonGroup.Item className="h-10 w-full rounded-md" />
              <View className="flex-row gap-3">
                <SkeletonGroup.Item className="h-10 flex-1 rounded-md" />
                <SkeletonGroup.Item className="h-10 w-20 rounded-md" />
              </View>
            </View>
          </HardCard>
        </View>
      </SkeletonGroup>
    </Container>
  );
}

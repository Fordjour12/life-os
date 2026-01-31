import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";

export function PlannerSkeleton() {
  return (
    <Container className="pt-6">
      <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-6 px-4">
        <View className="mb-6 border-b-2 border-divider pb-2">
          <SkeletonGroup.Item className="h-8 w-32 rounded-md" />
          <SkeletonGroup.Item className="h-4 w-56 rounded-md mt-1" />
        </View>

        <HardCard padding="sm" label="EVENT SUMMARY">
          <View className="flex-row justify-between p-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <View key={`stat-${index}`} className="items-start">
                <SkeletonGroup.Item className="h-3 w-20 rounded-md" />
                <SkeletonGroup.Item className="h-6 w-12 rounded-md mt-1" />
              </View>
            ))}
          </View>
        </HardCard>

        <HardCard label="EDIT_PLAN" className="gap-4 p-4">
          <View className="gap-1">
            <SkeletonGroup.Item className="h-5 w-32 rounded-md" />
            <SkeletonGroup.Item className="h-4 w-48 rounded-md" />
          </View>

          <View className="gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <HardCard
                key={`focus-${index}`}
                variant="flat"
                padding="sm"
                className="gap-2 bg-surface border-dashed"
              >
                <View>
                  <SkeletonGroup.Item className="h-3 w-20 rounded-md mb-1" />
                  <SkeletonGroup.Item className="h-10 w-full rounded-md" />
                </View>
                <View>
                  <SkeletonGroup.Item className="h-3 w-24 rounded-md mb-1" />
                  <SkeletonGroup.Item className="h-10 w-full rounded-md" />
                </View>
              </HardCard>
            ))}
          </View>

          <View className="flex-row gap-2 flex-wrap">
            <SkeletonGroup.Item className="h-10 w-24 rounded-md" />
            <SkeletonGroup.Item className="h-10 w-20 rounded-md" />
            <SkeletonGroup.Item className="h-10 w-20 rounded-md" />
          </View>
        </HardCard>
      </SkeletonGroup>
    </Container>
  );
}

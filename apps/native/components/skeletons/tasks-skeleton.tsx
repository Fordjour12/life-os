import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";

export function TasksSkeleton() {
  return (
    <Container className="pt-6">
      <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-6 px-4">
        <View className="mb-6 border-b-2 border-divider pb-2">
          <SkeletonGroup.Item className="h-8 w-32 rounded-md" />
          <SkeletonGroup.Item className="h-4 w-48 rounded-md mt-1" />
        </View>

        <HardCard label="CREATE_TASK" className="bg-surface gap-4 p-4">
          <View className="gap-3">
            <View>
              <SkeletonGroup.Item className="h-3 w-20 rounded-md mb-1" />
              <SkeletonGroup.Item className="h-10 w-full rounded-md" />
            </View>
            <View>
              <SkeletonGroup.Item className="h-3 w-24 rounded-md mb-1" />
              <SkeletonGroup.Item className="h-10 w-full rounded-md" />
            </View>
            <SkeletonGroup.Item className="h-10 w-24 rounded-md" />
          </View>
        </HardCard>

        <View>
          <View className="flex-row justify-between items-end mb-2 border-b border-divider pb-1">
            <SkeletonGroup.Item className="h-6 w-32 rounded-md" />
            <SkeletonGroup.Item className="h-3 w-12 rounded-md" />
          </View>

          <View className="gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <HardCard key={`task-${index}`} padding="sm" className="bg-surface">
                <View className="gap-3">
                  <View className="flex-row items-center justify-between">
                    <View className="gap-1 flex-1">
                      <SkeletonGroup.Item className="h-5 w-40 rounded-md" />
                      <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                    </View>
                    <View className="gap-2 items-end">
                      <SkeletonGroup.Item className="h-8 w-16 rounded-md" />
                      <SkeletonGroup.Item className="h-8 w-20 rounded-md" />
                    </View>
                  </View>
                  <View className="gap-2 border border-divider p-2 bg-muted">
                    <SkeletonGroup.Item className="h-3 w-20 rounded-md" />
                    <SkeletonGroup.Item className="h-4 w-full rounded-md" />
                    <SkeletonGroup.Item className="h-3 w-40 rounded-md" />
                    <SkeletonGroup.Item className="h-8 w-20 rounded-md" />
                  </View>
                </View>
              </HardCard>
            ))}
          </View>
        </View>

        <HardCard label="PARKED_TASKS" variant="flat" className="gap-3 p-4 bg-muted">
          <View className="flex-row items-center justify-between">
            <SkeletonGroup.Item className="h-5 w-32 rounded-md" />
            <SkeletonGroup.Item className="h-8 w-16 rounded-md" />
          </View>
          <View className="gap-2 mt-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <HardCard key={`paused-${index}`} padding="sm" className="bg-surface/70">
                <View className="flex-row items-center justify-between">
                  <View className="gap-1 flex-1">
                    <SkeletonGroup.Item className="h-4 w-32 rounded-md" />
                    <SkeletonGroup.Item className="h-3 w-12 rounded-md" />
                  </View>
                  <SkeletonGroup.Item className="h-8 w-16 rounded-md" />
                </View>
              </HardCard>
            ))}
          </View>
        </HardCard>
      </SkeletonGroup>
    </Container>
  );
}

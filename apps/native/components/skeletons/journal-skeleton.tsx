import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";
import { Container } from "@/components/container";

import { HardCard } from "@/components/ui/hard-card";

export function JournalSkeleton() {
  return (
    <Container>
      <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-6 p-4">
        <View className="mb-6 border-b-2 border-divider pb-2">
          <SkeletonGroup.Item className="h-3 w-24 rounded-md" />
          <SkeletonGroup.Item className="h-8 w-32 rounded-md mt-1" />
        </View>

        <View className="mb-6">
          <SkeletonGroup.Item className="h-8 w-28 rounded-md" />
        </View>

        <HardCard label="FILTER_MODULE" className="mb-6 bg-surface">
          <View className="gap-4 p-2">
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonGroup.Item key={`preset-${index}`} className="h-8 w-20 rounded-md" />
              ))}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <SkeletonGroup.Item key={`window-${index}`} className="h-8 w-16 rounded-md" />
              ))}
            </View>
            <View className="flex-row flex-wrap gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonGroup.Item key={`mood-${index}`} className="h-8 w-16 rounded-md" />
              ))}
            </View>
            <View className="h-10 w-full rounded-md" />
            <View className="flex-row gap-2">
              <SkeletonGroup.Item className="h-10 flex-1 rounded-md" />
              <SkeletonGroup.Item className="h-10 w-16 rounded-md" />
            </View>
          </View>
        </HardCard>

        <View className="gap-6">
          {Array.from({ length: 2 }).map((_, dayIndex) => (
            <HardCard
              key={`day-${dayIndex}`}
              label={`DAY_2026-01-${30 - dayIndex}`}
              className="bg-surface"
            >
              <View className="gap-3 p-2">
                <View className="flex-row justify-between items-center opacity-50">
                  <SkeletonGroup.Item className="h-3 w-20 rounded-md" />
                  <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                </View>
                <View className="gap-3">
                  {Array.from({ length: 2 }).map((_, entryIndex) => (
                    <View
                      key={`entry-${entryIndex}`}
                      className="gap-3 bg-muted p-3 border-l-4 border-foreground"
                    >
                      <View className="flex-row justify-between items-center">
                        <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                        <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                      </View>
                      <SkeletonGroup.Item className="h-16 w-full rounded-md" />
                      <SkeletonGroup.Item className="h-8 w-16 rounded-md" />
                    </View>
                  ))}
                </View>
              </View>
            </HardCard>
          ))}
        </View>
      </SkeletonGroup>
    </Container>
  );
}

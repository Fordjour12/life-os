import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";

export function InboxSkeleton() {
  return (
    <Container className="pt-6">
      <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-4 px-4">
        <View className="mb-6 border-b-2 border-divider pb-2">
          <SkeletonGroup.Item className="h-8 w-48 rounded-md" />
          <SkeletonGroup.Item className="h-4 w-64 rounded-md mt-2" />
        </View>

        {Array.from({ length: 3 }).map((_, index) => (
          <HardCard
            key={`suggestion-${index}`}
            label="SIGNAL_DETECTED"
            className="gap-3 p-4 bg-surface"
          >
            <View className="gap-1">
              <SkeletonGroup.Item className="h-6 w-32 rounded-md" />
              <SkeletonGroup.Item className="h-4 w-48 rounded-md" />
            </View>

            <View className="flex-row gap-2 pt-2 border-t border-divider">
              <SkeletonGroup.Item className="h-8 w-20 rounded-md" />
              <SkeletonGroup.Item className="h-8 w-24 rounded-md" />
              <SkeletonGroup.Item className="h-8 w-16 rounded-md" />
            </View>
          </HardCard>
        ))}
      </SkeletonGroup>
    </Container>
  );
}

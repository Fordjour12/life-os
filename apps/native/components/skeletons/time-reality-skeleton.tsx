import { SkeletonGroup } from "heroui-native";
import { View } from "react-native";
import { ScrollView } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";

export function TimeRealitySkeleton() {
  return (
    <Container className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SkeletonGroup isLoading isSkeletonOnly variant="shimmer" className="gap-6">
          <View className="mb-6 flex-row justify-between items-end border-b-2 border-divider pb-2">
            <View>
              <SkeletonGroup.Item className="h-3 w-20 rounded-md" />
              <SkeletonGroup.Item className="h-8 w-40 rounded-md mt-1" />
            </View>
            <View className="items-end gap-2">
              <SkeletonGroup.Item className="h-8 w-8 rounded-md" />
              <SkeletonGroup.Item className="h-4 w-24 rounded-md" />
            </View>
          </View>

          <HardCard label="CALENDAR" className="mb-6">
            <View className="gap-3 p-4">
              <View className="flex-row justify-between items-end">
                <View>
                  <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                  <SkeletonGroup.Item className="h-6 w-24 rounded-md mt-1" />
                </View>
                <View className="items-end">
                  <SkeletonGroup.Item className="h-3 w-20 rounded-md" />
                  <SkeletonGroup.Item className="h-5 w-16 rounded-md mt-1" />
                </View>
              </View>

              <View className="gap-3">
                <View className="flex-row gap-2">
                  <SkeletonGroup.Item className="h-8 flex-1 rounded-md" />
                  <SkeletonGroup.Item className="h-8 w-16 rounded-md" />
                  <SkeletonGroup.Item className="h-8 flex-1 rounded-md" />
                </View>

                <HardCard label="WEEK_STRIP">
                  <View className="gap-2 p-3">
                    <View className="flex-row flex-wrap gap-2">
                      {Array.from({ length: 7 }).map((_, index) => (
                        <SkeletonGroup.Item key={`day-${index}`} className="h-8 w-12 rounded-md" />
                      ))}
                    </View>
                  </View>
                </HardCard>

                <HardCard label="BLOCKS">
                  <View className="gap-3 p-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <View
                        key={`block-${index}`}
                        className="flex-row items-start justify-between border border-divider bg-surface px-3 py-2"
                      >
                        <View className="flex-row items-start flex-1">
                          <SkeletonGroup.Item className="h-16 w-1 rounded-md" />
                          <View className="ml-3 gap-2 flex-1">
                            <SkeletonGroup.Item className="h-4 w-24 rounded-md" />
                            <SkeletonGroup.Item className="h-3 w-32 rounded-md" />
                          </View>
                        </View>
                        <View className="items-end gap-2">
                          <SkeletonGroup.Item className="h-5 w-12 rounded-md" />
                          <View className="flex-row gap-2">
                            <SkeletonGroup.Item className="h-6 w-16 rounded-md" />
                            <SkeletonGroup.Item className="h-6 w-16 rounded-md" />
                            <SkeletonGroup.Item className="h-6 w-14 rounded-md" />
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                </HardCard>

                <SkeletonGroup.Item className="h-10 w-full rounded-md" />
              </View>
            </View>
          </HardCard>

          <HardCard label="TODAY_CAPACITY" className="mb-6">
            <View className="gap-4 p-4">
              <View className="flex-row justify-between items-end">
                <View>
                  <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                  <SkeletonGroup.Item className="h-8 w-20 rounded-md mt-1" />
                  <SkeletonGroup.Item className="h-3 w-24 rounded-md mt-2" />
                  <SkeletonGroup.Item className="h-5 w-16 rounded-md mt-1" />
                </View>
                <View className="items-end gap-2">
                  <SkeletonGroup.Item className="h-3 w-16 rounded-md" />
                  <SkeletonGroup.Item className="h-5 w-12 rounded-md" />
                  <SkeletonGroup.Item className="h-3 w-32 rounded-md mt-2" />
                  <SkeletonGroup.Item className="h-5 w-12 rounded-md mt-1" />
                  <SkeletonGroup.Item className="h-3 w-20 rounded-md mt-2" />
                  <SkeletonGroup.Item className="h-5 w-12 rounded-md mt-1" />
                  <SkeletonGroup.Item className="h-3 w-12 rounded-md mt-2" />
                  <SkeletonGroup.Item className="h-5 w-12 rounded-md mt-1" />
                </View>
              </View>
            </View>
          </HardCard>

          <HardCard label="BLOCKS" className="mb-6">
            <View className="gap-3 p-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <View
                  key={`block-${index}`}
                  className="flex-row items-start justify-between border border-divider bg-surface px-3 py-2"
                >
                  <View className="flex-row items-start flex-1">
                    <SkeletonGroup.Item className="h-12 w-1 rounded-md" />
                    <View className="ml-3 gap-2 flex-1">
                      <SkeletonGroup.Item className="h-4 w-28 rounded-md" />
                      <SkeletonGroup.Item className="h-3 w-36 rounded-md" />
                    </View>
                  </View>
                  <View className="items-end gap-2">
                    <View className="flex-row items-center gap-2">
                      <SkeletonGroup.Item className="h-3 w-2 rounded-full" />
                      <SkeletonGroup.Item className="h-4 w-12 rounded-md" />
                    </View>
                    <View className="flex-row gap-2">
                      <SkeletonGroup.Item className="h-6 w-12 rounded-md" />
                      <SkeletonGroup.Item className="h-6 w-16 rounded-md" />
                      <SkeletonGroup.Item className="h-6 w-16 rounded-md" />
                      <SkeletonGroup.Item className="h-6 w-14 rounded-md" />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </HardCard>

          <HardCard label="ACTION">
            <View className="gap-3 p-4">
              <SkeletonGroup.Item className="h-10 w-full rounded-md" />
            </View>
          </HardCard>
        </SkeletonGroup>
      </ScrollView>
    </Container>
  );
}

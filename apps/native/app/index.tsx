import { api } from "@life-os/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button } from "heroui-native";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { authClient } from "@/lib/auth-client";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { formatLongDate } from "@/lib/date";
import { Container } from "@/components/container";

export default function Home() {
  const healthCheck = useQuery(api.healthCheck.get);
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

  const currentDate = formatLongDate();
  const scanOffset = useSharedValue(0);

  useEffect(() => {
    scanOffset.value = withRepeat(
      withTiming(120, {
        duration: 2400,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [scanOffset]);

  const scanlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanOffset.value }],
    opacity: 0.3,
  }));

  return (
    <Container className="pt-6">
      <View className="relative px-4 pb-10">
        <View className="absolute -right-2 top-10 size-24 border border-divider/60" />
        <View className="absolute right-6 top-28 size-16 border border-divider/40" />

        <Animated.View
          entering={FadeInUp.duration(280)}
          className="pb-6 border-b-2 border-divider mb-8 relative"
        >
          <Animated.View
            pointerEvents="none"
            style={scanlineStyle}
            className="absolute left-0 right-0 top-0 h-0.5 bg-accent/20"
          />
          <MachineText variant="label" className="text-accent mb-2">
            SYSTEM://BOOT
          </MachineText>
          <MachineText variant="header" size="2xl">
            LIFE_OS
          </MachineText>
          <MachineText variant="label" className="mt-2">
            {currentDate}
          </MachineText>
        </Animated.View>

        <View className="gap-8">
          <Animated.View entering={FadeInUp.duration(300).delay(40)}>
            <HardCard label="BOOT_SEQUENCE" className="bg-surface">
              <View className="p-3 gap-3">
                <MachineText variant="header" size="lg">
                  RECOVERY_FIRST SYSTEM
                </MachineText>
                <MachineText className="text-xs text-muted-foreground">
                  PROPOSE, REVIEW, EXECUTE. ACTIONS REQUIRE YOUR APPROVAL.
                </MachineText>
                <View className="flex-row flex-wrap gap-2">
                  <View className="border border-foreground px-2 py-1">
                    <MachineText className="text-[10px]">
                      GENTLE_BY_DEFAULT
                    </MachineText>
                  </View>
                  <View className="border border-foreground px-2 py-1">
                    <MachineText className="text-[10px]">
                      EVENTS_AS_TRUTH
                    </MachineText>
                  </View>
                  <View className="border border-foreground px-2 py-1">
                    <MachineText className="text-[10px]">
                      REST_IS_VALID
                    </MachineText>
                  </View>
                </View>
              </View>
            </HardCard>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(300).delay(80)}>
            <HardCard label="SYSTEM_STATUS" className="bg-surface">
              <View className="p-3 gap-2">
                <View className="flex-row items-center gap-2">
                  <View
                    className={`size-3 border border-foreground ${
                      healthCheck === "OK" ? "bg-success" : "bg-danger"
                    }`}
                  />
                  <MachineText className="font-bold">
                    {healthCheck === "OK" ? "OPERATIONAL" : "DISCONNECTED"}
                  </MachineText>
                </View>
                <MachineText className="text-xs text-muted-foreground">
                  KERNEL LISTENING FOR EVENTS.
                </MachineText>
              </View>
            </HardCard>
          </Animated.View>

          {user ? (
            <Animated.View entering={FadeInUp.duration(320).delay(120)}>
              <HardCard label="IDENTITY_MODULE" className="bg-surface">
                <View className="gap-4 p-3">
                  <View>
                    <MachineText variant="label" className="mb-1">
                      USER_ID
                    </MachineText>
                    <MachineText className="text-xl font-bold">
                      {user.name}
                    </MachineText>
                    <MachineText className="text-xs text-muted">
                      {user.email}
                    </MachineText>
                  </View>

                  <Button
                    onPress={() => authClient.signOut()}
                    className="w-full bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
                  >
                    <MachineText className="text-background font-bold">
                      TERMINATE_SESSION
                    </MachineText>
                  </Button>
                </View>
              </HardCard>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInUp.duration(320).delay(120)}>
              <HardCard label="ACCESS_CONTROL" className="bg-surface">
                <View className="gap-4 p-3">
                  <View>
                    <MachineText variant="header">
                      AUTHENTICATION_REQUIRED
                    </MachineText>
                    <MachineText className="text-xs text-muted-foreground mt-1">
                      IDENTIFY TO ACCESS KERNEL DATA.
                    </MachineText>
                  </View>

                  <View className="gap-3">
                    <Link href="/sign-in" asChild>
                      <Button className="bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12">
                        <MachineText className="text-background font-bold">
                          INITIATE_SESSION
                        </MachineText>
                      </Button>
                    </Link>

                    <Link href="/sign-up" asChild>
                      <Button className="bg-surface border border-foreground rounded-none shadow-[4px_4px_0px_var(--color-foreground)] h-12">
                        <MachineText className="font-bold">
                          CREATE_IDENTITY
                        </MachineText>
                      </Button>
                    </Link>
                  </View>
                </View>
              </HardCard>
            </Animated.View>
          )}
        </View>
      </View>
    </Container>
  );
}

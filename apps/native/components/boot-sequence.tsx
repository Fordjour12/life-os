import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  Extrapolation,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";
import { useAuth } from "@/contexts/auth-context";

const BOOT_DURATION_MS = 2600;
export const BOOT_MIN_DURATION_MS = 2800;
const SEGMENT_COUNT = 12;

const BOOT_STEPS = [
  "INIT_KERNEL",
  "LOAD_MODULES",
  "SYNC_EVENTS",
  "READY_FOR_INPUT",
];

function BootSegment({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const start = index / SEGMENT_COUNT;
    const end = (index + 1) / SEGMENT_COUNT;
    const opacity = interpolate(
      progress.value,
      [start, end],
      [0.2, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <Animated.View
      style={style}
      className="h-2 flex-1 bg-foreground border border-divider"
    />
  );
}

function BootStep({
  step,
  index,
  progress,
}: {
  step: string;
  index: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      progress.value,
      [index * 0.2, index * 0.2 + 0.2],
      [0.2, 1],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Animated.View style={style}>
      <MachineText className="text-xs">{step}</MachineText>
    </Animated.View>
  );
}

function useBootAnimation() {
  const progress = useSharedValue(0);
  const scanOffset = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: BOOT_DURATION_MS,
      easing: Easing.out(Easing.quad),
    });
    scanOffset.value = withRepeat(
      withTiming(140, {
        duration: 2400,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [progress, scanOffset]);

  return { progress, scanOffset };
}

type BootSequenceProps = {
  onComplete?: () => void;
};

type BootSequenceViewProps = {
  progress: SharedValue<number>;
  scanOffset: SharedValue<number>;
};

export function BootSequenceView({ progress, scanOffset }: BootSequenceViewProps) {
  const scanlineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scanOffset.value }],
    opacity: 0.25,
  }));

  return (
    <Container className="flex-1 bg-background">
      <View className="flex-1 px-6 py-8 justify-between">
        <Animated.View entering={FadeInUp.duration(260)}>
          <MachineText variant="label" className="text-accent/40 mb-2">
            SYSTEM://BOOT
          </MachineText>
          <MachineText variant="header" size="2xl">
            LIFE_OS
          </MachineText>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(320).delay(80)}>
          <HardCard label="BOOT_SEQUENCE" className="bg-surface">
            <View className="p-4 gap-4 relative">
              <Animated.View
                pointerEvents="none"
                style={scanlineStyle}
                className="absolute left-4 right-4 top-0 h-0.5 bg-accent/20"
              />

              <View className="gap-2">
                {BOOT_STEPS.map((step, index) => (
                  <BootStep
                    key={step}
                    step={step}
                    index={index}
                    progress={progress}
                  />
                ))}
              </View>

              <View className="gap-2">
                <MachineText variant="label" className="text-muted">
                  PROGRESS
                </MachineText>
                <View className="flex-row gap-1">
                  {Array.from({ length: SEGMENT_COUNT }).map((_, index) => (
                    <BootSegment
                      key={`seg-${index}`}
                      index={index}
                      progress={progress}
                    />
                  ))}
                </View>
              </View>
            </View>
          </HardCard>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(320).delay(160)}>
          <View className="border border-divider px-3 py-2 bg-surface">
            <MachineText className="text-xs text-muted">
              READYING LOCAL-FIRST CONTEXT.
            </MachineText>
          </View>
        </Animated.View>
      </View>
    </Container>
  );
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const router = useRouter();
  const { refreshSession, hasHydrated, user } = useAuth();
  const { progress, scanOffset } = useBootAnimation();
  const [minDurationDone, setMinDurationDone] = useState(false);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setMinDurationDone(true);
    }, BOOT_MIN_DURATION_MS);

    return () => clearTimeout(timeout);
  }, []);

  const targetRoute = useMemo(() => (user ? "/(tabs)" : "/"), [user]);

  useEffect(() => {
    if (hasHydrated && minDurationDone) {
      router.replace(targetRoute);
      onComplete?.();
    }
  }, [hasHydrated, minDurationDone, onComplete, router, targetRoute]);

  return <BootSequenceView progress={progress} scanOffset={scanOffset} />;
}

export { useBootAnimation };

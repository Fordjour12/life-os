import React from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from "react-native-reanimated";
import { MachineText } from "./machine-text";

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string; // Optional side label
}

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 24;
const THUMB_SIZE = 20;
const PADDING = 2;

export function ToggleSwitch({ value, onValueChange, label }: ToggleSwitchProps) {
  const offset = useSharedValue(value ? 1 : 0);

  // Update shared value when prop changes
  React.useEffect(() => {
    offset.value = withSpring(value ? 1 : 0, {
      mass: 0.5,
      damping: 15,
      stiffness: 120,
    });
  }, [value]);

  const animatedTrackStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(offset.value, [0, 1], ["#E7E2DA", "#F85242"]);
    return { backgroundColor };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const translateX = offset.value * (TRACK_WIDTH - THUMB_SIZE - PADDING * 2);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <Pressable onPress={() => onValueChange(!value)} className="flex-row items-center gap-3">
      {label && <MachineText variant="label">{label}</MachineText>}
      <Animated.View
        style={[
          {
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderWidth: 1,
            borderColor: "#1B1916",
            justifyContent: "center",
            padding: PADDING,
          },
          animatedTrackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              backgroundColor: value ? "#F8F6F4" : "#1B1916",
              borderWidth: 1,
              borderColor: value ? "#1B1916" : "transparent",
            },
            animatedThumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

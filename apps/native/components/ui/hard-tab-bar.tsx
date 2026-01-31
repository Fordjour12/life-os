import { View, Pressable } from "react-native";
import { MachineText } from "./machine-text";
import { Ionicons } from "@expo/vector-icons";
import { useSemanticColors } from "@/lib/theme";

export function HardTabBar({ state, descriptors, navigation }: any) {
  return (
    <View className="flex-row border-t border-divider bg-surface pb-4 pt-2 px-2 gap-2 h-20 items-center justify-center">
      {state.routes.map(
        (
          route: {
            key: string;
            name: string;
            params?: Record<string, unknown>;
          },
          index: number,
        ) => {
          const { options } = descriptors[route.key];
          const label =
            options.tabBarLabel !== undefined
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : route.name;

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          // Icon mapping (simplified for this custom bar)
          let iconName: keyof typeof Ionicons.glyphMap = "square";
          if (route.name === "index") iconName = "grid";
          if (route.name === "planner") iconName = "compass";
          if (route.name === "tasks") iconName = "checkmark-circle";
          if (route.name === "inbox") iconName = "mail";
          if (route.name === "time-reality") iconName = "time";
          if (route.name === "journal") iconName = "book";
          if (route.name === "weekly-review") iconName = "infinite";

          const colors = useSemanticColors();

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              className={`flex-1 items-center justify-center py-2 h-14 border border-divider ${isFocused ? "bg-accent shadow-none translate-y-0.5" : "bg-surface shadow-[2px_2px_0px_var(--color-foreground)]"}`}
              style={({ pressed }) =>
                pressed ? { transform: [{ translateY: 2 }], boxShadow: "none" } : {}
              }
            >
              <Ionicons
                name={iconName}
                size={20}
                color={isFocused ? colors.foreground : colors.foreground}
                style={{ marginBottom: 2 }}
              />
              <MachineText
                variant="label"
                className={`text-[6px] ${isFocused ? "text-accent-foreground" : "text-foreground"}`}
              >
                {label as string}
              </MachineText>
            </Pressable>
          );
        },
      )}
    </View>
  );
}

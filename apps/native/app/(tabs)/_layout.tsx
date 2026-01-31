import { Tabs } from "expo-router";
import { HardTabBar } from "@/components/ui/hard-tab-bar";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <HardTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "SYSTEM",
        }}
      />
      <Tabs.Screen
        name="planner"
        options={{
          title: "PLANNER",
        }}
      />
      <Tabs.Screen
        name="time-reality"
        options={{
          title: "TIME",
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "JOURNAL",
          headerShown: false,
          tabBarIcon: ({ color, size }: { color: string; size: number }) => (
            <Ionicons name="book" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "EXEC",
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: "INPUT",
        }}
      />

      <Tabs.Screen
        name="weekly-review"
        options={{
          title: "REVIEW",
        }}
      />
    </Tabs>
  );
}

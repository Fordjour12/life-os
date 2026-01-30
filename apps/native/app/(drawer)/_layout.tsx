import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { useThemeColor } from "heroui-native";
import React, { useCallback } from "react";
import { Pressable, View } from "react-native";

import { ThemeToggle } from "@/components/theme-toggle";
import { MachineText } from "@/components/ui/machine-text";

function DrawerLayout() {
  const themeColorBackground = useThemeColor("background");

  const renderThemeToggle = useCallback(() => <ThemeToggle />, []);

  return (
    <Drawer
      screenOptions={{
        headerTintColor: "#111111", // Technical Black
        headerStyle: {
          backgroundColor: "#EBEBE8", // Engineering Off-White
          borderBottomWidth: 1,
          borderBottomColor: "#111111", // Hard border
          shadowOpacity: 0, // No soft shadow
          elevation: 0,
        },
        headerTitleStyle: {
          fontFamily: "Menlo",
          fontWeight: "bold",
          color: "#111111",
        },
        headerTitle: (props) => (
          <MachineText variant="header" size="lg">{props.children}</MachineText>
        ),
        headerRight: renderThemeToggle,
        drawerStyle: {
          backgroundColor: "#E0E0DE", // Slightly darker specific
          borderRightWidth: 1,
          borderRightColor: "#111111",
          width: 250,
        },
        drawerActiveBackgroundColor: "#FF5800", // Signal Orange
        drawerActiveTintColor: "#FFFFFF",
        drawerInactiveTintColor: "#111111",
        drawerItemStyle: {
          borderRadius: 0, // Sharp corners
          borderWidth: 1,
          borderColor: "transparent",
          marginVertical: 4,
        }
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          headerTitle: "ROOT_ACCESS",
          drawerLabel: ({ color, focused }) => (
            <MachineText style={{ color, fontFamily: 'Menlo', fontWeight: 'bold' }}>ROOT_ACCESS</MachineText>
          ),
          drawerIcon: ({ size, color, focused }) => (
            <Ionicons
              name="terminal-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Drawer.Screen
        name="(tabs)"
        options={{
          headerTitle: "SYSTEM_MONITOR",
          drawerLabel: ({ color, focused }) => (
            <MachineText style={{ color, fontFamily: 'Menlo', fontWeight: 'bold' }}>SYSTEM_MONITOR</MachineText>
          ),
          drawerIcon: ({ size, color, focused }) => (
            <MaterialIcons
              name="grid-view"
              size={size}
              color={color}
            />
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-4 mr-4">
              <Link href="/modal" asChild>
                <Pressable className="bg-white border border-black w-8 h-8 items-center justify-center shadow-[2px_2px_0px_black]">
                  <Ionicons name="information-variant" size={20} color="black" />
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />
    </Drawer>
  );
}

export default DrawerLayout;

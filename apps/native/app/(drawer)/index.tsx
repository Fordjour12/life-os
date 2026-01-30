import { api } from "@life-os/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Button } from "heroui-native";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";
import { GlassCard } from "@/components/ui/glass-card";
import { H1, H2, Body, Caption, Label } from "@/components/ui/typography";

export default function Home() {
  const healthCheck = useQuery(api.healthCheck.get);
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <SafeAreaView className="flex-1 bg-background px-4">
      <View className="py-6">
        <H1 className="mb-0">Life OS</H1>
        <Caption>{currentDate}</Caption>
      </View>

      <View className="gap-6">
        {/* Status Card */}
        <GlassCard variant="highlight" intensity={80}>
          <Label className="mb-2">System Status</Label>
          <View className="flex-row items-center gap-2 mb-2">
            <View className={`w-2 h-2 rounded-full ${healthCheck === "OK" ? "bg-success" : "bg-danger"}`} />
            <H2 className="mb-0">
              {healthCheck === "OK" ? "Operational" : "Disconnected"}
            </H2>
          </View>
          <Body className="opacity-80">
            Kernel is listening for events.
          </Body>
        </GlassCard>

        {/* User Context */}
        {user ? (
          <GlassCard intensity={40}>
            <View className="gap-4">
              <View>
                <Label className="mb-1">Identity</Label>
                <H2 className="text-xl">{user.name}</H2>
                <Caption>{user.email}</Caption>
              </View>

              <Button

                onPress={() => authClient.signOut()}
                className="w-full"
              >
                Sign Out
              </Button>
            </View>
          </GlassCard>
        ) : (
          <GlassCard intensity={60}>
            <View className="gap-4">
              <View>
                <H2>Authentication</H2>
                <Body>Sign in to access your Life OS kernel data.</Body>
              </View>
              <SignIn />
              <View className="items-center">
                <Caption>or</Caption>
              </View>
              <SignUp />
            </View>
          </GlassCard>
        )}
      </View>
    </SafeAreaView>
  );
}

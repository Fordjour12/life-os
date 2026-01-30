import { api } from "@life-os/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Button } from "heroui-native";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function Home() {
  const healthCheck = useQuery(api.healthCheck.get);
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).toUpperCase();

  return (
    <SafeAreaView className="flex-1 bg-background px-4">
      <View className="py-6 border-b-2 border-primary/20 mb-6">
        <MachineText variant="header" size="2xl" className="mb-0">LIFE_OS</MachineText>
        <MachineText variant="label">{currentDate}</MachineText>
      </View>

      <View className="gap-6">
        {/* Status Card */}
        <HardCard variant="default" className="bg-[#E0E0DE] border-primary" label="SYSTEM_STATUS">
          <View className="p-2 gap-2">
            <View className="flex-row items-center gap-2">
              <View className={`w-3 h-3 border border-black ${healthCheck === "OK" ? "bg-[#32CD32]" : "bg-[#FF0000]"}`} />
              <MachineText className="font-bold">
                {healthCheck === "OK" ? "OPERATIONAL" : "DISCONNECTED"}
              </MachineText>
            </View>
            <MachineText className="text-xs text-muted">
              KERNEL LISTENING FOR EVENTS.
            </MachineText>
          </View>
        </HardCard>

        {/* User Context */}
        {user ? (
          <HardCard label="IDENTITY_MODULE" className="bg-white">
            <View className="gap-4 p-2">
              <View>
                <MachineText variant="label" className="mb-1">USER_ID</MachineText>
                <MachineText className="text-xl font-bold">{user.name}</MachineText>
                <MachineText className="text-xs text-muted">{user.email}</MachineText>
              </View>

              <Button
                onPress={() => authClient.signOut()}
                className="w-full bg-black rounded-none shadow-[2px_2px_0px_#FF5800]"
                radius="none"
              >
                <MachineText className="text-white font-bold">TERMINATE_SESSION</MachineText>
              </Button>
            </View>
          </HardCard>
        ) : (
          <HardCard label="ACCESS_CONTROL" className="bg-white">
            <View className="gap-4 p-2">
              <View>
                <MachineText variant="header">AUTHENTICATION_REQUIRED</MachineText>
                <MachineText className="text-xs text-muted mt-1">
                  PLEASE IDENTIFY TO ACCESS KERNEL DATA.
                </MachineText>
              </View>

              {/* Wrappers for Auth components to ensure they likely render cleanly, 
                  though delving into text inputs inside them might require component refactor 
              */}
              <View className="p-2 border border-black/10 bg-[#FAFAFA]">
                <SignIn />
              </View>

              <View className="items-center">
                <MachineText variant="label">-- OR --</MachineText>
              </View>

              <View className="p-2 border border-black/10 bg-[#FAFAFA]">
                <SignUp />
              </View>
            </View>
          </HardCard>
        )}
      </View>
    </SafeAreaView>
  );
}

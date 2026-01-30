import { api } from "@life-os/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Button } from "heroui-native";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { authClient } from "@/lib/auth-client";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";

export default function Home() {
  const healthCheck = useQuery(api.healthCheck.get);
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

  const currentDate = new Date()
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <Container className="pt-6">
      <View className="py-6 border-b-2 border-divider mb-6 ">
        <MachineText variant="header" size="2xl" className="mb-0">
          LIFE_OS
        </MachineText>
        <MachineText variant="label">{currentDate}</MachineText>
      </View>

      <View className="gap-6">
        {/* Status Card */}
        <HardCard
          variant="default"
          className="bg-surface border-divider"
          label="SYSTEM_STATUS"
        >
          <View className="p-2 gap-2">
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

        {/* User Context */}
        {user ? (
          <HardCard label="IDENTITY_MODULE" className="bg-surface">
            <View className="gap-4 p-2">
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
        ) : (
          <HardCard label="ACCESS_CONTROL" className="bg-surface">
            <View className="gap-4 p-2">
              <View>
                <MachineText variant="header">
                  AUTHENTICATION_REQUIRED
                </MachineText>
                <MachineText className="text-xs text-muted mt-1">
                  PLEASE IDENTIFY TO ACCESS KERNEL DATA.
                </MachineText>
              </View>
            </View>
          </HardCard>
        )}
      </View>
    </Container>
  );
}

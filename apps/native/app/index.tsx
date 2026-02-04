import { api } from "@life-os/backend/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { Link } from "expo-router";
import { Button } from "heroui-native";
import { View } from "react-native";

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

  return (
    <Container className="pt-6">
      <View className="px-4 pb-10 gap-6">
        <View className="border-b-2 border-divider pb-4">
          <MachineText variant="label" className="text-accent mb-2">
            SYSTEM://HOME
          </MachineText>
          <MachineText variant="header" size="2xl">
            LIFE_OS
          </MachineText>
          <MachineText variant="label" className="mt-2">
            {currentDate}
          </MachineText>
        </View>

        <HardCard label="SYSTEM_STATUS" className="bg-surface">
          <View className="p-3 flex-row items-center justify-between">
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
            <MachineText className="text-xs text-muted-foreground">EVENT_STREAM</MachineText>
          </View>
        </HardCard>

        {user ? (
          <HardCard label="IDENTITY_MODULE" className="bg-surface">
            <View className="gap-4 p-3">
              <View>
                <MachineText variant="label" className="mb-1">
                  USER_ID
                </MachineText>
                <MachineText className="text-xl font-bold">{user.name}</MachineText>
                <MachineText className="text-xs text-muted">{user.email}</MachineText>
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
            <View className="gap-4 p-3">
              <View className="gap-1">
                <MachineText variant="header">AUTHENTICATION_REQUIRED</MachineText>
                <MachineText className="text-xs text-muted-foreground">
                  Reason: identity gates kernel state.
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
                    <MachineText className="font-bold">CREATE_IDENTITY</MachineText>
                  </Button>
                </Link>
              </View>

              <View className="flex-row flex-wrap gap-2 pt-2 border-t border-divider">
                <View className="border border-foreground px-2 py-1">
                  <MachineText className="text-[10px]">GENTLE_BY_DEFAULT</MachineText>
                </View>
                <View className="border border-foreground px-2 py-1">
                  <MachineText className="text-[10px]">EVENTS_AS_TRUTH</MachineText>
                </View>
                <View className="border border-foreground px-2 py-1">
                  <MachineText className="text-[10px]">REST_IS_VALID</MachineText>
                </View>
              </View>
            </View>
          </HardCard>
        )}
      </View>
    </Container>
  );
}

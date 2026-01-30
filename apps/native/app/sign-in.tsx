import { Link, Stack } from "expo-router";
import { Button } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { MachineText } from "@/components/ui/machine-text";

export default function SignInScreen() {
  const currentDate = new Date()
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();

  return (
    <Container className="bg-background">
      <View className="flex-1 px-4 pt-6 pb-10 gap-6">
        <View className="pb-4 border-b-2 border-divider">
          <MachineText variant="header" size="2xl" className="mb-1">
            SESSION_GATE
          </MachineText>
          <MachineText variant="label">{currentDate}</MachineText>
        </View>

        <View className="gap-4">
          <SignIn />

          <View className="items-center">
            <MachineText variant="label">-- OR --</MachineText>
          </View>

          <Link href="/sign-up" asChild>
            <Button className="bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12">
              <MachineText className="text-background font-bold">
                CREATE_NEW_IDENTITY
              </MachineText>
            </Button>
          </Link>
        </View>
      </View>
    </Container>
  );
}

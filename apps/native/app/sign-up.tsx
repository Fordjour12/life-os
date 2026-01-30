import { Link, Stack } from "expo-router";
import { Button } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { SignUp } from "@/components/sign-up";
import { MachineText } from "@/components/ui/machine-text";
import { formatLongDate } from "@/lib/date";

export default function SignUpScreen() {
  const currentDate = formatLongDate();

  return (
    <Container className="bg-background">
      <View className="flex-1 px-4 pt-6 pb-10 gap-6">
        <View className="pb-4 border-b-2 border-divider">
          <MachineText variant="header" size="2xl" className="mb-1">
            IDENTITY_PROVISIONING
          </MachineText>
          <MachineText variant="label">{currentDate}</MachineText>
        </View>

        <View className="gap-4">
          <SignUp />

          <View className="items-center">
            <MachineText variant="label">-- OR --</MachineText>
          </View>

          <Link href="/sign-in" asChild>
            <Button className="bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)] h-12">
              <MachineText className="text-background font-bold">
                USE_EXISTING_ID
              </MachineText>
            </Button>
          </Link>
        </View>
      </View>
    </Container>
  );
}

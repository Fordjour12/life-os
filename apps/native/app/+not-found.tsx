import { Link, Stack } from "expo-router";
import { Button } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "ERROR_404" }} />
      <Container className="bg-background flex-1 justify-center items-center">
        <HardCard
          label="ERR_404"
          variant="default"
          className="w-[80%] max-w-sm bg-surface p-6 items-center"
        >
          <MachineText variant="header" size="2xl" className="mb-2">
            LOST_SIGNAL
          </MachineText>
          <MachineText className="text-muted text-xs text-center mb-6 font-mono">
            THE COORDINATES YOU REQUESTED DO NOT EXIST IN THIS SECTOR.
          </MachineText>

          <Link href="/" asChild>
            <Button
              size="lg"
              className="rounded-none bg-foreground shadow-[2px_2px_0px_var(--color-accent)]"
            >
              <MachineText className="text-background font-bold">RETURN_TO_BASE</MachineText>
            </Button>
          </Link>
        </HardCard>
      </Container>
    </>
  );
}

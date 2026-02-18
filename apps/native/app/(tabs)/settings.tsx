import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function SettingsScreen() {
  const plannerPrefs = useQuery(api.kernel.commands.getPlannerPrefs, {});
  const setPlannerHardMode = useMutation(api.kernel.commands.setPlannerHardMode);
  const [isSavingPlannerPrefs, setIsSavingPlannerPrefs] = useState(false);

  const hardModeEnabled = plannerPrefs?.weeklyPlannerHardMode ?? false;

  const togglePlannerHardMode = async () => {
    setIsSavingPlannerPrefs(true);
    try {
      await setPlannerHardMode({ enabled: !hardModeEnabled });
    } finally {
      setIsSavingPlannerPrefs(false);
    }
  };

  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="label" className="text-accent mb-1">
          SYSTEM://SETTINGS
        </MachineText>
        <MachineText variant="header" size="2xl">
          SETTINGS
        </MachineText>
      </View>

      <HardCard className="mb-6" padding="sm" label="PLANNER">
        <View className="gap-3 p-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <MachineText variant="label" className="text-[10px]">
                WEEKLY PLANNER HARD MODE
              </MachineText>
              <MachineText className="text-xs text-muted">
                Auto-attaches weekly AI plan days, including conflict-resolved days.
              </MachineText>
            </View>
            <MachineText variant="value" className="text-sm">
              {hardModeEnabled ? "ON" : "OFF"}
            </MachineText>
          </View>
          <Button
            size="sm"
            onPress={togglePlannerHardMode}
            isDisabled={isSavingPlannerPrefs}
            className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
          >
            {isSavingPlannerPrefs ? (
              <Spinner size="sm" />
            ) : (
              <MachineText className="text-xs font-bold text-foreground">
                {hardModeEnabled ? "DISABLE_HARD_MODE" : "ENABLE_HARD_MODE"}
              </MachineText>
            )}
          </Button>
        </View>
      </HardCard>
    </Container>
  );
}

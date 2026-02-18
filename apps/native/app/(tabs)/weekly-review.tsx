import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function WeeklyReviewScreen() {
  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="label" className="text-accent mb-1">
          SYSTEM://REVIEW
        </MachineText>
        <MachineText variant="header" size="2xl">
          WEEKLY_MIRROR
        </MachineText>
      </View>

      <HardCard label="MODULE_STATUS" className="bg-surface">
        <View className="p-3 gap-2">
          <MachineText className="text-sm font-bold">WEEKLY_REVIEW_REMOVED</MachineText>
          <MachineText className="text-xs text-muted">
            THIS_TAB_WAS_CLEANED_UP_BECAUSE_REVIEW_AND_IDENTITY_APIS_ARE_NOT_AVAILABLE.
          </MachineText>
        </View>
      </HardCard>
    </Container>
  );
}

import { SafeAreaView, View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

export default function JournalScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="p-4">
        <View className="mb-6 border-b-2 border-divider pb-2">
          <MachineText variant="label" className="text-accent mb-1">
            SYSTEM://JOURNAL
          </MachineText>
          <MachineText variant="header" size="2xl">
            LOGS
          </MachineText>
        </View>

        <HardCard label="MODULE_STATUS" className="bg-surface">
          <View className="p-3 gap-2">
            <MachineText className="text-sm font-bold">JOURNAL_MODULE_REMOVED</MachineText>
            <MachineText className="text-xs text-muted">
              THIS_TAB_WAS_CLEANED_UP_BECAUSE_THE_IDENTITY_API_IS_NOT_AVAILABLE.
            </MachineText>
          </View>
        </HardCard>
      </View>
    </SafeAreaView>
  );
}

import { View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type DriftSignal = {
  id: string;
  type: "CHAOS" | "OVERLOAD_LOOP" | "AVOIDANCE";
  observation: string;
  suggestion?: string;
};

type Props = {
  signals?: DriftSignal[] | null;
  windowLabel?: string;
};

export function DriftSignalsCard({ signals, windowLabel }: Props) {
  const items = signals ?? [];
  const label = windowLabel ?? "MONTH_WINDOW";

  return (
    <HardCard label="DRIFT_SCAN" className="mb-6 bg-surface">
      <View className="gap-4 p-2">
        <View className="gap-1">
          <MachineText variant="label" className="text-accent">
            LIGHT_SIGNALS
          </MachineText>
          <MachineText className="text-[10px] text-muted">{label}</MachineText>
        </View>

        {items.length === 0 ? (
          <MachineText className="text-sm">NO_DRIFT_SIGNALS.</MachineText>
        ) : (
          <View className="gap-4">
            {items.map((item) => (
              <View key={item.id} className="gap-2 border border-divider bg-muted p-3">
                <MachineText className="text-sm">{item.observation}</MachineText>
                {item.suggestion ? (
                  <MachineText className="text-[10px] text-muted">
                    {item.suggestion}
                  </MachineText>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </HardCard>
  );
}

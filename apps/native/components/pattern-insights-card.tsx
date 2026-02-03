import { View } from "react-native";
import React from "react";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type PatternInsight = {
  id: string;
  window: "week" | "month";
  signal: string;
  observation: string;
  confidence: "low" | "medium";
  evidenceCount: number;
};

type Props = {
  insights?: PatternInsight[] | null;
  windowLabel?: string;
};

export const PatternInsightsCard = React.memo(function PatternInsightsCard({
  insights,
  windowLabel,
}: Props) {
  const items = insights ?? [];
  const label = windowLabel ?? "WEEK_WINDOW";

  return (
    <HardCard label="PATTERN_MIRROR" className="mb-6 bg-surface">
      <View className="gap-4 p-2">
        <View className="gap-1">
          <MachineText variant="label" className="text-accent">
            OBSERVATIONS
          </MachineText>
          <MachineText className="text-[10px] text-muted-foreground/40">{label}</MachineText>
        </View>

        {items.length === 0 ? (
          <MachineText className="text-sm">NO_SIGNAL_YET.</MachineText>
        ) : (
          <View className="gap-4">
            {items.map((item) => (
              <View key={item.id} className="gap-2 border border-divider bg-surface p-3">
                <MachineText className="text-sm">{item.observation}</MachineText>
                <View className="flex-row gap-4">
                  <MachineText className="text-[10px] text-muted">
                    CONFIDENCE: {item.confidence.toUpperCase()}
                  </MachineText>
                  <MachineText className="text-[10px] text-muted">
                    EVIDENCE: {item.evidenceCount}
                  </MachineText>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </HardCard>
  );
});

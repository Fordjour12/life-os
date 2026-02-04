import { Button } from "heroui-native";
import { View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { useKernel } from "@/lib/kernel-provider";

function formatActionType(type: string) {
  return type.replace("SUGGEST_", "").replace(/_/g, " ");
}

export function SuggestionInbox() {
  const { suggestions, appendEvent, executeKernelCommand } = useKernel();

  if (!suggestions.length) return null;

  return (
    <HardCard label="SUGGESTIONS" className="gap-3 p-3">
      <MachineText className="text-xs text-muted">
        Reason: suggestions are proposals, not actions.
      </MachineText>
      <View className="gap-3">
        {suggestions.map((suggestion) => (
          <HardCard
            key={suggestion.id}
            variant="flat"
            padding="sm"
            className="gap-2 border-dashed bg-surface"
          >
            <View className="gap-1">
              <MachineText className="font-bold">
                {formatActionType(suggestion.type)}
              </MachineText>
              <MachineText className="text-xs text-muted">{suggestion.reason.detail}</MachineText>
            </View>
            <View className="flex-row gap-2 flex-wrap">
              <Button
                size="sm"
                className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
                onPress={() =>
                  executeKernelCommand({
                    cmd: "accept_suggestion",
                    input: { suggestionId: suggestion.id },
                  })
                }
              >
                <MachineText className="text-background font-bold text-[10px]">
                  ACCEPT
                </MachineText>
              </Button>
              <Button
                size="sm"
                className="bg-surface border border-foreground rounded-none"
                onPress={() =>
                  appendEvent({
                    type: "COACHING_FEEDBACK",
                    suggestionId: suggestion.id,
                    action: "ignored",
                    ts: Date.now(),
                  })
                }
              >
                <MachineText className="text-foreground font-bold text-[10px]">
                  IGNORE
                </MachineText>
              </Button>
            </View>
          </HardCard>
        ))}
      </View>
    </HardCard>
  );
}

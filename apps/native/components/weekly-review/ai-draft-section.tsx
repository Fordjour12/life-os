import { Button, Spinner } from "heroui-native";
import React, { useCallback, useState } from "react";
import { View } from "react-native";

import type { AIDraft } from "@/types/weekly-review";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type AIDraftActionResult =
  | {
      status: "success";
      draft: AIDraft;
    }
  | {
      status: "error";
      message: string;
    };

type Props = {
  aiDraft: AIDraft | null;
  isGeneratingDraft: boolean;
  onGenerateDraft: () => Promise<AIDraftActionResult>;
};

export const AIDraftSection = React.memo(function AIDraftSection({
  aiDraft,
  isGeneratingDraft,
  onGenerateDraft,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setError(null);
    const result = await onGenerateDraft();
    if (result.status === "error") {
      setError(result.message);
    }
  }, [onGenerateDraft]);

  return (
    <HardCard label="AI_NARRATIVE" className="mb-6 bg-surface">
      <View className="p-2 gap-4">
        <View className="gap-1">
          <MachineText variant="label" className="text-accent">
            AI_DRAFT
          </MachineText>
          <MachineText className="text-xs text-muted-foreground/40">
            DRAFT_ONLY. YOU_DECIDE.
          </MachineText>
        </View>

        {error && <MachineText className="text-sm text-danger">ERROR: {error}</MachineText>}

        {aiDraft ? (
          <View className="gap-3">
            <MachineText className="text-sm">{aiDraft.narrative}</MachineText>
            <View className="gap-2">
              <MachineText variant="label" className="text-accent">
                POSITIVE_SIGNALS
              </MachineText>
              <MachineText className="text-sm">
                {aiDraft.highlights.length ? aiDraft.highlights.join(" ") : "NO_SIGNAL"}
              </MachineText>
            </View>
            <View className="gap-2">
              <MachineText variant="label" className="text-accent">
                FRICTION_DETECTED
              </MachineText>
              <MachineText className="text-sm">
                {aiDraft.frictionPoints.length ? aiDraft.frictionPoints.join(" ") : "CLEAR_PATH"}
              </MachineText>
            </View>
            <View className="gap-2 p-3 bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]">
              <MachineText variant="label" className="text-accent mb-1">
                GENTLE_PROMPT
              </MachineText>
              <MachineText className="font-bold text-base">
                {aiDraft.reflectionQuestion}
              </MachineText>
            </View>
            <MachineText className="text-[10px] text-muted-foreground/40">
              REASON: {aiDraft.reason.detail}
            </MachineText>
          </View>
        ) : (
          <MachineText className="text-sm">NO_AI_DRAFT_YET.</MachineText>
        )}
        <Button
          onPress={handleGenerate}
          isDisabled={isGeneratingDraft}
          className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
        >
          {isGeneratingDraft ? (
            <Spinner size="sm" color="white" />
          ) : (
            <MachineText className="text-background font-bold">GENERATE_AI_DRAFT</MachineText>
          )}
        </Button>
      </View>
    </HardCard>
  );
});

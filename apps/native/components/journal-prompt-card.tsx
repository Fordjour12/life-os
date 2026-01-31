import { Button, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type Mood = "low" | "neutral" | "ok" | "good";

type JournalEntry = {
  _id: string;
  text?: string;
  mood?: Mood;
  createdAt: number;
};

type Props = {
  day: string;
  prompt: string | null;
  quiet?: boolean;
  reason?: "reflection" | "recovery" | "plan_reset" | "micro_recovery" | "quiet" | null;
  onSubmit: (input: { day: string; text?: string; mood?: Mood }) => Promise<void>;
  onSkip: (day: string) => Promise<void>;
  onRegenerate?: () => Promise<void> | void;
  isRegenerating?: boolean;
  entries?: JournalEntry[];
  isSkipping?: boolean;
  isSubmitting?: boolean;
};

const moods: Array<{ value: Mood; label: string }> = [
  { value: "low", label: "LOW" },
  { value: "neutral", label: "NEUTRAL" },
  { value: "ok", label: "OK" },
  { value: "good", label: "GOOD" },
];

export function JournalPromptCard({
  day,
  prompt,
  quiet,
  reason,
  onSubmit,
  onSkip,
  onRegenerate,
  isRegenerating,
  entries = [],
  isSkipping,
  isSubmitting,
}: Props) {
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | undefined>(undefined);
  const [showHints, setShowHints] = useState(false);

  if (!prompt) {
    return (
      <HardCard label="REFLECTION_MODULE" className="mb-6 bg-surface">
        <View className="gap-3 p-2">
          <MachineText variant="label" className="text-accent">
            NO_PROMPT
          </MachineText>
          <MachineText className="text-sm">NO_PROMPT_TODAY.</MachineText>
          <Button
            size="sm"
            onPress={() => setShowHints((value) => !value)}
            className="border-2 rounded-none bg-surface border-divider shadow-[2px_2px_0px_var(--color-foreground)]"
          >
            <MachineText className="text-foreground font-bold text-[10px]">
              {showHints ? "HIDE_HINTS" : "SHOW_HINTS"}
            </MachineText>
          </Button>
          {showHints ? (
            <MachineText className="text-[10px] text-muted">
              YOU_CAN_STILL_ADD_A_NOTE_IN_JOURNAL.
            </MachineText>
          ) : null}
        </View>
      </HardCard>
    );
  }

  const canSubmit = Boolean(text.trim() || mood);

  const submit = async () => {
    if (!canSubmit) return;
    await onSubmit({ day, text: text.trim() || undefined, mood });
    setText("");
    setMood(undefined);
  };

  const skip = async () => {
    await onSkip(day);
  };

  const promptOpacity = quiet ? 0.55 : 1;
  const hint =
    reason === "recovery"
      ? "RECOVERY_MODE_ACTIVE."
      : reason === "plan_reset"
        ? "PLAN_RESET_DETECTED."
        : reason === "micro_recovery"
          ? "MICRO_RECOVERY_USED."
          : reason === "reflection"
            ? "DAILY_REFLECTION_SUGGESTED."
            : null;

  return (
    <HardCard label="REFLECTION_MODULE" className="mb-6 bg-surface">
      <View className="gap-6 p-2">
        <View className="gap-2">
          <MachineText variant="label" className="text-accent">
            CORE_PROMPT
          </MachineText>
          <MachineText className="text-lg font-bold" style={{ opacity: promptOpacity }}>
            {prompt}
          </MachineText>
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              onPress={() => setShowHints((value) => !value)}
              className="border-2 rounded-none bg-surface border-divider shadow-[2px_2px_0px_var(--color-foreground)]"
            >
              <MachineText className="text-foreground font-bold text-[10px]">
                {showHints ? "HIDE_HINTS" : "SHOW_HINTS"}
              </MachineText>
            </Button>
            {onRegenerate ? (
              <Button
                size="sm"
                onPress={onRegenerate}
                isDisabled={isRegenerating}
                className="bg-foreground rounded-none"
              >
                {isRegenerating ? (
                  <Spinner size="sm" color="white" />
                ) : (
                  <MachineText className="text-background font-bold text-[10px]">
                    REGENERATE
                  </MachineText>
                )}
              </Button>
            ) : null}
          </View>
          {showHints ? (
            <View className="gap-1">
              {hint ? <MachineText className="text-[10px] text-muted">{hint}</MachineText> : null}
              {quiet ? (
                <MachineText className="text-[10px] text-muted">
                  QUIET_MODE_ACTIVE. OPTIONAL_ENTRY_ALLOWED.
                </MachineText>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="gap-3">
          <MachineText variant="label" className="text-accent">
            STATE_SELECTOR
          </MachineText>
          <View className="flex-row flex-wrap gap-2">
            {moods.map((item) => {
              const selected = mood === item.value;
              return (
                <Button
                  key={item.value}
                  size="sm"
                  onPress={() => setMood(selected ? undefined : item.value)}
                  className={`border-2 ${selected ? "bg-foreground border-foreground shadow-none" : "bg-surface border-divider shadow-[2px_2px_0px_var(--color-foreground)]"}`}
                >
                  <MachineText
                    className={`${selected ? "text-background" : "text-foreground"} font-bold text-[10px]`}
                  >
                    {item.label}
                  </MachineText>
                </Button>
              );
            })}
          </View>
        </View>

        <View className="bg-muted border border-divider p-2">
          <TextField>
            <TextField.Input
              value={text}
              onChangeText={setText}
              placeholder="TYPE_INPUT_HERE..."
              multiline
              className="font-mono text-sm"
              style={{ minHeight: 100, textAlignVertical: "top", fontFamily: "Menlo" }}
            />
          </TextField>
        </View>

        <View className="flex-row gap-3">
          <Button
            onPress={submit}
            isDisabled={!canSubmit || isSubmitting}
            className="flex-1 bg-foreground rounded-none shadow-[4px_4px_0px_var(--color-accent)]"
          >
            {isSubmitting ? (
              <Spinner size="sm" color="white" />
            ) : (
              <MachineText className="text-background font-bold">SAVE_ENTRY</MachineText>
            )}
          </Button>
          <Button
            variant="secondary"
            onPress={skip}
            isDisabled={isSkipping}
            className="border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)] bg-surface"
          >
            {isSkipping ? (
              <Spinner size="sm" />
            ) : (
              <MachineText className="font-bold">SKIP</MachineText>
            )}
          </Button>
        </View>

        {showHints ? (
          <MachineText className="text-[10px] text-muted">
            SHORT_LINES_COUNT. BULLETS_OK.
          </MachineText>
        ) : null}

        <View className="gap-4">
          <MachineText variant="label" className="text-accent">
            HISTORY_LOG
          </MachineText>
          {entries.length === 0 ? (
            <MachineText className="text-xs text-muted">NO_LOGS_FOUND.</MachineText>
          ) : (
            <View className="gap-4">
              {entries.slice(0, 3).map((entry) => (
                <View key={entry._id} className="gap-1 border-l-2 border-divider pl-3">
                  {entry.text ? <MachineText className="text-sm">{entry.text}</MachineText> : null}
                  {entry.mood ? (
                    <MachineText className="text-[10px] text-muted font-bold">
                      STATE: {entry.mood.toUpperCase()}
                    </MachineText>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </HardCard>
  );
}

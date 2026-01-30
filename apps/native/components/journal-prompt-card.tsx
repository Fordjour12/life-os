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
  onSubmit: (input: { day: string; text?: string; mood?: Mood }) => Promise<void>;
  onSkip: (day: string) => Promise<void>;
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
  onSubmit,
  onSkip,
  entries = [],
  isSkipping,
  isSubmitting,
}: Props) {
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood | undefined>(undefined);

  if (!prompt) {
    return null;
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

  return (
    <HardCard label="REFLECTION_MODULE" className="mb-6 bg-white">
      <View className="gap-6 p-2">
        <View className="gap-2">
          <MachineText variant="label" className="text-primary">CORE_PROMPT</MachineText>
          <MachineText
            className="text-lg font-bold"
            style={{ opacity: promptOpacity }}
          >
            {prompt}
          </MachineText>
          {quiet ? (
            <MachineText className="text-[10px] text-muted">
              QUIET_MODE_ACTIVE.
            </MachineText>
          ) : null}
        </View>

        <View className="gap-3">
          <MachineText variant="label" className="text-primary">STATE_SELECTOR</MachineText>
          <View className="flex-row flex-wrap gap-2">
            {moods.map((item) => {
              const selected = mood === item.value;
              return (
                <Button
                  key={item.value}
                  size="sm"
                  radius="none"
                  onPress={() => setMood(selected ? undefined : item.value)}
                  className={`border-2 ${selected ? "bg-black border-black shadow-none" : "bg-white border-black/10 shadow-[2px_2px_0px_black]"}`}
                >
                  <MachineText className={`${selected ? "text-white" : "text-black"} font-bold text-[10px]`}>{item.label}</MachineText>
                </Button>
              );
            })}
          </View>
        </View>

        <View className="bg-black/5 border border-black/10 p-2">
          <TextField>
            <TextField.Input
              value={text}
              onChangeText={setText}
              placeholder="TYPE_INPUT_HERE..."
              multiline
              className="font-mono text-sm"
              style={{ minHeight: 100, textAlignVertical: "top", fontFamily: 'Menlo' }}
            />
          </TextField>
        </View>

        <View className="flex-row gap-3">
          <Button
            onPress={submit}
            isDisabled={!canSubmit || isSubmitting}
            className="flex-1 bg-black rounded-none shadow-[4px_4px_0px_#FF5800]"
          >
            {isSubmitting ? <Spinner size="sm" color="white" /> : <MachineText className="text-white font-bold">SAVE_ENTRY</MachineText>}
          </Button>
          <Button
            variant="light"
            onPress={skip}
            isDisabled={isSkipping}
            className="border border-black rounded-none shadow-[2px_2px_0px_black] bg-white"
          >
            {isSkipping ? <Spinner size="sm" /> : <MachineText className="font-bold">SKIP</MachineText>}
          </Button>
        </View>

        <View className="gap-4">
          <MachineText variant="label" className="text-primary">HISTORY_LOG</MachineText>
          {entries.length === 0 ? (
            <MachineText className="text-xs text-muted">
              NO_LOGS_FOUND.
            </MachineText>
          ) : (
            <View className="gap-4">
              {entries.slice(0, 3).map((entry) => (
                <View key={entry._id} className="gap-1 border-l-2 border-black/5 pl-3">
                  {entry.text ? (
                    <MachineText className="text-sm">
                      {entry.text}
                    </MachineText>
                  ) : null}
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

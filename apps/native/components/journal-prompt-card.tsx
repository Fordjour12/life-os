import { Button, Spinner, TextField } from "heroui-native";
import { useState } from "react";
import { PlatformColor, Text, View } from "react-native";

import { GlassCard } from "@/components/ui/glass-card";

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
  { value: "low", label: "Low" },
  { value: "neutral", label: "Neutral" },
  { value: "ok", label: "OK" },
  { value: "good", label: "Good" },
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
    <GlassCard intensity={45} style={{ marginBottom: 24 }}>
      <View style={{ gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text selectable style={{ fontSize: 14, letterSpacing: 1, color: PlatformColor("secondaryLabel") }}>
            REFLECTION
          </Text>
          <Text
            selectable
            style={{ fontSize: 16, fontWeight: "600", color: PlatformColor("label"), opacity: promptOpacity }}
          >
            {prompt}
          </Text>
          {quiet ? (
            <Text selectable style={{ fontSize: 12, color: PlatformColor("secondaryLabel") }}>
              Quiet today selected. You can still write if you want.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <Text selectable style={{ fontSize: 12, color: PlatformColor("secondaryLabel") }}>
            Mood (optional)
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {moods.map((item) => {
              const selected = mood === item.value;
              return (
                <Button
                  key={item.value}
                  size="sm"
                  variant={selected ? "primary" : "secondary"}
                  onPress={() => setMood(selected ? undefined : item.value)}
                >
                  <Text selectable>{item.label}</Text>
                </Button>
              );
            })}
          </View>
        </View>

        <TextField>
          <TextField.Input
            value={text}
            onChangeText={setText}
            placeholder="Write anything, or leave it blank."
            multiline
            style={{ minHeight: 90, textAlignVertical: "top" }}
          />
        </TextField>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button onPress={submit} isDisabled={!canSubmit || isSubmitting}>
            {isSubmitting ? <Spinner size="sm" /> : <Text selectable>Save reflection</Text>}
          </Button>
          <Button variant="secondary" onPress={skip} isDisabled={isSkipping}>
            {isSkipping ? <Spinner size="sm" /> : <Text selectable>Quiet today</Text>}
          </Button>
        </View>

        <View style={{ gap: 8 }}>
          <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: PlatformColor("secondaryLabel") }}>
            RECENT NOTES
          </Text>
          {entries.length === 0 ? (
            <Text selectable style={{ fontSize: 13, color: PlatformColor("secondaryLabel") }}>
              No reflections yet.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {entries.slice(0, 3).map((entry) => (
                <View key={entry._id} style={{ gap: 4 }}>
                  {entry.text ? (
                    <Text selectable style={{ fontSize: 14, color: PlatformColor("label") }}>
                      {entry.text}
                    </Text>
                  ) : null}
                  {entry.mood ? (
                    <Text selectable style={{ fontSize: 12, color: PlatformColor("secondaryLabel") }}>
                      Mood: {entry.mood}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </GlassCard>
  );
}

import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Button, Spinner, TextField } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { Container } from "@/components/container";

type BlockKind = "busy" | "focus" | "rest" | "personal";

type CalendarBlock = {
  _id: string;
  day: string;
  startMin: number;
  endMin: number;
  kind: BlockKind;
  title?: string;
  notes?: string;
};

function parseTimeToMinutes(value: string) {
  const trimmed = value.trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function formatMinutesToTime(minutes: number) {
  const clamped = Math.max(0, Math.min(1440, minutes));
  const hours = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const mins = (clamped % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function formatDayLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

export default function EditBusyTime() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ blockId?: string }>();
  const calendarApi = api as unknown as {
    calendar: {
      getBlockById: any;
      updateBlock: any;
    };
  };

  const blockId = typeof params.blockId === "string" ? params.blockId : "";
  const block = useQuery(
    calendarApi.calendar.getBlockById,
    blockId ? { blockId } : "skip",
  ) as CalendarBlock | undefined;
  const updateBlockMutation = useMutation(calendarApi.calendar.updateBlock);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [kind, setKind] = useState<BlockKind>("busy");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dayInput, setDayInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [didInit, setDidInit] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!block || didInit) return;
    setStartTime(formatMinutesToTime(block.startMin));
    setEndTime(formatMinutesToTime(block.endMin));
    setTitle(block.title ?? "");
    setNotes(block.notes ?? "");
    setDayInput(block.day);
    setKind(block.kind);
    setDidInit(true);
  }, [block, didInit]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  const dayLabel = useMemo(
    () => (block ? formatDayLabel(block.day) : ""),
    [block],
  );

  const safeBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    router.replace("/(tabs)");
  };

  const submit = async () => {
    if (!block) return;

    const dayValue = dayInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayValue)) {
      setError("Day must be YYYY-MM-DD.");
      return;
    }

    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);

    if (startMin === null || endMin === null) {
      setError("Use HH:MM (24-hour) for both times.");
      return;
    }

    if (endMin <= startMin) {
      setError("End time must be after start time.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const trimmedTitle = title.trim();
      const trimmedNotes = notes.trim();
      await updateBlockMutation({
        blockId: block._id,
        day: dayValue,
        startMin,
        endMin,
        kind,
        title: trimmedTitle.length > 0 ? trimmedTitle : undefined,
        notes: trimmedNotes.length > 0 ? trimmedNotes : undefined,
      });
      setToastMessage("Block updated.");
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => {
        safeBack();
      }, 700);
    } finally {
      setIsSaving(false);
    }
  };

  if (!block) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  return (
    <Container className="pt-6">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 flex-row justify-between items-end border-b-2 border-divider pb-2">
          <View>
            <MachineText variant="label" className="text-accent mb-1">
              TIME_INPUT
            </MachineText>
            <MachineText variant="header" size="2xl">
              EDIT_TIME_BLOCK
            </MachineText>
          </View>
          <MachineText variant="value" className="text-sm">
            {dayLabel.toUpperCase()}
          </MachineText>
        </View>

        <HardCard label="BLOCK_DETAILS" className="mb-6">
          <View className="gap-4 p-4">
            <View>
              <MachineText variant="label" className="mb-2">
                DAY
              </MachineText>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={dayInput}
                    onChangeText={setDayInput}
                    placeholder="YYYY-MM-DD"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>
            <View>
              <MachineText variant="label" className="mb-2">
                START_TIME
              </MachineText>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="09:00"
                    keyboardType="numbers-and-punctuation"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            <View>
              <MachineText variant="label" className="mb-2">
                END_TIME
              </MachineText>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="10:30"
                    keyboardType="numbers-and-punctuation"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            <View>
              <MachineText variant="label" className="mb-2">
                TYPE
              </MachineText>
              <View className="flex-row flex-wrap gap-3">
                {(["busy", "focus", "rest", "personal"] as BlockKind[]).map(
                  (option) => (
                    <Button
                      key={option}
                      size="sm"
                      className={
                        kind === option
                          ? "bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                          : "bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
                      }
                      onPress={() => setKind(option)}
                    >
                      <MachineText
                        className={
                          kind === option
                            ? "text-accent-foreground"
                            : "text-foreground"
                        }
                      >
                        {option.toUpperCase()}
                      </MachineText>
                    </Button>
                  ),
                )}
              </View>
            </View>

            <View>
              <MachineText variant="label" className="mb-2">
                TITLE (OPTIONAL)
              </MachineText>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Meeting, commute, rest"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            <View>
              <MachineText variant="label" className="mb-2">
                NOTES (OPTIONAL)
              </MachineText>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Extra context"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            {error ? (
              <MachineText className="text-xs text-danger">{error}</MachineText>
            ) : null}
          </View>
        </HardCard>

        <HardCard label="ACTION">
          <View className="gap-3 p-4">
            <Button
              className="bg-accent border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
              onPress={submit}
              isDisabled={isSaving}
            >
              {isSaving ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-accent-foreground font-bold">
                  SAVE_CHANGES
                </MachineText>
              )}
            </Button>
            <Button
              className="bg-surface border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]"
              onPress={safeBack}
            >
              <MachineText className="text-foreground font-bold">
                CANCEL
              </MachineText>
            </Button>
            <MachineText className="text-xs text-foreground/70">
              Reason: keep the day accurate.
            </MachineText>
          </View>
        </HardCard>
      </ScrollView>
      {toastMessage ? (
        <View className="absolute bottom-6 left-4 right-4">
          <View className="bg-foreground px-3 py-2 border border-foreground shadow-[2px_2px_0px_var(--color-foreground)]">
            <MachineText className="text-background text-xs">
              {toastMessage}
            </MachineText>
          </View>
        </View>
      ) : null}
    </Container>
  );
}

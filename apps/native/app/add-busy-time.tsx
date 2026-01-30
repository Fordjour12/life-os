import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Button, Spinner, TextField } from "heroui-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type BlockKind = "busy" | "rest";

function parseTimeToMinutes(value: string) {
  const trimmed = value.trim();
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function formatDayLabel(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

export default function AddBusyTime() {
  const router = useRouter();
  const calendarApi = api as unknown as {
    calendar: { addBlock: any };
  };
  const today = useQuery(api.kernel.commands.getToday);
  const addBlockMutation = useMutation(calendarApi.calendar.addBlock);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [kind, setKind] = useState<BlockKind>("busy");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayLabel = useMemo(() => (today ? formatDayLabel(today.day) : ""), [today]);

  useEffect(() => {
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, []);

  const submit = async () => {
    if (!today) return;

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
      await addBlockMutation({
        day: today.day,
        startMin,
        endMin,
        kind,
        source: "manual",
        title: trimmedTitle.length > 0 ? trimmedTitle : undefined,
        notes: notes.trim().length > 0 ? notes.trim() : undefined,
      });
      setToastMessage("Block saved.");
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      toastTimeout.current = setTimeout(() => {
        router.back();
      }, 700);
    } finally {
      setIsSaving(false);
    }
  };

  if (!today) {
    return (
      <View className="flex-1 justify-center items-center bg-background">
        <Spinner size="lg" color="warning" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 flex-row justify-between items-end border-b-2 border-primary/20 pb-2">
          <View>
            <MachineText variant="label" className="text-primary mb-1">
              TIME_INPUT
            </MachineText>
            <MachineText variant="header" size="2xl">
              ADD_BUSY_TIME
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
                START_TIME
              </MachineText>
              <View className="bg-white border border-black/20 p-1">
                <TextField>
                  <TextField.Input
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="09:00"
                    placeholderTextColor="#999"
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
              <View className="bg-white border border-black/20 p-1">
                <TextField>
                  <TextField.Input
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="10:30"
                    placeholderTextColor="#999"
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
              <View className="flex-row gap-3">
                <Button
                  size="sm"
                  className={
                    kind === "busy"
                      ? "bg-primary border border-black shadow-[2px_2px_0px_black]"
                      : "bg-white border border-black shadow-[2px_2px_0px_black]"
                  }
                  onPress={() => setKind("busy")}
                >
                  <MachineText className={kind === "busy" ? "text-white" : "text-black"}>
                    BUSY
                  </MachineText>
                </Button>
                <Button
                  size="sm"
                  className={
                    kind === "rest"
                      ? "bg-primary border border-black shadow-[2px_2px_0px_black]"
                      : "bg-white border border-black shadow-[2px_2px_0px_black]"
                  }
                  onPress={() => setKind("rest")}
                >
                  <MachineText className={kind === "rest" ? "text-white" : "text-black"}>
                    REST
                  </MachineText>
                </Button>
              </View>
            </View>

            <View>
              <MachineText variant="label" className="mb-2">
                TITLE (OPTIONAL)
              </MachineText>
              <View className="bg-white border border-black/20 p-1">
                <TextField>
                  <TextField.Input
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Meeting, commute, rest"
                    placeholderTextColor="#999"
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
              <View className="bg-white border border-black/20 p-1">
                <TextField>
                  <TextField.Input
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Extra context"
                    placeholderTextColor="#999"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            {error ? (
              <MachineText className="text-xs text-red-600">{error}</MachineText>
            ) : null}
          </View>
        </HardCard>

        <HardCard label="ACTION">
          <View className="gap-3 p-4">
            <Button
              className="bg-primary border border-black shadow-[2px_2px_0px_black]"
              onPress={submit}
              isDisabled={isSaving}
            >
              {isSaving ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-white font-bold">SAVE_BLOCK</MachineText>
              )}
            </Button>
            <Button
              className="bg-white border border-black shadow-[2px_2px_0px_black]"
              onPress={() => router.back()}
            >
              <MachineText className="text-black font-bold">CANCEL</MachineText>
            </Button>
            <MachineText className="text-xs text-foreground/70">
              Reason: protect what the day allows.
            </MachineText>
          </View>
        </HardCard>
      </ScrollView>
      {toastMessage ? (
        <View className="absolute bottom-6 left-4 right-4">
          <View className="bg-black px-3 py-2 border border-black shadow-[2px_2px_0px_black]">
            <MachineText className="text-white text-xs">{toastMessage}</MachineText>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

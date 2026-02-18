import { useAction, useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { Button, Spinner, TextField } from "heroui-native";
import { useMemo, useState } from "react";
import { View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";
import { getTimezoneOffsetMinutes } from "@/lib/date";

type TodayQueryResult = {
  day: string;
} | null;

type Draft = {
  day: string;
  question: string;
  grade: {
    label: "A" | "B" | "C";
    score: number;
    reason: string;
  };
  improvements: string[];
  reason: {
    code: string;
    detail: string;
  };
};

type JournalEntry = {
  _id: string;
  day: string;
  reflection: string;
  grade: {
    label: "A" | "B" | "C";
    score: number;
    reason: string;
  };
  improvement?: string;
  question?: string;
  createdAt: number;
};

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export default function JournalScreen() {
  const tzOffsetMinutes = getTimezoneOffsetMinutes();

  const getToday = makeFunctionReference<"query", { tzOffsetMinutes?: number }, TodayQueryResult>(
    "kernel/commands:getToday",
  );
  const generateCheckin = makeFunctionReference<
    "action",
    { day?: string; tzOffsetMinutes?: number },
    { status: "success" | "error"; source?: "ai" | "fallback"; draft?: Draft }
  >("kernel/vexAgents:generateDailyJournalCheckin");
  const saveCheckin = makeFunctionReference<
    "mutation",
    {
      day: string;
      reflection: string;
      gradeLabel: "A" | "B" | "C";
      gradeScore: number;
      gradeReason: string;
      improvement?: string;
      question?: string;
      idempotencyKey?: string;
    },
    { ok: boolean }
  >("journal:saveDailyCheckin");
  const getCheckins = makeFunctionReference<"query", { day: string }, JournalEntry[]>(
    "journal:getDailyCheckins",
  );

  const today = useQuery(getToday, { tzOffsetMinutes });
  const runCheckin = useAction(generateCheckin);
  const saveDailyCheckin = useMutation(saveCheckin);
  const entries = useQuery(getCheckins, today ? { day: today.day } : "skip");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [reflection, setReflection] = useState("");
  const [selectedImprovement, setSelectedImprovement] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const gradeTone = useMemo(() => {
    if (!draft) return "text-muted";
    if (draft.grade.label === "A") return "text-success";
    if (draft.grade.label === "C") return "text-warning";
    return "text-accent";
  }, [draft]);

  const generate = async () => {
    if (!today) return;
    setIsGenerating(true);
    try {
      const result = await runCheckin({ day: today.day, tzOffsetMinutes });
      if (result.status === "success" && result.draft) {
        setDraft(result.draft);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const save = async () => {
    if (!today || !draft || !reflection.trim()) return;
    setIsSaving(true);
    try {
      await saveDailyCheckin({
        day: today.day,
        reflection: reflection.trim(),
        gradeLabel: draft.grade.label,
        gradeScore: draft.grade.score,
        gradeReason: draft.grade.reason,
        improvement: selectedImprovement ?? undefined,
        question: draft.question,
        idempotencyKey: idem(),
      });
      setReflection("");
      setSelectedImprovement(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container className="pt-6">
      <View className="mb-6 border-b-2 border-divider pb-2">
        <MachineText variant="label" className="text-accent mb-1">
          SYSTEM://JOURNAL
        </MachineText>
        <MachineText variant="header" size="2xl">
          DAILY_CHECKIN
        </MachineText>
      </View>

      <View className="gap-6">
        <HardCard label="AI_CHECKIN" className="bg-surface p-4 gap-3">
          <MachineText className="text-xs text-muted">
            AI asks one daily question, gives a supportive day signal, and suggests tomorrow improvements.
          </MachineText>
          <View className="flex-row gap-2">
            <Button
              onPress={generate}
              isDisabled={!today || isGenerating}
              className="bg-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
              size="sm"
            >
              {isGenerating ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-background font-bold">GENERATE_CHECKIN</MachineText>
              )}
            </Button>
          </View>

          {draft ? (
            <View className="gap-3 mt-1">
              <View className="border border-divider bg-muted p-3 gap-1">
                <MachineText variant="label" className="text-accent text-[10px]">
                  TODAY_QUESTION
                </MachineText>
                <MachineText className="text-sm font-bold">{draft.question}</MachineText>
              </View>

              <View className="border border-divider bg-surface p-3 gap-1">
                <MachineText className={`text-xs font-bold ${gradeTone}`}>
                  DAY_SIGNAL {draft.grade.label} ({draft.grade.score}/100)
                </MachineText>
                <MachineText className="text-xs text-muted">{draft.grade.reason}</MachineText>
              </View>

              <View className="gap-2">
                <MachineText variant="label" className="text-[10px] text-accent">
                  IMPROVEMENT_OPTIONS
                </MachineText>
                {draft.improvements.map((item) => {
                  const selected = selectedImprovement === item;
                  return (
                    <Button
                      key={item}
                      size="sm"
                      onPress={() => setSelectedImprovement(selected ? null : item)}
                      className={`justify-start rounded-none border ${
                        selected ? "bg-foreground border-foreground" : "bg-surface border-divider"
                      }`}
                    >
                      <MachineText className={`text-xs ${selected ? "text-background" : "text-foreground"}`}>
                        {item}
                      </MachineText>
                    </Button>
                  );
                })}
              </View>

              <View className="gap-2">
                <MachineText variant="label" className="text-[10px] text-accent">
                  YOUR_REFLECTION
                </MachineText>
                <TextField>
                  <TextField.Input
                    value={reflection}
                    onChangeText={setReflection}
                    placeholder="How did today really feel?"
                    multiline
                    className="font-mono text-sm border border-divider bg-surface p-2"
                    style={{ minHeight: 100, textAlignVertical: "top", fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>

              <Button
                onPress={save}
                isDisabled={isSaving || reflection.trim().length === 0}
                className="bg-accent rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
              >
                {isSaving ? (
                  <Spinner size="sm" color="white" />
                ) : (
                  <MachineText className="text-accent-foreground font-bold">SAVE_CHECKIN</MachineText>
                )}
              </Button>
            </View>
          ) : null}
        </HardCard>

        <HardCard label="TODAY_LOG" className="bg-surface p-4 gap-3">
          {!entries?.length ? (
            <MachineText className="text-xs text-muted">NO_CHECKINS_LOGGED_FOR_TODAY.</MachineText>
          ) : (
            <View className="gap-2">
              {entries.map((entry) => (
                <View key={entry._id} className="border border-divider bg-muted p-2 gap-1">
                  <MachineText className="text-[10px] text-muted">
                    {new Date(entry.createdAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </MachineText>
                  <MachineText className="text-xs font-bold">
                    SIGNAL {entry.grade.label} ({entry.grade.score})
                  </MachineText>
                  <MachineText className="text-sm">{entry.reflection}</MachineText>
                  {entry.improvement ? (
                    <MachineText className="text-[10px] text-accent">NEXT: {entry.improvement}</MachineText>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </HardCard>
      </View>
    </Container>
  );
}

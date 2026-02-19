import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Button, Spinner, TextField } from "heroui-native";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { Container } from "@/components/container";
import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

const ESTIMATE_PRESETS = [10, 25, 45, 60];

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function normalizeEstimate(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 5 || parsed > 480) return null;
  return parsed;
}

export default function NewTaskModal() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ estimate?: string; title?: string }>();
  const createTaskMutation = useMutation(api.kernel.taskCommands.createTask);

  const [title, setTitle] = useState(typeof params.title === "string" ? params.title : "");
  const [estimate, setEstimate] = useState(
    typeof params.estimate === "string" ? params.estimate : "25",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTitle = title.trim();
  const parsedEstimate = useMemo(() => normalizeEstimate(estimate), [estimate]);
  const canSubmit = trimmedTitle.length > 0 && parsedEstimate !== null && !isSaving;

  const safeBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.replace("/(tabs)/tasks");
  };

  const submit = async () => {
    if (!canSubmit || parsedEstimate === null) return;
    setError(null);
    setIsSaving(true);
    try {
      await createTaskMutation({
        title: trimmedTitle,
        estimateMin: parsedEstimate,
        priority: 2,
        idempotencyKey: idem(),
      });
      safeBack();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Could not create task.";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container className="pt-6">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View className="mb-6 flex-row justify-between items-end border-b-2 border-divider pb-2">
          <View>
            <MachineText variant="label" className="text-accent mb-1">
              TASK_CAPTURE
            </MachineText>
            <MachineText variant="header" size="2xl">
              NEW_TASK
            </MachineText>
          </View>
          <MachineText variant="value" className="text-sm">
            1-STEP_INPUT
          </MachineText>
        </View>

        <HardCard label="INPUT" className="mb-6 bg-surface">
          <View className="gap-4 p-4">
            <View>
              <MachineText variant="label" className="mb-2">
                TASK_NAME
              </MachineText>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Small, concrete action"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            <View>
              <MachineText variant="label" className="mb-2">
                ESTIMATE_MINUTES
              </MachineText>
              <View className="flex-row gap-2 flex-wrap mb-2">
                {ESTIMATE_PRESETS.map((minutes) => {
                  const selected = Number(estimate) === minutes;
                  return (
                    <Button
                      key={minutes}
                      size="sm"
                      onPress={() => setEstimate(String(minutes))}
                      className={`rounded-none border ${
                        selected ? "bg-foreground border-foreground" : "bg-surface border-divider"
                      }`}
                    >
                      <MachineText
                        className={`text-[10px] font-bold ${selected ? "text-background" : "text-foreground"}`}
                      >
                        {minutes}M
                      </MachineText>
                    </Button>
                  );
                })}
              </View>
              <View className="bg-surface border border-divider p-1">
                <TextField>
                  <TextField.Input
                    value={estimate}
                    onChangeText={setEstimate}
                    placeholder="25"
                    keyboardType="number-pad"
                    className="font-mono text-sm h-8"
                    style={{ fontFamily: "Menlo" }}
                  />
                </TextField>
              </View>
            </View>

            {error ? <MachineText className="text-xs text-danger">{error}</MachineText> : null}
            {parsedEstimate === null && estimate.trim().length > 0 ? (
              <MachineText className="text-xs text-danger">
                ESTIMATE MUST BE BETWEEN 5 AND 480.
              </MachineText>
            ) : null}
          </View>
        </HardCard>

        <HardCard label="ACTION" className="bg-surface">
          <View className="gap-3 p-4">
            <Button
              onPress={submit}
              isDisabled={!canSubmit}
              className="bg-foreground border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-accent)]"
            >
              {isSaving ? (
                <Spinner size="sm" color="white" />
              ) : (
                <MachineText className="text-background font-bold">SAVE_TASK</MachineText>
              )}
            </Button>
            <Button
              onPress={safeBack}
              isDisabled={isSaving}
              className="bg-surface border border-foreground rounded-none shadow-[2px_2px_0px_var(--color-foreground)]"
            >
              <MachineText className="text-foreground font-bold">CANCEL</MachineText>
            </Button>
          </View>
        </HardCard>
      </ScrollView>
    </Container>
  );
}

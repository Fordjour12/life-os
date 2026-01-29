import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button, Spinner, Surface, TextField } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Container } from "@/components/container";

type PlanItem = {
  id: string;
  label: string;
  estimatedMinutes: number;
};

type DraftItem = {
  id: string;
  label: string;
  estimatedMinutes: string;
};

type PlanData = {
  day: string;
  focusItems: PlanItem[];
};

const allowedEstimates = [10, 25, 45, 60];

function idem() {
  return `device:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function normalizeEstimate(value: number) {
  if (!Number.isFinite(value)) return 25;
  return allowedEstimates.reduce((closest, estimate) =>
    Math.abs(estimate - value) < Math.abs(closest - value) ? estimate : closest,
  );
}

function createEmptyDraft(): DraftItem[] {
  return Array.from({ length: 3 }).map((_, index) => ({
    id: `focus-${Date.now()}-${index}`,
    label: "",
    estimatedMinutes: "25",
  }));
}

function toDraftItems(items: PlanItem[]): DraftItem[] {
  const filled = items.map((item) => ({
    id: item.id,
    label: item.label,
    estimatedMinutes: String(item.estimatedMinutes),
  }));
  while (filled.length < 3) {
    filled.push({
      id: `focus-${Date.now()}-${filled.length}`,
      label: "",
      estimatedMinutes: "25",
    });
  }
  return filled.slice(0, 3);
}

export default function Planner() {
  const data = useQuery(api.kernel.commands.getToday);
  const execute = useMutation(api.kernel.commands.executeCommand);
  const [draftItems, setDraftItems] = useState<DraftItem[]>(() => createEmptyDraft());
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!data) {
    return (
      <Container className="p-6">
        <View className="flex-1 justify-center items-center">
          <Spinner size="lg" />
        </View>
      </Container>
    );
  }

  const plan = (data.plan ?? null) as PlanData | null;
  const totalMinutes = plan
    ? plan.focusItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)
    : 0;

  const showEditor = !plan || isEditing;

  const updateDraft = (index: number, patch: Partial<DraftItem>) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const savePlan = async () => {
    const focusItems = draftItems
      .map((item, index) => {
        const label = item.label.trim();
        if (!label) return null;
        const estimatedMinutes = normalizeEstimate(Number(item.estimatedMinutes));
        const id = item.id || `focus-${Date.now()}-${index}`;
        return { id, label, estimatedMinutes };
      })
      .filter((item): item is PlanItem => Boolean(item));

    if (!focusItems.length) {
      return;
    }

    setIsSaving(true);
    try {
      await execute({
        command: {
          cmd: "set_daily_plan",
          input: { day: data.day, focusItems: focusItems.slice(0, 3) },
          idempotencyKey: idem(),
        },
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const startAdjust = () => {
    if (plan) {
      setDraftItems(toDraftItems(plan.focusItems));
    }
    setIsEditing(true);
  };

  const resetPlan = async () => {
    setIsSaving(true);
    try {
      await execute({
        command: {
          cmd: "set_daily_plan",
          input: {
            day: data.day,
            focusItems: [
              {
                id: "recovery",
                label: "One small stabilizing task",
                estimatedMinutes: 10,
              },
            ],
          },
          idempotencyKey: idem(),
        },
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container className="p-6 gap-4">
      <View>
        <Text className="text-3xl font-semibold text-foreground tracking-tight">Planner</Text>
        <Text className="text-muted text-sm mt-1">What would make today a win?</Text>
      </View>

      {showEditor ? (
        <Surface variant="secondary" className="p-4 rounded-2xl gap-4">
          <View className="gap-1">
            <Text className="text-foreground font-semibold">Today's focus</Text>
            <Text className="text-muted text-sm">Up to three items, rough effort only.</Text>
          </View>
          <View className="gap-4">
            {draftItems.map((item, index) => (
              <Surface key={item.id} variant="default" className="p-3 rounded-xl gap-3">
                <TextField>
                  <TextField.Label>Focus item {index + 1}</TextField.Label>
                  <TextField.Input
                    value={item.label}
                    onChangeText={(value) => updateDraft(index, { label: value })}
                    placeholder="Small, meaningful thing"
                  />
                </TextField>
                <TextField>
                  <TextField.Label>Estimate (minutes)</TextField.Label>
                  <TextField.Input
                    value={item.estimatedMinutes}
                    onChangeText={(value) => updateDraft(index, { estimatedMinutes: value })}
                    placeholder="25"
                    keyboardType="number-pad"
                  />
                </TextField>
              </Surface>
            ))}
          </View>
          <View className="flex-row gap-2">
            <Button onPress={savePlan} isDisabled={isSaving} variant="secondary">
              {isSaving ? <Spinner size="sm" color="default" /> : "Save plan"}
            </Button>
            {plan ? (
              <Button
                onPress={() => setIsEditing(false)}
                isDisabled={isSaving}
                variant="secondary"
              >
                Cancel
              </Button>
            ) : null}
          </View>
        </Surface>
      ) : (
        <Surface variant="secondary" className="p-4 rounded-2xl gap-4">
          <View className="gap-1">
            <Text className="text-foreground font-semibold">Today's plan</Text>
            <Text className="text-muted text-sm">Total: {totalMinutes} minutes</Text>
          </View>
          <View className="gap-3">
            {plan?.focusItems.map((item) => (
              <Surface key={item.id} variant="default" className="p-3 rounded-xl">
                <View className="flex-row items-center justify-between">
                  <View className="gap-1">
                    <Text className="text-foreground font-semibold">{item.label}</Text>
                    <Text className="text-muted text-xs">{item.estimatedMinutes} min</Text>
                  </View>
                </View>
              </Surface>
            ))}
          </View>
          <View className="flex-row gap-2">
            <Button onPress={startAdjust} variant="secondary" isDisabled={isSaving}>
              Adjust
            </Button>
            <Button onPress={resetPlan} variant="secondary" isDisabled={isSaving}>
              Reset plan
            </Button>
          </View>
        </Surface>
      )}
    </Container>
  );
}

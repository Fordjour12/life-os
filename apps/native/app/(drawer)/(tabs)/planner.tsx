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
  version: number;
  reason: "initial" | "adjust" | "reset" | "recovery" | "return";
  focusItems: PlanItem[];
};

type PlannerState =
  | "NO_PLAN"
  | "PLANNED_OK"
  | "OVERLOADED"
  | "STALLED"
  | "RECOVERY"
  | "RETURNING";

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
  const [nextStepIndex, setNextStepIndex] = useState(0);
  const [nextStepMinutes, setNextStepMinutes] = useState(10);
  const [showNextStep, setShowNextStep] = useState(false);

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
  const plannerState = (data.plannerState ?? "NO_PLAN") as PlannerState;
  const lifeState = data.state ?? null;
  const totalMinutes = plan
    ? plan.focusItems.reduce((sum, item) => sum + item.estimatedMinutes, 0)
    : 0;

  const showEditor = plannerState === "NO_PLAN" || isEditing;

  const updateDraft = (index: number, patch: Partial<DraftItem>) => {
    setDraftItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const setPlan = async (
    reason: "initial" | "adjust" | "reset" | "recovery" | "return",
    items: PlanItem[],
  ) => {
    if (!items.length) return;
    setIsSaving(true);
    try {
      await execute({
        command: {
          cmd: "set_daily_plan",
          input: { day: data.day, focusItems: items.slice(0, 3), reason },
          idempotencyKey: idem(),
        },
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
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

    if (!focusItems.length) return;
    const reason = plan ? "adjust" : "initial";
    await setPlan(reason, focusItems);
  };

  const startAdjust = () => {
    if (plan) {
      setDraftItems(toDraftItems(plan.focusItems));
    }
    setIsEditing(true);
  };

  const resetPlan = async () => {
    await setPlan("reset", [
      {
        id: "recovery",
        label: "One small stabilizing task",
        estimatedMinutes: 10,
      },
    ]);
  };

  const restPlan = async () => {
    await setPlan("recovery", [
      {
        id: "rest",
        label: "Rest and recover",
        estimatedMinutes: 5,
      },
    ]);
  };

  const shrinkPlan = async (keepCount: 1 | 2) => {
    if (!plan) return;
    const items = plan.focusItems.slice(0, keepCount);
    await setPlan("reset", items);
  };

  const getNextStepMinutes = () => {
    if (lifeState?.mode === "recovery" || lifeState?.focusCapacity === "very_low") return 10;
    if (lifeState?.focusCapacity === "low") return 10;
    if (lifeState?.focusCapacity === "high") return 25;
    return 15;
  };

  const startNextStep = (forcedMinutes?: number) => {
    if (!plan || plan.focusItems.length === 0) return;
    setNextStepIndex(0);
    setNextStepMinutes(forcedMinutes ?? getNextStepMinutes());
    setShowNextStep(true);
  };

  const shrinkNextStep = () => {
    const min = lifeState?.mode === "recovery" || lifeState?.focusCapacity === "very_low" ? 5 : 10;
    setNextStepMinutes((minutes) => Math.max(min, minutes - 5));
  };

  const skipNextStep = () => {
    if (!plan) return;
    const nextIndex = nextStepIndex + 1;
    if (nextIndex >= plan.focusItems.length) {
      setShowNextStep(false);
      return;
    }
    setNextStepIndex(nextIndex);
  };

  const subtitle = (() => {
    if (plannerState === "RETURNING") return "Welcome back. No pressure.";
    if (plannerState === "RECOVERY") return "Recovery mode. Keep it small.";
    if (plannerState === "OVERLOADED") return "This plan is heavier than your available time.";
    if (plannerState === "STALLED") return "No momentum yet. Let's make it easy.";
    return "What would make today a win?";
  })();

  return (
    <Container className="p-6 gap-4">
      <View>
        <Text className="text-3xl font-semibold text-foreground tracking-tight">Planner</Text>
        <Text className="text-muted text-sm mt-1">{subtitle}</Text>
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
            {plannerState === "NO_PLAN" ? (
              <Button onPress={restPlan} isDisabled={isSaving} variant="secondary">
                Rest day
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
          {showNextStep ? (
            <Surface variant="default" className="p-3 rounded-xl gap-3">
              <View className="gap-1">
                <Text className="text-foreground font-semibold">Next step</Text>
                <Text className="text-muted text-sm">Keep it small and doable.</Text>
              </View>
              <View>
                <Text className="text-foreground font-semibold">
                  {plan?.focusItems[nextStepIndex]?.label}
                </Text>
                <Text className="text-muted text-xs">{nextStepMinutes} min</Text>
              </View>
              <View className="flex-row gap-2">
                <Button variant="secondary" onPress={() => setShowNextStep(false)}>
                  Start
                </Button>
                <Button variant="secondary" onPress={shrinkNextStep}>
                  Make smaller
                </Button>
                {plan && plan.focusItems.length > 1 ? (
                  <Button variant="secondary" onPress={skipNextStep}>
                    Skip
                  </Button>
                ) : null}
              </View>
            </Surface>
          ) : null}
          <View className="flex-row gap-2">
            {plannerState === "OVERLOADED" ? (
              <>
                <Button onPress={resetPlan} variant="secondary" isDisabled={isSaving}>
                  Plan reset
                </Button>
                <Button onPress={() => shrinkPlan(1)} variant="secondary" isDisabled={isSaving}>
                  Shrink to 1
                </Button>
                {plan && plan.focusItems.length > 1 ? (
                  <Button
                    onPress={() => shrinkPlan(2)}
                    variant="secondary"
                    isDisabled={isSaving}
                  >
                    Shrink to 2
                  </Button>
                ) : null}
              </>
            ) : null}
            {plannerState === "STALLED" || plannerState === "PLANNED_OK" ? (
              <>
                <Button onPress={() => startNextStep()} variant="secondary" isDisabled={isSaving}>
                  Start
                </Button>
                {plannerState === "STALLED" ? (
                  <Button
                    onPress={() => startNextStep(10)}
                    variant="secondary"
                    isDisabled={isSaving}
                  >
                    Tiny win
                  </Button>
                ) : null}
              </>
            ) : null}
            {plannerState === "RECOVERY" ? (
              <>
                <Button onPress={resetPlan} variant="secondary" isDisabled={isSaving}>
                  One stabilizer
                </Button>
                <Button onPress={restPlan} variant="secondary" isDisabled={isSaving}>
                  Rest is valid
                </Button>
                <Button onPress={() => setPlan("recovery", [{
                  id: "tidy",
                  label: "Light tidy",
                  estimatedMinutes: 10,
                }])} variant="secondary" isDisabled={isSaving}>
                  Light tidy
                </Button>
              </>
            ) : null}
            {plannerState === "RETURNING" ? (
              <Button
                onPress={() =>
                  setPlan("return", [
                    { id: "return", label: "One small thing", estimatedMinutes: 10 },
                  ])
                }
                variant="secondary"
                isDisabled={isSaving}
              >
                Reset with 1 small thing
              </Button>
            ) : null}
            <Button onPress={startAdjust} variant="secondary" isDisabled={isSaving}>
              Adjust
            </Button>
          </View>
        </Surface>
      )}
    </Container>
  );
}

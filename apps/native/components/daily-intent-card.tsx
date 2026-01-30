import { View } from "react-native";

import { HardCard } from "@/components/ui/hard-card";
import { MachineText } from "@/components/ui/machine-text";

type PlanItem = {
  id: string;
  label: string;
  estimatedMinutes: number;
};

type PlanData = {
  day: string;
  version: number;
  reason: string;
  focusItems: PlanItem[];
};

type Props = {
  plan?: PlanData | null;
  plannedMinutes?: number | null;
  completedMinutes?: number | null;
};

export function DailyIntentCard({ plan, plannedMinutes, completedMinutes }: Props) {
  const items = plan?.focusItems ?? [];
  const planned =
    plannedMinutes ?? items.reduce((sum, item) => sum + (item.estimatedMinutes || 0), 0);
  const completed = completedMinutes ?? 0;
  const ratio = planned > 0 ? completed / planned : 0;
  const percent = planned > 0 ? Math.min(200, Math.round(ratio * 100)) : 0;
  const status =
    planned === 0
      ? "NO_PLAN"
      : ratio >= 0.8
        ? "ON_TRACK"
        : ratio >= 0.4
          ? "IN_PROGRESS"
          : "ADJUSTABLE";
  const shouldSuggestAdjust = planned > 0 && ratio < 0.4;
  const reasonLabel = plan?.reason ? `REASON:${plan.reason.toUpperCase()}` : null;

  return (
    <HardCard label="DAILY_INTENT" className="mb-6 bg-white">
      <View className="gap-4 p-2">
        <View className="gap-1">
          <MachineText variant="label" className="text-primary">
            TODAY_FOCUS
          </MachineText>
          <View className="flex-row items-center gap-2">
            <MachineText className="text-[10px] text-muted">OPTIONAL, EDITABLE, DISPOSABLE</MachineText>
            {reasonLabel ? (
              <View className="border border-black/20 bg-white px-2 py-0.5">
                <MachineText className="text-[9px] font-bold text-black/70">
                  {reasonLabel}
                </MachineText>
              </View>
            ) : null}
          </View>
        </View>

        {items.length === 0 ? (
          <MachineText className="text-sm">NO_INTENT_SET. PLANNER_IS_READY.</MachineText>
        ) : (
          <View className="gap-3">
            {items.map((item, index) => (
              <View key={item.id} className="gap-1 border-l-2 border-black/10 pl-3">
                <MachineText className="text-sm">
                  {index + 1}. {item.label}
                </MachineText>
                <MachineText className="text-[10px] text-muted">
                  ESTIMATE: {item.estimatedMinutes} MIN
                </MachineText>
              </View>
            ))}
          </View>
        )}

        <View className="flex-row items-center justify-between border border-black/10 bg-[#F7F7F5] px-3 py-2">
          <MachineText className="text-[10px] text-muted">REALITY_MATCH</MachineText>
          <MachineText className="text-sm font-bold">
            {planned > 0 ? `${percent}%` : "--"}
          </MachineText>
          <MachineText className="text-[10px] text-muted">{status}</MachineText>
        </View>

        {shouldSuggestAdjust ? (
          <MachineText className="text-[10px] text-muted">
            PLAN_LOOKS_HEAVY. CONSIDER_ADJUSTING_FOCUS.
          </MachineText>
        ) : null}
      </View>
    </HardCard>
  );
}

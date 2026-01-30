import { Button, Spinner } from "heroui-native";
import { useMemo } from "react";
import { PlatformColor, Text, View } from "react-native";

import { GlassCard } from "@/components/ui/glass-card";

type WeeklyReviewFacts = {
  recoveryDays: number;
  balancedDays: number;
  tinyWins: number;
  planResets: number;
};

type WeeklyReview = {
  week: string;
  facts: WeeklyReviewFacts;
  highlights: string[];
  frictionPoints: string[];
  reflectionQuestion: string;
  createdAt: number;
};

type Props = {
  review?: WeeklyReview | null;
  onGenerate?: () => void;
  isGenerating?: boolean;
};

const dividerColor = PlatformColor("separator");
const secondaryText = PlatformColor("secondaryLabel");

export function WeeklyReviewCard({ review, onGenerate, isGenerating }: Props) {
  const facts = review?.facts;
  const highlights = review?.highlights ?? [];
  const frictionPoints = review?.frictionPoints ?? [];

  const title = review ? `Week ${review.week}` : "Weekly Review";
  const summaryNote = "Based on your events and daily state.";

  const highlightText = useMemo(() => {
    if (highlights.length === 0) return "No highlights yet.";
    return highlights.join(" ");
  }, [highlights]);

  const frictionText = useMemo(() => {
    if (frictionPoints.length === 0) return "No friction signals detected.";
    return frictionPoints.join(" ");
  }, [frictionPoints]);

  return (
    <GlassCard intensity={45} style={{ marginBottom: 24 }}>
      <View style={{ gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text selectable style={{ fontSize: 18, fontWeight: "600", color: PlatformColor("label") }}>
            {title}
          </Text>
          <Text selectable style={{ fontSize: 13, color: secondaryText }}>
            {summaryNote}
          </Text>
        </View>

        {!review && (
          <View style={{ gap: 10 }}>
            <Text selectable style={{ fontSize: 14, color: PlatformColor("label") }}>
              Generate a calm weekly mirror when you are ready.
            </Text>
            <Button onPress={onGenerate} isDisabled={!onGenerate || isGenerating}>
              {isGenerating ? <Spinner size="sm" /> : <Text selectable>Generate weekly review</Text>}
            </Button>
          </View>
        )}

        {review && (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: secondaryText }}>
                WHAT SHOWED UP
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Fact label="Recovery days" value={facts?.recoveryDays ?? 0} />
                <Fact label="Balanced days" value={facts?.balancedDays ?? 0} />
                <Fact label="Tiny wins" value={facts?.tinyWins ?? 0} />
                <Fact label="Plan resets" value={facts?.planResets ?? 0} />
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: dividerColor }} />

            <View style={{ gap: 8 }}>
              <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: secondaryText }}>
                WHAT HELPED
              </Text>
              <Text selectable style={{ fontSize: 14, color: PlatformColor("label") }}>
                {highlightText}
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: secondaryText }}>
                WHAT MADE THINGS HARDER
              </Text>
              <Text selectable style={{ fontSize: 14, color: PlatformColor("label") }}>
                {frictionText}
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <Text selectable style={{ fontSize: 12, letterSpacing: 1, color: secondaryText }}>
                ONE GENTLE QUESTION
              </Text>
              <Text selectable style={{ fontSize: 15, fontWeight: "600", color: PlatformColor("label") }}>
                {review.reflectionQuestion}
              </Text>
            </View>

            <Button onPress={onGenerate} isDisabled={!onGenerate || isGenerating}>
              {isGenerating ? <Spinner size="sm" /> : <Text selectable>Refresh review</Text>}
            </Button>
          </View>
        )}
      </View>
    </GlassCard>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ minWidth: 130, gap: 2 }}>
      <Text
        selectable
        style={{ fontSize: 20, fontWeight: "600", fontVariant: ["tabular-nums"], color: PlatformColor("label") }}
      >
        {value}
      </Text>
      <Text selectable style={{ fontSize: 12, color: secondaryText }}>
        {label}
      </Text>
    </View>
  );
}

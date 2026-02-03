export type WeeklyReviewFacts = {
  recoveryDays: number;
  balancedDays: number;
  tinyWins: number;
  planResets: number;
};

export type WeeklyReview = {
  week: string;
  facts: WeeklyReviewFacts;
  highlights: string[];
  frictionPoints: string[];
  reflectionQuestion: string;
  createdAt: number;
};

export type AIDraft = {
  highlights: string[];
  frictionPoints: string[];
  reflectionQuestion: string;
  narrative: string;
  reason: { code: string; detail: string };
};

export type WeeklyPlanDraft = {
  week: string;
  days: Array<{
    day: string;
    focusItems: Array<{ id: string; label: string; estimatedMinutes: number }>;
    reason: { code: string; detail: string };
  }>;
  reason: { code: string; detail: string };
};

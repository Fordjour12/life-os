import type { Policy, PolicyContext } from "../types";

export const endOfDayReview: Policy = {
  name: "end-of-day-review",
  when: (ctx) => {
    const hour = new Date(ctx.now).getHours();
    return hour >= 20;
  },
  propose: (ctx) => {
    const questions = generateReflectionQuestions(ctx);
    const question =
      questions[Math.floor(Math.random() * Math.max(1, questions.length))] ??
      { id: "q-general", text: "What's one thing you're grateful for today?" };

    return [
      {
        id: `eod-${Date.now()}`,
        type: "ASK_REFLECTION_QUESTION",
        priority: 1,
        reason: { code: "END_OF_DAY", detail: "Time for reflection" },
        payload: { questionId: question.id, text: question.text },
        requiresUserConfirm: false,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

function generateReflectionQuestions(ctx: PolicyContext) {
  const questions: Array<{ id: string; text: string }> = [];

  if (ctx.state.completionRate < 0.5) {
    questions.push({ id: "q-low-completion", text: "What got in the way of your plans today?" });
  }
  if (ctx.state.momentum === "stalled") {
    questions.push({ id: "q-momentum", text: "What's one small thing that felt good to do?" });
  }
  if (ctx.state.load === "overloaded") {
    questions.push({ id: "q-overload", text: "What would you remove from today if you could?" });
  }

  return questions.length > 0
    ? questions
    : [{ id: "q-general", text: "What's one thing you're grateful for today?" }];
}

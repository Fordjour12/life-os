import type { Policy } from "../types";

export const habitDownshift: Policy = {
  name: "habit-downshift",
  when: (ctx) => ctx.state.habitHealth === "fragile",
  propose: () => {
    return [
      {
        id: `hd-${Date.now()}`,
        type: "SUGGEST_HABIT_DOWNSHIFT",
        priority: 3,
        reason: { code: "HABIT_FRAGILE", detail: "Habits need recovery too" },
        payload: { newTarget: "3x/week" },
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

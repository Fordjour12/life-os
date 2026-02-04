import type { Policy } from "../types";

export const focusProtection: Policy = {
  name: "focus-protection",
  when: (ctx) => ctx.state.focusCapacity === "low" || ctx.state.focusCapacity === "very_low",
  propose: (ctx) => {
    if (ctx.state.load === "overloaded") {
      return [
        {
          id: `fp-recover-${Date.now()}`,
          type: "SUGGEST_REPLAN_DAY",
          priority: 5,
          reason: { code: "LOW_CAPACITY", detail: "Low focus - reschedule heavy work" },
          payload: { mode: "recovery" },
          requiresUserConfirm: true,
          safety: { scope: "local", risk: "low" },
        },
      ];
    }

    return [
      {
        id: `fp-light-${Date.now()}`,
        type: "SUGGEST_LIGHT_DAY",
        priority: 3,
        reason: { code: "LOW_CAPACITY", detail: "Focus capacity is low today" },
        payload: {},
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

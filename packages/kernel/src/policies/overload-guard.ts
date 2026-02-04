import type { Policy } from "../types";

export const overloadGuard: Policy = {
  name: "overload-guard",
  when: (ctx) => ctx.state.load === "overloaded",
  propose: (ctx) => {
    const overloadRatio = ctx.facts.plannedMinutes / Math.max(1, ctx.facts.freeMinutes);

    if (overloadRatio > 1.5) {
      return [
        {
          id: `og-remove-${Date.now()}`,
          type: "SUGGEST_REDUCE_SCOPE",
          priority: 5,
          reason: {
            code: "OVERLOAD_HIGH",
            detail: `Planning ${Math.round(overloadRatio * 100)}% of time`,
          },
          payload: { count: 3 },
          requiresUserConfirm: true,
          safety: { scope: "local", risk: "low" },
        },
      ];
    }

    return [
      {
        id: `og-reschedule-${Date.now()}`,
        type: "SUGGEST_TIMEBLOCK",
        priority: 4,
        reason: { code: "OVERLOAD_MODERATE", detail: "Some tasks need better scheduling" },
        payload: {},
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

import type { Policy } from "../types";

export const financialDriftWatch: Policy = {
  name: "financial-drift-watch",
  when: (ctx) => ctx.state.financialDrift === "risk",
  propose: (_ctx) => {
    return [
      {
        id: `fdw-${Date.now()}`,
        type: "SUGGEST_NO_SPEND_TODAY",
        priority: 2,
        reason: { code: "FINANCIAL_DRIFT", detail: "Spending ahead of plan" },
        payload: {},
        requiresUserConfirm: false,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

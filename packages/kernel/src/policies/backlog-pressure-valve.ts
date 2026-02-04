import type { Policy } from "../types";

export const backlogPressureValve: Policy = {
  name: "backlog-pressure-valve",
  when: (ctx) => ctx.state.backlogPressure > 60,
  propose: (ctx) => {
    return [
      {
        id: `bpv-${Date.now()}`,
        type: "SUGGEST_BACKLOG_CLEANUP",
        priority: 2,
        reason: { code: "BACKLOG_HIGH", detail: `${ctx.facts.backlogCount} items waiting` },
        payload: { count: Math.ceil(ctx.facts.backlogCount / 10) },
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

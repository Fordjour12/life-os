import type { Policy } from "../types";

export const momentumBuilder: Policy = {
  name: "momentum-builder",
  when: (ctx) => ctx.state.momentum === "stalled",
  propose: (ctx) => {
    const hasBacklog = ctx.facts.backlogCount > 0;

    if (hasBacklog) {
      return [
        {
          id: `mb-tinywin-${Date.now()}`,
          type: "SUGGEST_TINY_WIN",
          priority: 4,
          reason: { code: "MOMENTUM_STALLED", detail: "A small win could restart your momentum" },
          payload: { taskId: "backlog-tiny-win" },
          requiresUserConfirm: false,
          safety: { scope: "local", risk: "low" },
        },
      ];
    }

    return [
      {
        id: `mb-lightday-${Date.now()}`,
        type: "SUGGEST_LIGHT_DAY",
        priority: 3,
        reason: { code: "MOMENTUM_STALLED", detail: "Try a lighter day to build momentum" },
        payload: {},
        requiresUserConfirm: true,
        safety: { scope: "local", risk: "low" },
      },
    ];
  },
};

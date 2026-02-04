import type { Policy, PolicyContext, ProposedAction } from "../types";

export interface PolicyEngine {
  runPolicies(ctx: PolicyContext): ProposedAction[];
  addPolicy(policy: Policy): void;
  removePolicy(name: string): void;
  getPolicies(): Policy[];
}

class DefaultPolicyEngine implements PolicyEngine {
  private policies: Policy[] = [];
  private lastShown = new Map<string, number>();

  runPolicies(ctx: PolicyContext): ProposedAction[] {
    const allActions: ProposedAction[] = [];

    for (const policy of this.policies) {
      if (policy.when(ctx)) {
        const actions = policy.propose(ctx);
        allActions.push(...actions);
      }
    }

    const resolved = this.resolveConflicts(allActions, ctx);
    for (const action of resolved) {
      this.lastShown.set(action.type, Date.now());
    }
    return resolved;
  }

  addPolicy(policy: Policy): void {
    this.policies.push(policy);
  }

  removePolicy(name: string): void {
    this.policies = this.policies.filter((policy) => policy.name !== name);
  }

  getPolicies(): Policy[] {
    return [...this.policies];
  }

  private resolveConflicts(actions: ProposedAction[], ctx: PolicyContext): ProposedAction[] {
    const byType = new Map<string, ProposedAction>();
    for (const action of actions) {
      const existing = byType.get(action.type);
      if (!existing || action.priority > existing.priority) {
        byType.set(action.type, action);
      }
    }

    const now = Date.now();
    const filtered = Array.from(byType.values()).filter((action) => {
      if (!action.cooldownHours) return true;
      const lastShown = this.getLastShown(action.type);
      if (!lastShown) return true;
      return now - lastShown > action.cooldownHours * 60 * 60 * 1000;
    });

    const modeGuarded = filtered.filter((action) => {
      if (action.type === "SUGGEST_REPLAN_DAY" && ctx.state.mode === "recovery") {
        return false;
      }
      return true;
    });

    return modeGuarded.sort((a, b) => b.priority - a.priority).slice(0, 3);
  }

  private getLastShown(actionType: string): number | null {
    return this.lastShown.get(actionType) ?? null;
  }
}

export const policyEngine = new DefaultPolicyEngine();
export type { Policy, PolicyContext, ProposedAction };

export { backlogPressureValve } from "./backlog-pressure-valve";
export { endOfDayReview } from "./end-of-day-review";
export { financialDriftWatch } from "./financial-drift-watch";
export { focusProtection } from "./focus-protection";
export { habitDownshift } from "./habit-downshift";
export { momentumBuilder } from "./momentum-builder";
export { overloadGuard } from "./overload-guard";

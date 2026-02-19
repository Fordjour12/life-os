import { useCallback, useMemo } from "react";

import { api } from "@life-os/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { getTimezoneOffsetMinutes } from "./date";

export type Expense = {
  id: string;
  ts: number;
  day: string;
  amount: number;
  category: string;
  note?: string;
};

export type Budget = {
  category: string;
  monthlyLimit: number;
};

export type CategorySummary = {
  category: string;
  spent: number;
  budget: number;
  remaining: number;
};

export type FinancialData = {
  month: string;
  expenses: Expense[];
  budgets: Budget[];
  byCategory: CategorySummary[];
  totalSpent: number;
  totalBudget: number;
  totalRemaining: number;
};

export function useFinancialData(month?: string) {
  const data = useQuery(api.kernel.commands.getFinancialData, {
    month,
  });
  return data;
}

export function useAddExpense() {
  const execute = useMutation(api.kernel.commands.executeCommand);

  return useCallback(
    async (amount: number, category: string, note?: string) => {
      await execute({
        command: {
          cmd: "add_expense",
          input: { amount, category, note },
          idempotencyKey: `expense:${Date.now()}:${Math.random().toString(16).slice(2)}`,
          tzOffsetMinutes: getTimezoneOffsetMinutes(),
        },
      });
    },
    [execute],
  );
}

export function useSetBudget() {
  const execute = useMutation(api.kernel.commands.executeCommand);

  return useCallback(
    async (category: string, monthlyLimit: number) => {
      await execute({
        command: {
          cmd: "set_budget",
          input: { category, monthlyLimit },
          idempotencyKey: `budget:${category}:${Date.now()}`,
          tzOffsetMinutes: getTimezoneOffsetMinutes(),
        },
      });
    },
    [execute],
  );
}

export const EXPENSE_CATEGORIES = [
  "food",
  "transport",
  "entertainment",
  "shopping",
  "utilities",
  "health",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

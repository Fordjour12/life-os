import type { KernelCommand, KernelEvent } from "./types";
import { eventStore } from "./events";

type CommandResult =
  | { success: true; events: KernelEvent[] }
  | { success: false; error: string; code: "VALIDATION_ERROR" | "GUARDRAIL_ERROR" | "NOT_FOUND" };

interface CommandHandler<C extends KernelCommand> {
  validate(input: unknown): { valid: boolean; error?: string };
  guardrails(command: C, existingState: unknown): { pass: boolean; reason?: string };
  execute(command: C): Promise<KernelEvent[]>;
}

type CommandMap = {
  create_task: Extract<KernelCommand, { cmd: "create_task" }>;
  complete_task: Extract<KernelCommand, { cmd: "complete_task" }>;
  reschedule_task: Extract<KernelCommand, { cmd: "reschedule_task" }>;
  delete_task: Extract<KernelCommand, { cmd: "delete_task" }>;
  add_expense: Extract<KernelCommand, { cmd: "add_expense" }>;
  set_daily_plan: Extract<KernelCommand, { cmd: "set_daily_plan" }>;
  apply_reschedule: Extract<KernelCommand, { cmd: "apply_reschedule" }>;
  downshift_habit: Extract<KernelCommand, { cmd: "downshift_habit" }>;
  accept_suggestion: Extract<KernelCommand, { cmd: "accept_suggestion" }>;
};

const commandHandlers: { [K in keyof CommandMap]: CommandHandler<CommandMap[K]> } = {
  create_task: {
    validate: (input) => {
      if (typeof input !== "object" || input === null) {
        return { valid: false, error: "Invalid input" };
      }
      const req = input as { title?: string; estimateMin?: number };
      if (typeof req.title !== "string" || req.title.trim().length === 0) {
        return { valid: false, error: "Title required" };
      }
      if (typeof req.estimateMin !== "number" || req.estimateMin < 5 || req.estimateMin > 480) {
        return { valid: false, error: "Estimate must be 5-480 minutes" };
      }
      return { valid: true };
    },
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => {
      const taskId = `tsk_${Date.now()}`;
      return [
        {
          type: "TASK_CREATED",
          taskId,
          ts: Date.now(),
          meta: cmd.input,
        },
      ];
    },
  },
  complete_task: {
    validate: (input) => {
      const req = input as { taskId: string };
      if (!req.taskId) return { valid: false, error: "TaskId required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "TASK_COMPLETED",
        taskId: cmd.input.taskId,
        ts: Date.now(),
      },
    ],
  },
  reschedule_task: {
    validate: (input) => {
      const req = input as { taskId: string; newDate: string };
      if (!req.taskId || !req.newDate) return { valid: false, error: "TaskId and newDate required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "TASK_RESCHEDULED",
        taskId: cmd.input.taskId,
        oldDate: "unknown",
        newDate: cmd.input.newDate,
        ts: Date.now(),
      },
    ],
  },
  delete_task: {
    validate: (input) => {
      const req = input as { taskId: string };
      if (!req.taskId) return { valid: false, error: "TaskId required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "TASK_DELETED",
        taskId: cmd.input.taskId,
        ts: Date.now(),
      },
    ],
  },
  add_expense: {
    validate: (input) => {
      if (typeof input !== "object" || input === null) {
        return { valid: false, error: "Invalid input" };
      }
      const req = input as { amount?: number; category?: string };
      if (!req.category) return { valid: false, error: "Category required" };
      if (typeof req.amount !== "number" || req.amount <= 0) {
        return { valid: false, error: "Amount must be a number greater than 0" };
      }
      return { valid: true };
    },
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "EXPENSE_ADDED",
        expenseId: `exp_${Date.now()}`,
        amount: cmd.input.amount,
        category: cmd.input.category,
        ts: Date.now(),
        meta: { note: cmd.input.note },
      },
    ],
  },
  set_daily_plan: {
    validate: (input) => {
      const req = input as { day: string; top3TaskIds: string[] };
      if (!req.day) return { valid: false, error: "Day required" };
      if (!Array.isArray(req.top3TaskIds)) return { valid: false, error: "top3TaskIds required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "PLAN_SET",
        day: cmd.input.day,
        top3TaskIds: cmd.input.top3TaskIds,
        ts: Date.now(),
      },
    ],
  },
  apply_reschedule: {
    validate: (input) => {
      const req = input as { taskId: string; newDate: string };
      if (!req.taskId || !req.newDate) return { valid: false, error: "TaskId and newDate required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "TASK_RESCHEDULED",
        taskId: cmd.input.taskId,
        oldDate: "unknown",
        newDate: cmd.input.newDate,
        ts: Date.now(),
      },
    ],
  },
  downshift_habit: {
    validate: (input) => {
      const req = input as { habitId: string; newTarget: string };
      if (!req.habitId || !req.newTarget) return { valid: false, error: "HabitId and newTarget required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "HABIT_MISSED",
        habitId: cmd.input.habitId,
        ts: Date.now(),
        meta: { newTarget: cmd.input.newTarget },
      },
    ],
  },
  accept_suggestion: {
    validate: (input) => {
      const req = input as { suggestionId: string };
      if (!req.suggestionId) return { valid: false, error: "SuggestionId required" };
      return { valid: true };
    },
    guardrails: () => ({ pass: true }),
    execute: async (cmd) => [
      {
        type: "COACHING_FEEDBACK",
        suggestionId: cmd.input.suggestionId,
        action: "accepted",
        ts: Date.now(),
      },
    ],
  },
};

function getHandler<C extends keyof CommandMap>(cmd: C): CommandHandler<CommandMap[C]> {
  return commandHandlers[cmd];
}

export async function executeCommand(command: KernelCommand): Promise<CommandResult> {
  const handler = getHandler(command.cmd as keyof CommandMap);
  const typedCommand = command as CommandMap[keyof CommandMap];

  if (!handler) {
    return { success: false, error: `Unknown command: ${command.cmd}`, code: "VALIDATION_ERROR" };
  }

  const validation = handler.validate(typedCommand.input);
  if (!validation.valid) {
    return { success: false, error: validation.error ?? "Invalid command", code: "VALIDATION_ERROR" };
  }

  const guardrails = handler.guardrails(typedCommand, null);
  if (!guardrails.pass) {
    return { success: false, error: guardrails.reason ?? "Guardrail blocked", code: "GUARDRAIL_ERROR" };
  }

  const events = await handler.execute(typedCommand);
  for (const event of events) {
    await eventStore.appendEvent(event);
  }

  return { success: true, events };
}

export type { CommandResult };

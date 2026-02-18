export type LocalEventRecord = {
  id: string;
  userId: string;
  ts: number;
  type: string;
  meta: Record<string, unknown>;
  idempotencyKey: string;
  syncedAt?: number;
};

export type LocalStateDailyRecord = {
  userId: string;
  day: string;
  state: Record<string, unknown>;
  updatedAt: number;
};

export type LocalSuggestionRecord = {
  id: string;
  userId: string;
  day: string;
  type: string;
  priority: number;
  reason: { code: string; detail: string };
  payload: Record<string, unknown>;
  status: "new" | "accepted" | "downvoted" | "ignored" | "expired";
  cooldownKey?: string;
  createdAt: number;
  updatedAt: number;
};

export type OutboxCommandStatus = "pending" | "failed" | "acked";

export type OutboxCommandRecord = {
  id: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  status: OutboxCommandStatus;
  lastError?: string;
  attempts: number;
  command: {
    cmd: string;
    input: Record<string, unknown>;
    idempotencyKey: string;
    tzOffsetMinutes?: number;
    traceId?: string;
    commandId?: string;
  };
};

export type SyncCursorRecord = {
  userId: string;
  cursor: string | null;
  updatedAt: number;
};

import { storage } from "@/lib/storage";

import type {
  LocalEventRecord,
  LocalStateDailyRecord,
  LocalSuggestionRecord,
  OutboxCommandRecord,
  SyncCursorRecord,
} from "./types";

const STORE_VERSION_KEY = "lf:schema_version";
const EVENTS_KEY = "lf:local_events";
const STATE_DAILY_KEY = "lf:local_state_daily";
const SUGGESTIONS_KEY = "lf:local_suggestions";
const OUTBOX_KEY = "lf:outbox_commands";
const CURSORS_KEY = "lf:sync_cursors";
const CURRENT_SCHEMA_VERSION = 1;

function now() {
  return Date.now();
}

function uid(prefix: string) {
  return `${prefix}_${now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseJSON<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readList<T>(key: string): T[] {
  const raw = storage.getString(key);
  return parseJSON<T[]>(raw, []);
}

function writeList<T>(key: string, list: T[]) {
  storage.set(key, JSON.stringify(list));
}

export function initializeLocalFirstStore() {
  const existing = storage.getNumber(STORE_VERSION_KEY);
  if (existing === CURRENT_SCHEMA_VERSION) return;
  storage.set(STORE_VERSION_KEY, CURRENT_SCHEMA_VERSION);
}

export function appendLocalEvent(input: Omit<LocalEventRecord, "id">) {
  const events = readList<LocalEventRecord>(EVENTS_KEY);
  const record: LocalEventRecord = {
    id: uid("evt"),
    ...input,
  };
  events.push(record);
  writeList(EVENTS_KEY, events);
  return record;
}

export function listLocalEvents(userId: string, day?: string) {
  const events = readList<LocalEventRecord>(EVENTS_KEY).filter(
    (event) => event.userId === userId,
  );
  if (!day) return events.sort((a, b) => a.ts - b.ts);
  return events
    .filter((event) => new Date(event.ts).toISOString().slice(0, 10) === day)
    .sort((a, b) => a.ts - b.ts);
}

export function upsertLocalStateDaily(input: LocalStateDailyRecord) {
  const entries = readList<LocalStateDailyRecord>(STATE_DAILY_KEY);
  const index = entries.findIndex(
    (entry) => entry.userId === input.userId && entry.day === input.day,
  );
  if (index >= 0) {
    entries[index] = input;
  } else {
    entries.push(input);
  }
  writeList(STATE_DAILY_KEY, entries);
}

export function getLocalStateDaily(userId: string, day: string) {
  return readList<LocalStateDailyRecord>(STATE_DAILY_KEY).find(
    (entry) => entry.userId === userId && entry.day === day,
  );
}

export function replaceLocalSuggestionsForDay(
  userId: string,
  day: string,
  suggestions: Array<Omit<LocalSuggestionRecord, "id" | "userId" | "day">>,
) {
  const existing = readList<LocalSuggestionRecord>(SUGGESTIONS_KEY).filter(
    (entry) => !(entry.userId === userId && entry.day === day),
  );
  const next = suggestions.map((suggestion) => ({
    id: uid("sug"),
    userId,
    day,
    ...suggestion,
  }));
  writeList(SUGGESTIONS_KEY, [...existing, ...next]);
  return next;
}

export function getLocalSuggestionsForDay(userId: string, day: string) {
  return readList<LocalSuggestionRecord>(SUGGESTIONS_KEY)
    .filter(
      (suggestion) =>
        suggestion.userId === userId &&
        suggestion.day === day &&
        suggestion.status === "new",
    )
    .sort((a, b) => b.priority - a.priority);
}

export function enqueueOutboxCommand(
  input: Omit<OutboxCommandRecord, "id" | "createdAt" | "updatedAt" | "attempts" | "status">,
) {
  const outbox = readList<OutboxCommandRecord>(OUTBOX_KEY);
  const record: OutboxCommandRecord = {
    id: uid("cmd"),
    createdAt: now(),
    updatedAt: now(),
    attempts: 0,
    status: "pending",
    ...input,
  };
  outbox.push(record);
  writeList(OUTBOX_KEY, outbox);
  return record;
}

export function listPendingOutboxCommands(userId: string, limit = 20) {
  return readList<OutboxCommandRecord>(OUTBOX_KEY)
    .filter((entry) => entry.userId === userId && entry.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, limit);
}

export function markOutboxCommandAcked(id: string) {
  const outbox = readList<OutboxCommandRecord>(OUTBOX_KEY);
  const index = outbox.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  outbox[index] = {
    ...outbox[index],
    status: "acked",
    updatedAt: now(),
    attempts: outbox[index].attempts + 1,
    lastError: undefined,
  };
  writeList(OUTBOX_KEY, outbox);
  return true;
}

export function markOutboxCommandFailed(id: string, error: string) {
  const outbox = readList<OutboxCommandRecord>(OUTBOX_KEY);
  const index = outbox.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  outbox[index] = {
    ...outbox[index],
    status: "failed",
    updatedAt: now(),
    attempts: outbox[index].attempts + 1,
    lastError: error,
  };
  writeList(OUTBOX_KEY, outbox);
  return true;
}

export function retryFailedOutboxCommand(id: string) {
  const outbox = readList<OutboxCommandRecord>(OUTBOX_KEY);
  const index = outbox.findIndex((entry) => entry.id === id);
  if (index < 0) return false;
  outbox[index] = {
    ...outbox[index],
    status: "pending",
    updatedAt: now(),
  };
  writeList(OUTBOX_KEY, outbox);
  return true;
}

export function pruneAckedOutboxCommands(userId: string, keep = 50) {
  const entries = readList<OutboxCommandRecord>(OUTBOX_KEY);
  const active = entries.filter(
    (entry) => !(entry.userId === userId && entry.status === "acked"),
  );
  const acked = entries
    .filter((entry) => entry.userId === userId && entry.status === "acked")
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, keep);
  writeList(OUTBOX_KEY, [...active, ...acked]);
}

export function setSyncCursor(userId: string, cursor: string | null) {
  const records = readList<SyncCursorRecord>(CURSORS_KEY);
  const next: SyncCursorRecord = {
    userId,
    cursor,
    updatedAt: now(),
  };
  const index = records.findIndex((entry) => entry.userId === userId);
  if (index >= 0) {
    records[index] = next;
  } else {
    records.push(next);
  }
  writeList(CURSORS_KEY, records);
}

export function getSyncCursor(userId: string) {
  return readList<SyncCursorRecord>(CURSORS_KEY).find(
    (entry) => entry.userId === userId,
  );
}

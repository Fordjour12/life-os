import { createMMKV, type MMKV } from "react-native-mmkv";

import type { KernelEvent } from "./types";

interface EventStore {
  appendEvent(event: KernelEvent): Promise<void>;
  getEvents(since?: number, until?: number): Promise<KernelEvent[]>;
  getEventsByType(types: KernelEvent["type"][], since?: number): Promise<KernelEvent[]>;
  getEventCount(): Promise<number>;
  clear(): Promise<void>;
}

const EVENT_STORE_KEY = "@kernel/events";

type StoredEvent = KernelEvent & { _id: string };

class MMKVEventStore implements EventStore {
  private storage: MMKV;

  constructor() {
    this.storage = createMMKV({ id: "kernel-events" });
  }

  async appendEvent(event: KernelEvent): Promise<void> {
    const events = this.getAllEvents();
    const idempotencyKey = this.getEventKey(event);

    if (events.some((existing) => this.getEventKey(existing) === idempotencyKey)) {
      return;
    }

    events.push({ ...event, _id: this.createId() });
    this.storage.set(EVENT_STORE_KEY, JSON.stringify(events));
  }

  async getEvents(since?: number, until?: number): Promise<KernelEvent[]> {
    const events = this.getAllEvents();
    return events
      .filter((event) => {
        if (typeof since === "number" && event.ts < since) return false;
        if (typeof until === "number" && event.ts > until) return false;
        return true;
      })
      .sort((a, b) => a.ts - b.ts);
  }

  async getEventsByType(types: KernelEvent["type"][], since?: number): Promise<KernelEvent[]> {
    const events = typeof since === "number" ? await this.getEvents(since) : this.getAllEvents();
    return events.filter((event) => types.includes(event.type));
  }

  async getEventCount(): Promise<number> {
    return this.getAllEvents().length;
  }

  async clear(): Promise<void> {
    this.storage.clearAll();
  }

  private getAllEvents(): StoredEvent[] {
    const raw = this.storage.getString(EVENT_STORE_KEY);
    return raw ? (JSON.parse(raw) as StoredEvent[]) : [];
  }

  private createId(): string {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private getEventKey(event: KernelEvent): string {
    if ("taskId" in event) return `${event.type}-${event.taskId}-${event.ts}`;
    if ("habitId" in event) return `${event.type}-${event.habitId}-${event.ts}`;
    if ("blockId" in event) return `${event.type}-${event.blockId}-${event.ts}`;
    if ("expenseId" in event) return `${event.type}-${event.expenseId}-${event.ts}`;
    if ("suggestionId" in event) return `${event.type}-${event.suggestionId}-${event.ts}`;
    return `${event.type}-${event.ts}`;
  }
}

export const eventStore = new MMKVEventStore();
export type { EventStore };

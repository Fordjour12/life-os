import type { KernelEvent } from "./types";

export function createReducerFixture(overrides?: { day?: string; events?: KernelEvent[] }) {
  return {
    day: overrides?.day ?? "2026-01-01",
    events: overrides?.events ?? [],
  };
}

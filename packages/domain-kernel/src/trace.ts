export type DomainTraceContext = {
  traceId: string;
  commandId: string;
};

function normalizeSegment(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

export function buildTraceContext(input?: {
  traceId?: unknown;
  commandId?: unknown;
  fallbackKey?: string;
}): DomainTraceContext {
  const now = Date.now();
  const fallback = normalizeSegment(input?.fallbackKey) ?? `cmd_${now}_${randomSuffix()}`;
  const commandId = normalizeSegment(input?.commandId) ?? fallback;
  const traceId = normalizeSegment(input?.traceId) ?? `trace_${commandId}`;

  return { traceId, commandId };
}

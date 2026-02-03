import { v } from "convex/values";

import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";

type ParsedBlock = {
  day: string;
  startMin: number;
  endMin: number;
  kind: "busy";
  title?: string;
  externalId?: string;
};

function unfoldLines(text: string) {
  const lines = text.split(/\r?\n/);
  const unfolded: string[] = [];
  for (const line of lines) {
    if (
      (line.startsWith(" ") || line.startsWith("\t")) &&
      unfolded.length > 0
    ) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line.trim());
    }
  }
  return unfolded.filter(Boolean);
}

function parseIcsDate(value: string) {
  if (/^\d{8}$/.test(value)) {
    const yyyy = value.slice(0, 4);
    const mm = value.slice(4, 6);
    const dd = value.slice(6, 8);
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  }

  if (/^\d{8}T\d{6}Z?$/.test(value)) {
    const datePart = value.slice(0, 8);
    const timePart = value.slice(9, 15);
    const yyyy = datePart.slice(0, 4);
    const mm = datePart.slice(4, 6);
    const dd = datePart.slice(6, 8);
    const hh = timePart.slice(0, 2);
    const min = timePart.slice(2, 4);
    const ss = timePart.slice(4, 6);
    const suffix = value.endsWith("Z") ? "Z" : "Z";
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}${suffix}`);
  }

  return null;
}

function toDayString(date: Date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toMinutes(date: Date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function parseIcs(text: string) {
  const lines = unfoldLines(text);
  const blocks: ParsedBlock[] = [];
  let skipped = 0;

  let inEvent = false;
  let uid = "";
  let dtStart: Date | null = null;
  let dtEnd: Date | null = null;
  let summary = "";
  let isAllDay = false;

  const flushEvent = () => {
    if (!dtStart || !dtEnd) {
      skipped += 1;
      return;
    }

    const day = toDayString(dtStart);
    const endDay = toDayString(dtEnd);
    if (day !== endDay) {
      skipped += 1;
      return;
    }

    const startMin = isAllDay ? 0 : toMinutes(dtStart);
    const endMin = isAllDay ? 1440 : toMinutes(dtEnd);
    if (endMin <= startMin) {
      skipped += 1;
      return;
    }

    blocks.push({
      day,
      startMin,
      endMin,
      kind: "busy",
      title: summary || undefined,
      externalId: uid || undefined,
    });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      dtStart = null;
      dtEnd = null;
      summary = "";
      isAllDay = false;
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent) flushEvent();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith("UID:")) {
      uid = line.slice(4).trim();
      continue;
    }

    if (line.startsWith("SUMMARY:")) {
      summary = line.slice(8).trim();
      continue;
    }

    if (line.startsWith("DTSTART")) {
      const value = line.split(":").slice(1).join(":");
      const parsed = parseIcsDate(value);
      dtStart = parsed;
      isAllDay = /^\d{8}$/.test(value);
      continue;
    }

    if (line.startsWith("DTEND")) {
      const value = line.split(":").slice(1).join(":");
      const parsed = parseIcsDate(value);
      dtEnd = parsed;
      continue;
    }
  }

  return { blocks, skipped };
}

type ImportResult = {
  inserted: number;
  skipped: number;
};

export const importFromIcsUrl = action({
  args: {
    url: v.string(),
  },
  handler: async (ctx: ActionCtx, args: { url: string }): Promise<ImportResult> => {
    const trimmed = String(args.url).trim();
    if (!/^https?:\/\//.test(trimmed)) {
      throw new Error("ICS URL must start with http(s)");
    }

    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`Failed to fetch ICS (${response.status})`);
    }

    const text = await response.text();
    const { blocks, skipped } = parseIcs(text);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: { inserted: number; skipped: number } = await (ctx as any).runMutation(
      "calendar/importBlocks",
      { blocks }
    );

    return {
      inserted: result.inserted,
      skipped: result.skipped + skipped,
    };
  },
});

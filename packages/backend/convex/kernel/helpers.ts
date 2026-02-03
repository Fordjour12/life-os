export const MILLISECONDS_IN_DAY = 24 * 60 * 60 * 1000;

export function formatYYYYMMDD(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getISOWeekIdFromDate(date: Date): string {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const year = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / MILLISECONDS_IN_DAY + 1) / 7,
  );
  return `${year}-${String(week).padStart(2, "0")}`;
}

export function getISOWeekStartDate(weekId: string): Date {
  const [yearPart, weekPart] = weekId.split("-");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    throw new Error("Week must be YYYY-WW");
  }

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const weekStart = new Date(week1Monday);
  weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return weekStart;
}

export function getDefaultWeekId(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 7);
  return getISOWeekIdFromDate(date);
}

export function getTodayYYYYMMDD(): string {
  const date = new Date();
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function truncate<T extends Record<string, unknown>>(
  obj: T,
  maxDepth = 3,
): T {
  if (maxDepth <= 0) return {} as T;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.slice(0, 500);
    } else if (typeof value === "number") {
      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .slice(0, 50)
        .map((item) =>
          typeof item === "object" && item !== null
            ? truncate(item, maxDepth - 1)
            : item,
        );
    } else if (typeof value === "object" && value !== null) {
      result[key] = truncate(value as Record<string, unknown>, maxDepth - 1);
    }
  }
  return result as T;
}

export function normalizePlanEstimate(value: number): number {
  if (!Number.isFinite(value)) return 25;
  const allowedPlanEstimates = [10, 25, 45, 60];
  return allowedPlanEstimates.reduce((closest, estimate) =>
    Math.abs(estimate - value) < Math.abs(closest - value) ? estimate : closest,
  );
}

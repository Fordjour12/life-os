type CalendarBlock = { startMin: number; endMin: number; kind: string };

const DAILY_CAPACITY_MIN = 480;
const NON_FOCUS_WEIGHT = 0.6;

export const DAILY_SUGGESTION_CAP = 3;
export const LATE_NIGHT_START_MIN = 22 * 60 + 30;
export const LATE_NIGHT_END_MIN = 6 * 60;

export function getTimeMetricsFromBlocks(blocks: CalendarBlock[]) {
  const busyMinutes = blocks
    .filter((block) => block.kind === "busy")
    .reduce((total, block) => total + (block.endMin - block.startMin), 0);

  const focusMinutes = blocks
    .filter((block) => block.kind === "focus")
    .reduce((total, block) => total + (block.endMin - block.startMin), 0);

  const freeMinutes = Math.max(0, DAILY_CAPACITY_MIN - busyMinutes);
  const focusWithinFree = Math.min(freeMinutes, focusMinutes);
  const nonFocusFree = Math.max(0, freeMinutes - focusWithinFree);
  const effectiveFreeMinutes = Math.round(
    focusWithinFree + nonFocusFree * NON_FOCUS_WEIGHT,
  );

  return { freeMinutes, effectiveFreeMinutes, focusMinutes, busyMinutes };
}

function getMinuteOfDayUTC(now: number) {
  const date = new Date(now);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function isMinuteWithinWindow(minute: number, startMin: number, endMin: number) {
  if (startMin <= endMin) {
    return minute >= startMin && minute < endMin;
  }

  return minute >= startMin || minute < endMin;
}

export function getBoundaryFlagsFromBlocks(
  blocks: CalendarBlock[],
  now: number,
  tzOffsetMinutes: number,
) {
  const minute = getMinuteOfDayUTC(now + tzOffsetMinutes * 60 * 1000);
  const isRestWindow = blocks.some(
    (block) =>
      block.kind === "rest" && isMinuteWithinWindow(minute, block.startMin, block.endMin),
  );
  const isFocusProtection = blocks.some(
    (block) =>
      block.kind === "focus" && isMinuteWithinWindow(minute, block.startMin, block.endMin),
  );
  const isLateNight =
    isRestWindow && isMinuteWithinWindow(minute, LATE_NIGHT_START_MIN, LATE_NIGHT_END_MIN);

  return { isLateNight, isRestWindow, isFocusProtection };
}

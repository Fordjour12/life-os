type DateInput = Date | string | number;

function toDate(input?: DateInput) {
  if (input instanceof Date) return input;
  return new Date(input ?? Date.now());
}

export function formatLongDate(input?: DateInput) {
  return toDate(input)
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .toUpperCase();
}

export function formatShortDate(input?: DateInput) {
  return toDate(input)
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    })
    .toUpperCase();
}

export function getTimezoneOffsetMinutes(date = new Date()) {
  return -date.getTimezoneOffset();
}

const forbiddenPhrases = [
  "addiction",
  "diagnose",
  "diagnosis",
  "disorder",
  "label",
  "lazy",
  "procrastinate",
  "you are",
  "you’re",
  "predict",
];

export function isSafeCopy(text: string) {
  const normalized = text.toLowerCase();
  return !forbiddenPhrases.some((phrase) => normalized.includes(phrase));
}

export function safeCopy(text: string, fallback: string) {
  return isSafeCopy(text) ? text : fallback;
}

type SuggestionWithCopy = {
  reason?: { detail?: string };
  payload?: {
    question?: string;
    reflection?: { question?: string };
  };
};

export function sanitizeSuggestionCopy<T extends SuggestionWithCopy>(suggestion: T): T {
  const next = { ...suggestion } as T & SuggestionWithCopy;
  if (next.reason?.detail) {
    next.reason = {
      ...next.reason,
      detail: safeCopy(next.reason.detail, "Gentle suggestion available."),
    };
  }
  if (next.payload?.question) {
    next.payload = {
      ...next.payload,
      question: safeCopy(next.payload.question, "What would feel supportive right now?"),
    };
  }
  if (next.payload?.reflection?.question) {
    next.payload = {
      ...next.payload,
      reflection: {
        ...next.payload.reflection,
        question: safeCopy(
          next.payload.reflection.question,
          "What would feel supportive right now?",
        ),
      },
    };
  }
  return next as T;
}

export function filterSafeStrings(items: string[]) {
  return items.filter(isSafeCopy);
}

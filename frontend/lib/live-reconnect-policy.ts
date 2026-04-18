export interface LiveCloseLike {
  code?: number;
  reason?: string;
}

const TRANSIENT_CLOSE_CODES = new Set([1006, 1011, 1012, 1013]);

const TRANSIENT_REASON_PATTERNS = [
  /network/i,
  /timeout/i,
  /temporar/i,
  /unavailable/i,
  /reset/i,
  /restart/i,
  /try again/i,
];

const NOISY_CLOSE_REASON_PATTERNS = [
  /operation is not implemented,?\s*or supported,?\s*or enabled/i,
  /operation is not implemented/i,
];

export const sanitizeLiveErrorMessage = (
  message: string | null | undefined,
  fallback = "Voice agent disconnected unexpectedly.",
) => {
  const trimmed = typeof message === "string" ? message.trim() : "";
  if (!trimmed) {
    return fallback;
  }

  return NOISY_CLOSE_REASON_PATTERNS.some((pattern) => pattern.test(trimmed))
    ? fallback
    : trimmed;
};

const getNormalizedCloseReason = (event: LiveCloseLike) => {
  const reason = sanitizeLiveErrorMessage(event.reason, "");
  if (!reason) {
    return "";
  }

  return reason;
};

export const shouldRetryLiveClose = (
  event: LiveCloseLike,
  options?: { resumeRequested?: boolean },
) => {
  if (options?.resumeRequested) {
    return true;
  }

  const code = typeof event.code === "number" ? event.code : 0;
  if (TRANSIENT_CLOSE_CODES.has(code)) {
    return true;
  }

  const rawReason = typeof event.reason === "string" ? event.reason.trim() : "";
  if (
    rawReason &&
    NOISY_CLOSE_REASON_PATTERNS.some((pattern) => pattern.test(rawReason))
  ) {
    return true;
  }

  const reason = getNormalizedCloseReason(event);
  if (!reason) {
    return false;
  }

  return TRANSIENT_REASON_PATTERNS.some((pattern) => pattern.test(reason));
};

export const getLiveDisconnectMessage = (event: LiveCloseLike) => {
  const reason = getNormalizedCloseReason(event);
  return reason
    ? `Voice agent disconnected unexpectedly: ${reason}`
    : "Voice agent disconnected unexpectedly.";
};

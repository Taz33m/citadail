export const GENERATED_SESSION_ID_PATTERN =
  /^session-\d+-[a-z0-9]+$/i;

export const isGeneratedShellSessionId = (sessionId: string) =>
  GENERATED_SESSION_ID_PATTERN.test(sessionId);

export const shouldMintFreshSessionForRoute = ({
  hasMatchingSession,
  hasPendingSeed,
  sessionId,
}: {
  sessionId: string;
  hasMatchingSession: boolean;
  hasPendingSeed: boolean;
}) =>
  !hasMatchingSession &&
  !hasPendingSeed &&
  !isGeneratedShellSessionId(sessionId);

import { buildSessionSummary } from "./session-storage";
import type {
  SessionArtifact,
  SessionEvent,
  SessionSnapshot,
  ShellSession,
} from "../types/session";

const MAX_SESSION_ARTIFACTS = 24;

interface ApplySessionUpdateInput {
  sessions: ShellSession[];
  sessionId: string;
  snapshot: SessionSnapshot;
  appendEvent?: SessionEvent;
  appendArtifact?: SessionArtifact;
  nextStatus?: ShellSession["status"];
  nextEndedAt?: Date | null;
  nextSummary?: string;
  updatedAt?: Date;
}

export const applySessionUpdate = ({
  sessions,
  sessionId,
  snapshot,
  appendEvent,
  appendArtifact,
  nextStatus,
  nextEndedAt,
  nextSummary,
  updatedAt = new Date(),
}: ApplySessionUpdateInput): ShellSession[] =>
  sessions.map((session) => {
    if (session.id !== sessionId) {
      return session;
    }

    const updatedSession: ShellSession = {
      ...session,
      status: nextStatus ?? session.status,
      endedAt: nextEndedAt !== undefined ? nextEndedAt : session.endedAt,
      summary: nextSummary ?? session.summary,
      updatedAt,
      events: appendEvent ? [...session.events, appendEvent] : session.events,
      artifacts: appendArtifact
        ? [appendArtifact, ...session.artifacts].slice(0, MAX_SESSION_ARTIFACTS)
        : session.artifacts,
      snapshot,
    };

    return {
      ...updatedSession,
      summary: buildSessionSummary(updatedSession),
    };
  });

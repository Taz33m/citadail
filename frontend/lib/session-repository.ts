import type { SessionSnapshot, ShellSession } from "@/types/session";
import {
  buildSessionSummary,
  createEventId,
  createSessionId,
  deleteSessionTranscript,
  loadShellSessions,
  saveShellSessions,
} from "@/lib/session-storage";

const MAX_SESSIONS = 30;

const buildSnapshot = (): SessionSnapshot => ({
  activeTab: "morning-brief",
  activeArtifactId: null,
  selectedTicker: null,
  thesisDraft: null,
  equityProject: null,
  pmReview: null,
  riskGate: null,
  paperPosition: null,
  transcript: [],
});

const createSessionTitle = (sessions: ShellSession[]) =>
  `Session ${sessions.length + 1}`;

export const createShellSession = (
  sessions: ShellSession[],
  title?: string,
): ShellSession => {
  const now = new Date();

  return {
    id: createSessionId(),
    title: title?.trim() || createSessionTitle(sessions),
    summary: "Session started; no artifacts created yet.",
    status: "active",
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    events: [
      {
        id: createEventId(),
        type: "session_started",
        timestamp: now,
        text: "Session started.",
      },
    ],
    artifacts: [],
    snapshot: buildSnapshot(),
  };
};

export const createShellSessionFromSeed = ({
  createdAt,
  sessionId,
  sessions,
  title,
}: {
  createdAt?: Date;
  sessionId: string;
  sessions: ShellSession[];
  title?: string;
}): ShellSession => {
  const session = createShellSession(sessions, title);
  const now = createdAt ?? new Date();

  return {
    ...session,
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    events: session.events.map((event, index) =>
      index === 0 ? { ...event, timestamp: now } : event,
    ),
  };
};

export interface SessionRepository {
  list(): ShellSession[];
  getById(sessionId: string): ShellSession | null;
  create(title?: string): ShellSession;
  saveAll(sessions: ShellSession[]): void;
  upsert(session: ShellSession): ShellSession[];
  delete(sessionId: string): ShellSession[];
}

class LocalSessionRepository implements SessionRepository {
  list(): ShellSession[] {
    return loadShellSessions();
  }

  getById(sessionId: string): ShellSession | null {
    return this.list().find((session) => session.id === sessionId) ?? null;
  }

  create(title?: string): ShellSession {
    const existing = this.list();
    const session = createShellSession(existing, title);
    this.saveAll([session, ...existing]);
    return session;
  }

  saveAll(sessions: ShellSession[]): void {
    saveShellSessions(sessions.slice(0, MAX_SESSIONS));
  }

  upsert(session: ShellSession): ShellSession[] {
    const existing = this.list();
    const next = existing.some((item) => item.id === session.id)
      ? existing.map((item) => (item.id === session.id ? session : item))
      : [session, ...existing];
    this.saveAll(next);
    return next;
  }

  delete(sessionId: string): ShellSession[] {
    const next = this.list().filter((session) => session.id !== sessionId);
    this.saveAll(next);
    deleteSessionTranscript(sessionId);
    return next;
  }
}

let localRepository: SessionRepository | null = null;

export const getLocalSessionRepository = (): SessionRepository => {
  localRepository ??= new LocalSessionRepository();
  return localRepository;
};

export const ensureSessionSummaries = (
  sessions: ShellSession[],
): ShellSession[] =>
  sessions.map((session) => ({
    ...session,
    summary: buildSessionSummary(session),
  }));

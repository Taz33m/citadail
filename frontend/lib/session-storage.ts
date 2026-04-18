import type {
  EquityProject,
  EquityProjectArtifact,
  EquityProjectArtifactType,
  EquityPaperPosition,
  EquityPmReview,
  EquityRiskGate,
  SessionArtifact,
  SessionEvent,
  SessionSnapshot,
  SessionTranscriptEntry,
  ShellSession,
  ThesisDraft,
  ThesisRecommendation,
  WorkspaceTabId,
} from "@/types/session";
import { createPendingPmReview } from "@/lib/equity-pm-review";
import { createPendingRiskGate } from "@/lib/equity-risk-gate";
import {
  buildPendingArtifacts,
  completeEquityProject,
  failEquityProject,
  isEquityProjectArtifactType,
  normalizeGeneratedContent,
  sanitizeTicker,
} from "@/lib/equity-project";
import { generateDeterministicSummary } from "@/lib/session-summary";

export const SESSION_STORAGE_KEY = "citadail.sessions.v1";
const PENDING_SESSION_SEED_STORAGE_KEY = "citadail.pending-session-seeds.v1";
const TRANSCRIPT_STORAGE_KEY_PREFIX = "citadail.session-transcript.";
const MAX_SESSIONS = 30;

export interface PendingSessionSeed {
  createdAt: string;
  id: string;
  title?: string;
}

const getTranscriptStorageKey = (sessionId: string) =>
  `${TRANSCRIPT_STORAGE_KEY_PREFIX}${sessionId}`;

const isBrowser = () => typeof window !== "undefined";

const toSafeDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const toSafeId = (prefix: "event" | "artifact" | "session") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createSessionId = () => toSafeId("session");
export const createArtifactId = () => toSafeId("artifact");
export const createEventId = () => toSafeId("event");

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const coerceWorkspaceTab = (
  value: unknown,
  artifacts: SessionArtifact[],
  equityProject: EquityProject | null,
  pmReview: EquityPmReview | null,
  riskGate: EquityRiskGate | null,
  paperPosition: EquityPaperPosition | null,
): WorkspaceTabId => {
  if (value === "morning-brief") return "morning-brief";
  if (value === "live-book") return "live-book";
  if (value === "coverage-desk") return "coverage-desk";
  if (value === "thesis") return "thesis";
  if (value === "pm-review" && equityProject?.status === "ready") {
    return "pm-review";
  }
  if (
    value === "risk-gate" &&
    equityProject?.status === "ready" &&
    (pmReview?.decision === "approved_to_risk" || riskGate)
  ) {
    return "risk-gate";
  }
  if (
    value === "trade-desk" &&
    equityProject?.status === "ready" &&
    (riskGate?.decision === "approved_to_desk" || paperPosition)
  ) {
    return "trade-desk";
  }
  if (value === "thread") return "thread";
  if (typeof value === "string" && value.startsWith("project:")) {
    const artifactType = value.slice("project:".length);
    if (
      equityProject &&
      isEquityProjectArtifactType(artifactType) &&
      equityProject.artifacts[artifactType]
    ) {
      return value as WorkspaceTabId;
    }
  }
  if (typeof value === "string" && value.startsWith("artifact:")) {
    const artifactId = value.slice("artifact:".length);
    if (artifacts.some((artifact) => artifact.id === artifactId)) {
      return value as WorkspaceTabId;
    }
  }
  return "morning-brief";
};

const normalizeThesisRecommendation = (
  value: unknown,
): ThesisRecommendation | null => {
  if (
    value === "buy-long" ||
    value === "hold-neutral" ||
    value === "sell-short"
  ) {
    return value;
  }

  return null;
};

const normalizeThesisDraft = (
  value: unknown,
  fallbackTicker: string | null,
): ThesisDraft | null => {
  if (!value || typeof value !== "object") {
    return fallbackTicker
      ? {
          ticker: fallbackTicker,
          recommendation: null,
          rationale: "",
          submittedAt: null,
        }
      : null;
  }

  const candidate = value as Record<string, unknown>;
  const ticker = toNonEmptyString(candidate.ticker) ?? fallbackTicker;
  if (!ticker) return null;

  return {
    ticker: ticker.toUpperCase(),
    recommendation: normalizeThesisRecommendation(candidate.recommendation),
    rationale:
      typeof candidate.rationale === "string" ? candidate.rationale : "",
    submittedAt: toNonEmptyString(candidate.submittedAt),
  };
};

const normalizeArtifact = (value: unknown): SessionArtifact | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const title = toNonEmptyString(candidate.title);
  const summary = toNonEmptyString(candidate.summary);
  const content = toNonEmptyString(candidate.content);

  if (!title || !summary || !content) return null;

  return {
    id: toNonEmptyString(candidate.id) ?? createArtifactId(),
    type:
      candidate.type === "data" || candidate.type === "tool_result"
        ? candidate.type
        : "text",
    title,
    summary,
    content,
    createdAt: toSafeDate(candidate.createdAt),
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : undefined,
  };
};

const normalizeProjectArtifact = (
  value: unknown,
  artifactType: EquityProjectArtifactType,
  fallback: EquityProjectArtifact,
): EquityProjectArtifact => {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const status =
    candidate.status === "ready" || candidate.status === "failed"
      ? candidate.status
      : "generating";

  return {
    ...fallback,
    title: toNonEmptyString(candidate.title) ?? fallback.title,
    status,
    filename: toNonEmptyString(candidate.filename) ?? fallback.filename,
    mimeType: toNonEmptyString(candidate.mimeType) ?? fallback.mimeType,
    preview: toNonEmptyString(candidate.preview) ?? fallback.preview,
    error: toNonEmptyString(candidate.error),
    type: artifactType,
  };
};

const normalizeEquityProject = (value: unknown): EquityProject | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const ticker = sanitizeTicker(toNonEmptyString(candidate.ticker) ?? "");
  const recommendation = normalizeThesisRecommendation(candidate.recommendation);
  const rationale = toNonEmptyString(candidate.rationale);

  if (!ticker || !recommendation || !rationale) return null;

  const pendingArtifacts = buildPendingArtifacts(ticker);
  const rawArtifacts =
    candidate.artifacts && typeof candidate.artifacts === "object"
      ? (candidate.artifacts as Record<string, unknown>)
      : {};
  const baseProject: EquityProject = {
    id:
      toNonEmptyString(candidate.id) ??
      `equity-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticker,
    recommendation,
    rationale,
    status: "generating",
    createdAt: toSafeDate(candidate.createdAt).toISOString(),
    updatedAt: toSafeDate(candidate.updatedAt).toISOString(),
    artifacts: {
      memo_docx: normalizeProjectArtifact(
        rawArtifacts.memo_docx,
        "memo_docx",
        pendingArtifacts.memo_docx,
      ),
      operating_model_xlsx: normalizeProjectArtifact(
        rawArtifacts.operating_model_xlsx,
        "operating_model_xlsx",
        pendingArtifacts.operating_model_xlsx,
      ),
      pm_deck_pptx: normalizeProjectArtifact(
        rawArtifacts.pm_deck_pptx,
        "pm_deck_pptx",
        pendingArtifacts.pm_deck_pptx,
      ),
    },
    generatedContent: null,
    error: toNonEmptyString(candidate.error),
  };

  let project = baseProject;
  if (candidate.generatedContent) {
    try {
      project = completeEquityProject({
        project: baseProject,
        content: normalizeGeneratedContent(candidate.generatedContent),
      });
    } catch {
      project = failEquityProject({
        project: baseProject,
        error:
          toNonEmptyString(candidate.error) ??
          "Stored project content could not be restored.",
      });
    }
  }

  if (candidate.status === "failed") {
    return failEquityProject({
      project,
      error: toNonEmptyString(candidate.error) ?? "Project generation failed.",
    });
  }

  if (project.generatedContent) return project;
  if (candidate.status === "ready") {
    return failEquityProject({
      project,
      error: "Stored project is missing generated file content.",
    });
  }
  return {
    ...project,
    status: "generating",
  };
};

const normalizePmReview = (
  value: unknown,
  equityProject: EquityProject | null,
): EquityPmReview | null => {
  if (!equityProject || equityProject.status !== "ready") return null;
  if (!value || typeof value !== "object") {
    return createPendingPmReview(equityProject.id);
  }

  const candidate = value as Record<string, unknown>;
  const projectId = toNonEmptyString(candidate.projectId);
  if (projectId && projectId !== equityProject.id) {
    return createPendingPmReview(equityProject.id);
  }
  const decision =
    candidate.decision === "approved_to_risk" ||
    candidate.decision === "revise" ||
    candidate.decision === "rejected"
      ? candidate.decision
      : "pending";

  return {
    projectId: equityProject.id,
    decision,
    note: toNonEmptyString(candidate.note),
    decidedAt: toNonEmptyString(candidate.decidedAt),
    updatedAt:
      toNonEmptyString(candidate.updatedAt) ?? new Date().toISOString(),
  };
};

const normalizeRiskGate = (
  value: unknown,
  equityProject: EquityProject | null,
  pmReview: EquityPmReview | null,
): EquityRiskGate | null => {
  if (!equityProject || equityProject.status !== "ready") return null;
  if (pmReview?.decision !== "approved_to_risk" && !value) return null;
  if (!value || typeof value !== "object") {
    return pmReview?.decision === "approved_to_risk"
      ? createPendingRiskGate(equityProject.id)
      : null;
  }

  const candidate = value as Record<string, unknown>;
  const projectId = toNonEmptyString(candidate.projectId);
  if (projectId && projectId !== equityProject.id) {
    return pmReview?.decision === "approved_to_risk"
      ? createPendingRiskGate(equityProject.id)
      : null;
  }
  const decision =
    candidate.decision === "approved_to_desk" ||
    candidate.decision === "reduce_size" ||
    candidate.decision === "monitor_first" ||
    candidate.decision === "rejected"
      ? candidate.decision
      : "pending";

  return {
    projectId: equityProject.id,
    decision,
    note: toNonEmptyString(candidate.note),
    decidedAt: toNonEmptyString(candidate.decidedAt),
    updatedAt:
      toNonEmptyString(candidate.updatedAt) ?? new Date().toISOString(),
  };
};

const toSafeNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const normalizeTradeHistory = (value: unknown): EquityPaperPosition["history"] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const type =
      candidate.type === "open" ||
      candidate.type === "add" ||
      candidate.type === "trim" ||
      candidate.type === "exit" ||
      candidate.type === "recheck"
        ? candidate.type
        : null;
    if (!type) return [];
    return [
      {
        id: toNonEmptyString(candidate.id) ?? createEventId(),
        type,
        timestamp:
          toNonEmptyString(candidate.timestamp) ?? new Date().toISOString(),
        price: toSafeNumber(candidate.price, 0),
        sizeDelta: toSafeNumber(candidate.sizeDelta, 0),
        note: toNonEmptyString(candidate.note) ?? "Desk action.",
      },
    ];
  });
};

const normalizePaperPosition = (
  value: unknown,
  equityProject: EquityProject | null,
  riskGate: EquityRiskGate | null,
): EquityPaperPosition | null => {
  if (!equityProject || equityProject.status !== "ready") return null;
  if (!value || typeof value !== "object") return null;
  if (riskGate?.decision !== "approved_to_desk") return null;

  const candidate = value as Record<string, unknown>;
  const projectId = toNonEmptyString(candidate.projectId);
  if (projectId && projectId !== equityProject.id) return null;
  const ticker = sanitizeTicker(toNonEmptyString(candidate.ticker) ?? equityProject.ticker);
  if (!ticker) return null;
  const side = candidate.side === "short" ? "short" : "long";
  const status = candidate.status === "closed" ? "closed" : "open";
  const thesisStatus =
    candidate.thesisStatus === "weakened" || candidate.thesisStatus === "broken"
      ? candidate.thesisStatus
      : "active";
  const nextAction =
    candidate.nextAction === "Add" ||
    candidate.nextAction === "Trim" ||
    candidate.nextAction === "Exit" ||
    candidate.nextAction === "Revisit" ||
    candidate.nextAction === "Open"
      ? candidate.nextAction
      : "Hold";

  return {
    id:
      toNonEmptyString(candidate.id) ??
      `paper-position-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: equityProject.id,
    ticker,
    side,
    entryPrice: toSafeNumber(candidate.entryPrice, 100),
    currentPrice: toSafeNumber(candidate.currentPrice, 100),
    size: Math.max(0, toSafeNumber(candidate.size, 0)),
    status,
    openedAt: toNonEmptyString(candidate.openedAt) ?? new Date().toISOString(),
    closedAt: toNonEmptyString(candidate.closedAt),
    rationale: toNonEmptyString(candidate.rationale) ?? equityProject.rationale,
    thesisStatus,
    nextCatalyst:
      toNonEmptyString(candidate.nextCatalyst) ??
      "Next earnings / guidance update.",
    nextAction,
    history: normalizeTradeHistory(candidate.history),
  };
};

const normalizeEvent = (value: unknown): SessionEvent | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const text = toNonEmptyString(candidate.text);
  if (!text) return null;

  const allowedTypes: SessionEvent["type"][] = [
    "session_started",
    "session_ended",
    "tool_called",
    "tool_result",
    "artifact_created",
    "view_changed",
    "note",
  ];

  const type = allowedTypes.includes(candidate.type as SessionEvent["type"])
    ? (candidate.type as SessionEvent["type"])
    : "note";

  return {
    id: toNonEmptyString(candidate.id) ?? createEventId(),
    type,
    text,
    timestamp: toSafeDate(candidate.timestamp),
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : undefined,
  };
};

const normalizeTranscriptEntry = (
  value: unknown,
): SessionTranscriptEntry | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const text = toNonEmptyString(candidate.text);
  if (!text) return null;

  return {
    id: toNonEmptyString(candidate.id) ?? createEventId(),
    role:
      candidate.role === "assistant" || candidate.role === "system"
        ? candidate.role
        : "user",
    text,
    timestamp: toSafeDate(candidate.timestamp),
  };
};

const normalizeSnapshot = (
  value: unknown,
  artifacts: SessionArtifact[],
): SessionSnapshot => {
  const candidate =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const equityProject = normalizeEquityProject(candidate.equityProject);
  const activeArtifactId =
    toNonEmptyString(candidate.activeArtifactId) ??
    (typeof candidate.activeTab === "string" &&
    candidate.activeTab.startsWith("artifact:")
      ? candidate.activeTab.slice("artifact:".length)
      : null);
  const resolvedActiveArtifactId = artifacts.some(
    (artifact) => artifact.id === activeArtifactId,
  )
    ? activeArtifactId
    : null;

  const transcript = Array.isArray(candidate.transcript)
    ? candidate.transcript.flatMap((entry) => {
        const normalized = normalizeTranscriptEntry(entry);
        return normalized ? [normalized] : [];
      })
    : [];
  const selectedTicker = toNonEmptyString(candidate.selectedTicker)?.toUpperCase() ?? null;
  const thesisDraft = normalizeThesisDraft(candidate.thesisDraft, selectedTicker);
  const pmReview = normalizePmReview(candidate.pmReview, equityProject);
  const riskGate = normalizeRiskGate(
    candidate.riskGate,
    equityProject,
    pmReview,
  );
  const paperPosition = normalizePaperPosition(
    candidate.paperPosition,
    equityProject,
    riskGate,
  );

  return {
    activeTab: coerceWorkspaceTab(
      candidate.activeTab,
      artifacts,
      equityProject,
      pmReview,
      riskGate,
      paperPosition,
    ),
    activeArtifactId: resolvedActiveArtifactId,
    selectedTicker: thesisDraft?.ticker ?? selectedTicker,
    thesisDraft,
    equityProject,
    pmReview,
    riskGate,
    paperPosition,
    transcript,
  };
};

const normalizeSession = (value: unknown): ShellSession | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = toNonEmptyString(candidate.id);
  if (!id) return null;

  const artifacts = Array.isArray(candidate.artifacts)
    ? candidate.artifacts.flatMap((artifact) => {
        const normalized = normalizeArtifact(artifact);
        return normalized ? [normalized] : [];
      })
    : [];

  const events = Array.isArray(candidate.events)
    ? candidate.events.flatMap((event) => {
        const normalized = normalizeEvent(event);
        return normalized ? [normalized] : [];
      })
    : [];

  const snapshot = normalizeSnapshot(candidate.snapshot, artifacts);

  return {
    id,
    title: toNonEmptyString(candidate.title) ?? "Untitled Session",
    summary: toNonEmptyString(candidate.summary) ?? "Session ready.",
    status:
      candidate.status === "ended" || candidate.status === "idle"
        ? candidate.status
        : "active",
    createdAt: toSafeDate(candidate.createdAt),
    updatedAt: toSafeDate(candidate.updatedAt),
    endedAt: candidate.endedAt ? toSafeDate(candidate.endedAt) : null,
    events,
    artifacts,
    snapshot,
  };
};

export const buildSessionSummary = (session: ShellSession) =>
  generateDeterministicSummary(session).text;

export const loadShellSessions = (): ShellSession[] => {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .flatMap((item) => {
        const normalized = normalizeSession(item);
        return normalized ? [normalized] : [];
      })
      .slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
};

export const saveShellSessions = (sessions: ShellSession[]) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(sessions.slice(0, MAX_SESSIONS)),
  );
};

const loadPendingSessionSeeds = (): PendingSessionSeed[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_SESSION_SEED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      const id = toNonEmptyString(candidate.id);
      if (!id) return [];
      return [
        {
          id,
          title: toNonEmptyString(candidate.title) ?? undefined,
          createdAt:
            toNonEmptyString(candidate.createdAt) ?? new Date().toISOString(),
        },
      ];
    });
  } catch {
    return [];
  }
};

const savePendingSessionSeeds = (seeds: PendingSessionSeed[]) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    PENDING_SESSION_SEED_STORAGE_KEY,
    JSON.stringify(seeds),
  );
};

export const queuePendingShellSessionSeed = (
  seed: Omit<PendingSessionSeed, "createdAt"> & { createdAt?: string },
) => {
  const seeds = loadPendingSessionSeeds();
  const nextSeed: PendingSessionSeed = {
    ...seed,
    createdAt: seed.createdAt ?? new Date().toISOString(),
  };
  savePendingSessionSeeds([
    nextSeed,
    ...seeds.filter((candidate) => candidate.id !== seed.id),
  ]);
};

export const consumePendingShellSessionSeed = (
  sessionId: string,
): PendingSessionSeed | null => {
  const seeds = loadPendingSessionSeeds();
  const seed = seeds.find((candidate) => candidate.id === sessionId) ?? null;
  if (seed) {
    savePendingSessionSeeds(
      seeds.filter((candidate) => candidate.id !== sessionId),
    );
  }
  return seed;
};

export const loadSessionTranscript = (sessionId: string) => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(getTranscriptStorageKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      const normalized = normalizeTranscriptEntry(entry);
      return normalized ? [normalized] : [];
    });
  } catch {
    return [];
  }
};

export const saveSessionTranscript = (
  sessionId: string,
  entries: SessionTranscriptEntry[],
) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    getTranscriptStorageKey(sessionId),
    JSON.stringify(entries),
  );
};

export const deleteSessionTranscript = (sessionId: string) => {
  if (!isBrowser()) return;
  window.localStorage.removeItem(getTranscriptStorageKey(sessionId));
};

export const clearStoredSessionTranscripts = () => {
  if (!isBrowser()) return;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(TRANSCRIPT_STORAGE_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }
};

export const runLegacyTranscriptMaintenance = () => {
  // Kept as a no-op compatibility hook for the reusable shell.
};

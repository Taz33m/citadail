'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import VoiceAgent from "@/components/voice-agent";
import CoverageDesk from "@/components/coverage-desk";
import EquityProjectArtifactTab from "@/components/equity-project-artifact-tab";
import LiveBookTab from "@/components/live-book-tab";
import MorningBrief from "@/components/morning-brief";
import PmReviewTab from "@/components/pm-review-tab";
import RiskGateTab from "@/components/risk-gate-tab";
import ThesisTab from "@/components/thesis-tab";
import TradeDeskTab from "@/components/trade-desk-tab";
import { SessionTranscriptPanel } from "@/components/session-transcript-panel";
import { MarkdownText } from "@/components/ui/markdown-text";
import type {
  VoiceAssistantTurnEvent,
  VoiceTranscriptPreviewEvent,
  VoiceToolEvent,
  VoiceUserTurnEvent,
} from "@/hooks/useVoiceAgent";
import type { CreateArtifactInput } from "@/lib/adk-tools";
import { createSessionEvent, createToolResultEvent } from "@/lib/session-events";
import {
  createPendingEquityProject,
  failEquityProject,
  isEquityProjectArtifactType,
  isSubmittedThesisDraft,
} from "@/lib/equity-project";
import {
  createPendingPmReview,
  updatePmReviewDecision,
} from "@/lib/equity-pm-review";
import {
  createPendingRiskGate,
  updateRiskGateDecision,
} from "@/lib/equity-risk-gate";
import {
  buildTradeDeskTicket,
  openPaperPosition,
  updatePaperPosition,
} from "@/lib/equity-trade-desk";
import { coverageDeskItems } from "@/lib/coverage-desk-data";
import {
  createArtifactId,
  loadSessionTranscript,
  saveSessionTranscript,
  consumePendingShellSessionSeed,
} from "@/lib/session-storage";
import {
  createShellSessionFromSeed,
  ensureSessionSummaries,
  getLocalSessionRepository,
} from "@/lib/session-repository";
import { buildWorkspaceTabs } from "@/lib/workspace-tabs";
import { isGeneratedShellSessionId } from "@/lib/session-routing";
import { cn } from "@/lib/utils";
import type {
  SessionArtifact,
  SessionEvent,
  SessionTranscriptEntry,
  ShellSession,
  ThesisDraft,
  EquityPmReviewDecision,
  EquityRiskGateDecision,
  ThesisRecommendation,
  WorkspaceTabId,
} from "@/types/session";

interface SessionWorkspaceProps {
  sessionId: string;
  seedTitle?: string | null;
}

const SHELL_INSTRUCTIONS = `You are operating inside the Citadail equity desk.
Keep responses concise and product-neutral. Use create_text_artifact whenever the user asks for durable output, plans, notes, analysis, or structured work that should appear in a tab.`;

const EQUITY_PROJECT_CLIENT_TIMEOUT_MS = 120_000;
const EQUITY_PROJECT_STALE_RETRY_MS = 90_000;

const formatTimestamp = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

const appendTranscriptEntry = (
  entries: SessionTranscriptEntry[],
  entry: SessionTranscriptEntry,
) => {
  const normalizedText = entry.text.trim();
  if (!normalizedText) return entries;

  const latestEntry = entries.at(-1);
  if (
    latestEntry &&
    latestEntry.role === entry.role &&
    latestEntry.text.trim() === normalizedText &&
    Math.abs(entry.timestamp.getTime() - latestEntry.timestamp.getTime()) <= 5000
  ) {
    return entries;
  }

  return [
    ...entries.filter((candidate) => candidate.id !== entry.id),
    {
      ...entry,
      text: normalizedText,
    },
  ].sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
};

export default function SessionWorkspace({
  sessionId,
  seedTitle,
}: SessionWorkspaceProps) {
  const router = useRouter();
  const repository = useMemo(() => getLocalSessionRepository(), []);
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [activeSession, setActiveSession] = useState<ShellSession | null>(null);
  const [transcriptPreview, setTranscriptPreview] =
    useState<SessionTranscriptEntry | null>(null);
  const [agentStatus, setAgentStatus] = useState("idle");
  const [isChatSidebarCollapsed, setIsChatSidebarCollapsed] = useState(true);
  const activeSessionRef = useRef<ShellSession | null>(null);
  const retriedProjectIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    const existingSessions = ensureSessionSummaries(repository.list());
    const existing = existingSessions.find((session) => session.id === sessionId);
    const pendingSeed = consumePendingShellSessionSeed(sessionId);

    let nextActiveSession = existing ?? null;
    let nextSessions = existingSessions;

    if (!nextActiveSession) {
      const shouldCreate =
        Boolean(pendingSeed) || isGeneratedShellSessionId(sessionId);
      if (shouldCreate) {
        nextActiveSession = createShellSessionFromSeed({
          createdAt: pendingSeed?.createdAt
            ? new Date(pendingSeed.createdAt)
            : undefined,
          sessionId,
          sessions: existingSessions,
          title: seedTitle ?? pendingSeed?.title,
        });
        nextSessions = [nextActiveSession, ...existingSessions];
        repository.saveAll(nextSessions);
      }
    }

    if (!nextActiveSession) {
      const created = repository.create(seedTitle ?? undefined);
      router.replace(`/sessions/${created.id}`);
      return;
    }

    const storedTranscript = loadSessionTranscript(nextActiveSession.id);
    if (storedTranscript.length > 0) {
      nextActiveSession = {
        ...nextActiveSession,
        snapshot: {
          ...nextActiveSession.snapshot,
          transcript: storedTranscript,
        },
      };
      nextSessions = nextSessions.map((session) =>
        session.id === nextActiveSession?.id ? nextActiveSession : session,
      );
      repository.saveAll(nextSessions);
    }

    setSessions(nextSessions);
    setActiveSession(nextActiveSession);
  }, [repository, router, seedTitle, sessionId]);

  const persistSession = useCallback(
    (nextSession: ShellSession) => {
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
      const nextSessions = repository.upsert(nextSession);
      setSessions(ensureSessionSummaries(nextSessions));
    },
    [repository],
  );

  const appendEvent = useCallback(
    (event: SessionEvent) => {
      const session = activeSessionRef.current;
      if (!session) return;

      persistSession({
        ...session,
        events: [...session.events, event],
        updatedAt: new Date(),
      });
    },
    [persistSession],
  );

  const appendTranscript = useCallback(
    (entry: SessionTranscriptEntry) => {
      const session = activeSessionRef.current;
      if (!session) return;

      const transcript = appendTranscriptEntry(
        session.snapshot.transcript,
        entry,
      );
      const nextSession: ShellSession = {
        ...session,
        updatedAt: new Date(),
        snapshot: {
          ...session.snapshot,
          transcript,
        },
      };

      saveSessionTranscript(session.id, transcript);
      persistSession(nextSession);
    },
    [persistSession],
  );

  const handleUserTurn = useCallback(
    (event: VoiceUserTurnEvent) => {
      appendTranscript({
        id: event.id,
        role: "user",
        text: event.text,
        timestamp: event.timestamp,
      });
    },
    [appendTranscript],
  );

  const handleAssistantTurn = useCallback(
    (event: VoiceAssistantTurnEvent) => {
      appendTranscript({
        id: event.id,
        role: "assistant",
        text: event.text,
        timestamp: event.timestamp,
      });
    },
    [appendTranscript],
  );

  const handleTranscriptPreview = useCallback(
    (event: VoiceTranscriptPreviewEvent | null) => {
      setTranscriptPreview(
        event
          ? {
              id: `preview-${event.role}`,
              role: event.role,
              text: event.text,
              timestamp: event.timestamp,
            }
          : null,
      );
    },
    [],
  );

  const handleCreateArtifact = useCallback(
    (input: CreateArtifactInput): SessionArtifact => {
      const session = activeSessionRef.current;
      if (!session) {
        throw new Error("No active session is available.");
      }

      const artifact: SessionArtifact = {
        id: createArtifactId(),
        type: "text",
        title: input.title,
        summary: input.summary,
        content: input.content,
        metadata: input.metadata,
        createdAt: new Date(),
      };

      const activeTab: WorkspaceTabId = `artifact:${artifact.id}`;
      const event = createSessionEvent(
        "artifact_created",
        `Artifact created: ${artifact.title}`,
        {
          artifactId: artifact.id,
          artifactType: artifact.type,
        },
      );

      persistSession({
        ...session,
        updatedAt: new Date(),
        artifacts: [artifact, ...session.artifacts],
        events: [...session.events, event],
        snapshot: {
          ...session.snapshot,
          activeTab,
          activeArtifactId: artifact.id,
        },
      });

      return artifact;
    },
    [persistSession],
  );

  const handleToolEvent = useCallback(
    (event: VoiceToolEvent) => {
      appendEvent(createToolResultEvent(event));
    },
    [appendEvent],
  );

  const selectTab = useCallback(
    (tabId: WorkspaceTabId, artifactId?: string) => {
      const session = activeSessionRef.current;
      if (!session) return;

      persistSession({
        ...session,
        updatedAt: new Date(),
        events: [
          ...session.events,
          createSessionEvent("view_changed", `Switched to ${tabId}.`, {
            tabId,
            artifactId,
          }),
        ],
        snapshot: {
          ...session.snapshot,
          activeTab: tabId,
          activeArtifactId: artifactId ?? null,
        },
      });
    },
    [persistSession],
  );

  const handleOpenLiveBookSession = useCallback(
    (targetSessionId: string) => {
      const session = activeSessionRef.current;
      if (targetSessionId === session?.id) {
        let targetTab: WorkspaceTabId = "coverage-desk";
        if (
          session.snapshot.paperPosition ||
          session.snapshot.riskGate?.decision === "approved_to_desk"
        ) {
          targetTab = "trade-desk";
        } else if (
          session.snapshot.riskGate ||
          session.snapshot.pmReview?.decision === "approved_to_risk"
        ) {
          targetTab = "risk-gate";
        } else if (session.snapshot.equityProject?.status === "ready") {
          targetTab = "pm-review";
        } else if (
          session.snapshot.thesisDraft ||
          session.snapshot.selectedTicker
        ) {
          targetTab = "thesis";
        }

        selectTab(targetTab);
        return;
      }

      router.push(`/sessions/${targetSessionId}`);
    },
    [router, selectTab],
  );

  const handleCoverageTickerSet = useCallback(
    (ticker: string) => {
      const session = activeSessionRef.current;
      const normalizedTicker = ticker.trim().toUpperCase();
      if (!session || !normalizedTicker) return;

      const existingDraft =
        session.snapshot.thesisDraft?.ticker === normalizedTicker
          ? session.snapshot.thesisDraft
          : null;
      const thesisDraft: ThesisDraft =
        existingDraft ?? {
          ticker: normalizedTicker,
          recommendation: null,
          rationale: "",
          submittedAt: null,
        };
      const matchingProject =
        session.snapshot.equityProject?.ticker === normalizedTicker
          ? session.snapshot.equityProject
          : null;

      persistSession({
        ...session,
        updatedAt: new Date(),
        events: [
          ...session.events,
          createSessionEvent(
            "view_changed",
            `Opened thesis for ${normalizedTicker}.`,
            {
              tabId: "thesis",
              ticker: normalizedTicker,
            },
          ),
        ],
        snapshot: {
          ...session.snapshot,
          activeTab: "thesis",
          activeArtifactId: null,
          selectedTicker: normalizedTicker,
          thesisDraft,
          equityProject: matchingProject,
          pmReview: matchingProject ? session.snapshot.pmReview : null,
          riskGate: matchingProject ? session.snapshot.riskGate : null,
          paperPosition: matchingProject ? session.snapshot.paperPosition : null,
        },
      });
    },
    [persistSession],
  );

  const handleThesisDraftChange = useCallback(
    (thesisDraft: ThesisDraft) => {
      const session = activeSessionRef.current;
      if (!session) return;

      persistSession({
        ...session,
        updatedAt: new Date(),
        snapshot: {
          ...session.snapshot,
          selectedTicker: thesisDraft.ticker,
          thesisDraft,
          equityProject:
            session.snapshot.equityProject && !thesisDraft.submittedAt
              ? null
              : session.snapshot.equityProject,
          pmReview:
            session.snapshot.equityProject && !thesisDraft.submittedAt
              ? null
              : session.snapshot.pmReview,
          riskGate:
            session.snapshot.equityProject && !thesisDraft.submittedAt
              ? null
              : session.snapshot.riskGate,
          paperPosition:
            session.snapshot.equityProject && !thesisDraft.submittedAt
              ? null
              : session.snapshot.paperPosition,
        },
      });
    },
    [persistSession],
  );

  const handleThesisSubmit = useCallback(
    async (
      thesisDraft: ThesisDraft & { recommendation: ThesisRecommendation },
    ) => {
      const session = activeSessionRef.current;
      if (!session) return;

      const pendingProject = createPendingEquityProject(thesisDraft);
      const coverageItem = coverageDeskItems.find(
        (item) => item.ticker === pendingProject.ticker,
      );

      persistSession({
        ...session,
        updatedAt: new Date(),
        events: [
          ...session.events,
          createSessionEvent(
            "note",
            `Generating analyst package for ${pendingProject.ticker}.`,
            {
              ticker: pendingProject.ticker,
              projectId: pendingProject.id,
            },
          ),
        ],
        snapshot: {
          ...session.snapshot,
          activeTab: "thesis",
          activeArtifactId: null,
          selectedTicker: pendingProject.ticker,
          thesisDraft,
          equityProject: pendingProject,
          pmReview: null,
          riskGate: null,
          paperPosition: null,
        },
      });

      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        EQUITY_PROJECT_CLIENT_TIMEOUT_MS,
      );

      try {
        const response = await fetch("/api/equity/project/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            ticker: pendingProject.ticker,
            recommendation: pendingProject.recommendation,
            rationale: pendingProject.rationale,
            companyContext: coverageItem
              ? {
                  companyName: coverageItem.companyName,
                  sector: coverageItem.sector,
                  summary: coverageItem.summary,
                  lastCheck: coverageItem.lastCheck,
                  status: coverageItem.status,
                }
              : null,
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          project?: ShellSession["snapshot"]["equityProject"];
          error?: string;
        } | null;

        const latestSession = activeSessionRef.current;
        if (
          !latestSession ||
          latestSession.snapshot.equityProject?.id !== pendingProject.id
        ) {
          return;
        }

        if (!response.ok || !payload?.success || !payload.project) {
          throw new Error(payload?.error ?? "Package generation failed.");
        }

        persistSession({
          ...latestSession,
          updatedAt: new Date(),
          events: [
            ...latestSession.events,
            createSessionEvent(
              "artifact_created",
              `Analyst package ready for ${pendingProject.ticker}.`,
              {
                ticker: pendingProject.ticker,
                projectId: payload.project.id,
              },
            ),
          ],
          snapshot: {
            ...latestSession.snapshot,
            activeTab: "project:memo_docx",
            activeArtifactId: null,
            equityProject: payload.project,
            pmReview: createPendingPmReview(payload.project.id),
            riskGate: null,
            paperPosition: null,
          },
        });
      } catch (error) {
        const latestSession = activeSessionRef.current;
        if (
          !latestSession ||
          latestSession.snapshot.equityProject?.id !== pendingProject.id
        ) {
          return;
        }

        persistSession({
          ...latestSession,
          updatedAt: new Date(),
          snapshot: {
            ...latestSession.snapshot,
            activeTab: "thesis",
            equityProject: failEquityProject({
              project: pendingProject,
              error:
                error instanceof DOMException && error.name === "AbortError"
                  ? "Package generation timed out. Send again to retry."
                  : error instanceof Error
                  ? error.message
                  : "Package generation failed.",
            }),
            pmReview: null,
            riskGate: null,
            paperPosition: null,
          },
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [persistSession],
  );

  const handlePmReviewDecision = useCallback(
    (decision: EquityPmReviewDecision, note: string) => {
      const session = activeSessionRef.current;
      const project = session?.snapshot.equityProject;
      if (!session || !project || project.status !== "ready") return;

      persistSession({
        ...session,
        updatedAt: new Date(),
        events: [
          ...session.events,
          createSessionEvent(
            "note",
            `PM Review: ${decision.replace(/_/g, " ")} for ${project.ticker}.`,
            {
              ticker: project.ticker,
              projectId: project.id,
              decision,
            },
          ),
        ],
        snapshot: {
          ...session.snapshot,
          activeTab:
            decision === "approved_to_risk" ? "risk-gate" : "pm-review",
          activeArtifactId: null,
          pmReview: updatePmReviewDecision({
            projectId: project.id,
            decision,
            note,
          }),
          riskGate:
            decision === "approved_to_risk"
              ? createPendingRiskGate(project.id)
              : null,
          paperPosition: null,
        },
      });
    },
    [persistSession],
  );

  const handleRiskGateDecision = useCallback(
    (decision: EquityRiskGateDecision, note: string) => {
      const session = activeSessionRef.current;
      const project = session?.snapshot.equityProject;
      if (!session || !project || project.status !== "ready") return;

      persistSession({
        ...session,
        updatedAt: new Date(),
        events: [
          ...session.events,
          createSessionEvent(
            "note",
            `Risk Gate: ${decision.replace(/_/g, " ")} for ${project.ticker}.`,
            {
              ticker: project.ticker,
              projectId: project.id,
              decision,
            },
          ),
        ],
        snapshot: {
          ...session.snapshot,
          activeTab:
            decision === "approved_to_desk" ? "trade-desk" : "risk-gate",
          activeArtifactId: null,
          riskGate: updateRiskGateDecision({
            projectId: project.id,
            decision,
            note,
          }),
          paperPosition:
            decision === "approved_to_desk"
              ? session.snapshot.paperPosition
              : null,
        },
      });
    },
    [persistSession],
  );

  const handleTradeDeskPositionAction = useCallback(
    (action: "open" | "add" | "trim" | "exit" | "recheck") => {
      const session = activeSessionRef.current;
      const project = session?.snapshot.equityProject;
      if (!session || !project || project.status !== "ready") return;

      const existingPosition = session.snapshot.paperPosition;
      let nextPosition = existingPosition;
      if (action === "open") {
        const ticket = buildTradeDeskTicket(
          project,
          session.snapshot.pmReview,
          session.snapshot.riskGate,
        );
        if (!ticket) return;
        nextPosition = openPaperPosition(ticket, project.id);
      } else if (existingPosition) {
        nextPosition = updatePaperPosition(existingPosition, action);
      }
      if (!nextPosition) return;

      persistSession({
        ...session,
        updatedAt: new Date(),
        events: [
          ...session.events,
          createSessionEvent(
            "note",
            `Desk: ${action} paper position for ${project.ticker}.`,
            {
              ticker: project.ticker,
              projectId: project.id,
              action,
            },
          ),
        ],
        snapshot: {
          ...session.snapshot,
          activeTab: "trade-desk",
          activeArtifactId: null,
          paperPosition: nextPosition,
        },
      });
    },
    [persistSession],
  );

  useEffect(() => {
    const session = activeSessionRef.current;
    const project = session?.snapshot.equityProject;
    const draft = session?.snapshot.thesisDraft ?? null;
    if (!session || project?.status !== "generating") return;
    if (!isSubmittedThesisDraft(draft)) return;
    if (retriedProjectIdsRef.current.has(project.id)) return;

    const updatedAt = new Date(project.updatedAt).getTime();
    const projectAge = Number.isFinite(updatedAt) ? Date.now() - updatedAt : 0;
    if (projectAge < EQUITY_PROJECT_STALE_RETRY_MS) return;

    retriedProjectIdsRef.current.add(project.id);
    void handleThesisSubmit(draft);
  }, [activeSession, handleThesisSubmit]);

  const tabs = useMemo(
    () => buildWorkspaceTabs({ activeSession }),
    [activeSession],
  );
  const persistedActiveTabId = activeSession?.snapshot.activeTab ?? "morning-brief";
  const activeTabId = tabs.some((tab) => tab.id === persistedActiveTabId)
    ? persistedActiveTabId
    : tabs[0]?.id ?? "morning-brief";
  const activeArtifact =
    activeSession?.artifacts.find(
      (artifact) =>
        artifact.id === activeSession.snapshot.activeArtifactId ||
        activeTabId === `artifact:${artifact.id}`,
    ) ?? activeSession?.artifacts[0] ?? null;
  const transcript = activeSession?.snapshot.transcript ?? [];
  const toolEvents =
    activeSession?.events.filter((event) => event.type === "tool_result") ?? [];
  const activeProjectArtifactType = activeTabId.startsWith("project:")
    ? activeTabId.slice("project:".length)
    : null;
  const activeEquityProjectArtifactType = isEquityProjectArtifactType(
    activeProjectArtifactType,
  )
    ? activeProjectArtifactType
    : null;

  const conversationContext = useCallback(() => {
    const recentTranscript = activeSessionRef.current?.snapshot.transcript
      .slice(-8)
      .map((entry) => `${entry.role}: ${entry.text}`)
      .join("\n");
    return recentTranscript || undefined;
  }, []);

  const screenSnapshot = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session) return {};

    const snapshot = session.snapshot;
    return {
      activeTab: activeTabId,
      activeTabLabel:
        tabs.find((tab) => tab.id === activeTabId)?.label ?? activeTabId,
      activeArtifactId: snapshot.activeArtifactId,
      artifacts: session.artifacts.slice(0, 8).map((artifact) => ({
        id: artifact.id,
        summary: artifact.summary,
        title: artifact.title,
        type: artifact.type,
      })),
      equityProject: snapshot.equityProject
        ? {
            createdAt: snapshot.equityProject.createdAt,
            error: snapshot.equityProject.error,
            hasGeneratedContent: Boolean(snapshot.equityProject.generatedContent),
            id: snapshot.equityProject.id,
            recommendation: snapshot.equityProject.recommendation,
            status: snapshot.equityProject.status,
            ticker: snapshot.equityProject.ticker,
            updatedAt: snapshot.equityProject.updatedAt,
          }
        : null,
      paperPosition: snapshot.paperPosition
        ? {
            currentPrice: snapshot.paperPosition.currentPrice,
            entryPrice: snapshot.paperPosition.entryPrice,
            nextAction: snapshot.paperPosition.nextAction,
            openedAt: snapshot.paperPosition.openedAt,
            side: snapshot.paperPosition.side,
            size: snapshot.paperPosition.size,
            status: snapshot.paperPosition.status,
            thesisStatus: snapshot.paperPosition.thesisStatus,
            ticker: snapshot.paperPosition.ticker,
          }
        : null,
      visibleWorkflow:
        "Morning News -> Coverage Desk -> Thesis -> Memo / Financial Model / PM Deck -> PM Review -> Risk Gate -> Trade Desk -> Live Book",
      pmReview: snapshot.pmReview,
      recentEvents: session.events.slice(-8).map((event) => ({
        text: event.text,
        timestamp: event.timestamp.toISOString(),
        type: event.type,
      })),
      riskGate: snapshot.riskGate,
      selectedTicker: snapshot.selectedTicker,
      sessionId: session.id,
      sessionTitle: session.title,
      thesisDraft: snapshot.thesisDraft,
    };
  }, [activeTabId, tabs]);

  if (!activeSession) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Preparing workspace...
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-white">
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-11 shrink-0 items-end justify-between border-b border-slate-300 bg-[#edf1f5] px-2 pt-1">
          <div className="flex min-w-0 flex-1 items-end gap-1 overflow-hidden">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id, tab.artifactId)}
                className={cn(
                  "relative min-w-0 flex-[1_1_112px] truncate rounded-t-md border px-2.5 text-left text-xs font-semibold transition-all",
                  activeTabId === tab.id
                    ? "z-10 h-10 border-slate-300 border-b-white bg-white text-[#061b33] shadow-[0_-1px_0_rgba(15,23,42,0.04),0_1px_0_#fff]"
                    : "h-9 translate-y-px border-slate-300/70 bg-[#e4e9ef] text-slate-600 hover:bg-white/75 hover:text-[#061b33]",
                )}
              >
                {tab.iconSrc ? (
                  <Image
                    src={tab.iconSrc}
                    alt=""
                    width={14}
                    height={14}
                    aria-hidden
                    className="mr-2 inline-block h-3.5 w-3.5 align-[-2px] brightness-0"
                  />
                ) : null}
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              aria-label="New tab"
              className="mb-px flex h-8 w-8 items-center justify-center rounded-t-md border border-slate-300/70 bg-[#e4e9ef] text-lg leading-none text-slate-500 transition-colors hover:bg-white/75 hover:text-[#061b33]"
            >
              +
            </button>
          </div>
          <div className="mb-2 flex items-center gap-2 pr-2 text-[11px] text-slate-400">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                agentStatus === "connected" || agentStatus === "listening"
                  ? "bg-emerald-400"
                  : "bg-slate-300",
              )}
            />
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden bg-white">
          <div className="h-full overflow-y-auto">
            {activeTabId === "morning-brief" ? (
              <MorningBrief />
            ) : activeTabId === "live-book" ? (
              <LiveBookTab
                activeSessionId={activeSession.id}
                sessions={sessions}
                onOpenSession={handleOpenLiveBookSession}
              />
            ) : activeTabId === "coverage-desk" ? (
              <CoverageDesk
                selectedTicker={activeSession.snapshot.selectedTicker}
                onSetTicker={handleCoverageTickerSet}
              />
            ) : activeTabId === "thesis" ? (
              <ThesisTab
                draft={activeSession.snapshot.thesisDraft}
                onChange={handleThesisDraftChange}
                onSubmit={handleThesisSubmit}
                project={activeSession.snapshot.equityProject}
              />
            ) : activeEquityProjectArtifactType ? (
              <EquityProjectArtifactTab
                artifactType={activeEquityProjectArtifactType}
                project={activeSession.snapshot.equityProject}
              />
            ) : activeTabId === "pm-review" ? (
              <PmReviewTab
                project={activeSession.snapshot.equityProject}
                review={activeSession.snapshot.pmReview}
                onDecision={handlePmReviewDecision}
              />
            ) : activeTabId === "risk-gate" ? (
              <RiskGateTab
                gate={activeSession.snapshot.riskGate}
                pmReview={activeSession.snapshot.pmReview}
                project={activeSession.snapshot.equityProject}
                onDecision={handleRiskGateDecision}
              />
            ) : activeTabId === "trade-desk" ? (
              <TradeDeskTab
                pmReview={activeSession.snapshot.pmReview}
                position={activeSession.snapshot.paperPosition}
                project={activeSession.snapshot.equityProject}
                riskGate={activeSession.snapshot.riskGate}
                onPositionAction={handleTradeDeskPositionAction}
              />
            ) : activeTabId === "thread" ? (
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 pb-16 pt-10">
              {transcript.length || transcriptPreview ? (
                <SessionTranscriptPanel
                  entries={transcript}
                  preview={transcriptPreview}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center text-center">
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Start with text or voice.
                    </p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                      The thread keeps transcript and tool execution history.
                    </p>
                  </div>
                </div>
              )}

              {toolEvents.length ? (
                <div className="mt-6 rounded-lg border border-slate-200">
                  <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                    Tool Calls
                  </div>
                  <div className="divide-y divide-slate-100">
                    {toolEvents.map((event) => (
                      <div key={event.id} className="px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {String(event.metadata?.toolName ?? "tool")}
                          </p>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {formatTimestamp(event.timestamp)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {event.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              </div>
            ) : activeArtifact ? (
              <article className="mx-auto max-w-3xl px-6 pb-16 pt-10">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Artifact
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                {activeArtifact.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {activeArtifact.summary}
              </p>
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <MarkdownText>{activeArtifact.content}</MarkdownText>
              </div>
              </article>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                No artifact selected.
              </div>
            )}
          </div>
        </main>
      </section>

      <aside
        className={cn(
          "hidden h-screen shrink-0 border-l border-gray-200 bg-white transition-[width] duration-200 lg:flex",
          isChatSidebarCollapsed ? "w-10" : "w-[360px]",
        )}
      >
        <div className="flex min-h-0 w-full flex-col">
          <div
            className={cn(
              "flex h-10 shrink-0 items-center border-b border-gray-200 bg-gray-50",
              isChatSidebarCollapsed ? "justify-center" : "justify-start px-2",
            )}
          >
            <button
              type="button"
              aria-label={
                isChatSidebarCollapsed
                  ? "Expand chat sidebar"
                  : "Collapse chat sidebar"
              }
              aria-expanded={!isChatSidebarCollapsed}
              onClick={() =>
                setIsChatSidebarCollapsed((isCollapsed) => !isCollapsed)
              }
              className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              {isChatSidebarCollapsed ? "<" : ">"}
            </button>
          </div>

          {isChatSidebarCollapsed ? null : (
            <VoiceAgent
              instructions={SHELL_INSTRUCTIONS}
              artifacts={activeSession.artifacts}
              transcript={transcript}
              transcriptPreview={transcriptPreview}
              toolEvents={toolEvents}
              onCreateArtifact={handleCreateArtifact}
              getConversationContext={conversationContext}
              onToolEvent={handleToolEvent}
              onTranscriptPreviewChange={handleTranscriptPreview}
              onUserTurn={handleUserTurn}
              onAssistantTurn={handleAssistantTurn}
              onStatusChange={setAgentStatus}
              getScreenSnapshot={screenSnapshot}
            />
          )}
        </div>
      </aside>
    </div>
  );
}

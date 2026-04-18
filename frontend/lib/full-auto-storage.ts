import { createFullAutoRun } from "@/lib/full-auto-orchestrator";
import type { FullAutoRun } from "@/types/full-auto";

export const FULL_AUTO_STORAGE_KEY = "citadail.full-auto-runs.v1";
const MAX_FULL_AUTO_RUNS = 12;

const isBrowser = () => typeof window !== "undefined";

const normalizeRun = (value: unknown): FullAutoRun | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as FullAutoRun;
  if (!candidate.id || !candidate.simulationTime || !Array.isArray(candidate.universe)) {
    return null;
  }
  const fallback = createFullAutoRun();
  return {
    ...fallback,
    ...candidate,
    riskLimits: {
      ...fallback.riskLimits,
      ...(candidate.riskLimits ?? {}),
    },
    portfolio: {
      ...fallback.portfolio,
      ...(candidate.portfolio ?? {}),
      equityCurve: Array.isArray(candidate.portfolio?.equityCurve)
        ? candidate.portfolio.equityCurve
        : fallback.portfolio.equityCurve,
    },
    thesisRegistry: {
      ...fallback.thesisRegistry,
      ...(candidate.thesisRegistry ?? {}),
    },
    currentBrief: candidate.currentBrief ?? null,
    candidateQueue: Array.isArray(candidate.candidateQueue)
      ? candidate.candidateQueue
      : [],
    agentEvents: Array.isArray(candidate.agentEvents) ? candidate.agentEvents : [],
    thesisRecords: Array.isArray(candidate.thesisRecords)
      ? candidate.thesisRecords.map((record) => ({
          ...record,
          validation: record.validation ?? null,
        }))
      : [],
    paperPositions: Array.isArray(candidate.paperPositions)
      ? candidate.paperPositions
      : [],
    journal: Array.isArray(candidate.journal) ? candidate.journal : [],
    openedSessionIds:
      candidate.openedSessionIds && typeof candidate.openedSessionIds === "object"
        ? candidate.openedSessionIds
        : {},
  };
};

export const loadFullAutoRuns = (): FullAutoRun[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(FULL_AUTO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const run = normalizeRun(item);
      return run ? [run] : [];
    });
  } catch {
    return [];
  }
};

export const saveFullAutoRuns = (runs: FullAutoRun[]) => {
  if (!isBrowser()) return;
  window.localStorage.setItem(
    FULL_AUTO_STORAGE_KEY,
    JSON.stringify(runs.slice(0, MAX_FULL_AUTO_RUNS)),
  );
};

export const upsertFullAutoRun = (run: FullAutoRun): FullAutoRun[] => {
  const existing = loadFullAutoRuns();
  const next = existing.some((item) => item.id === run.id)
    ? existing.map((item) => (item.id === run.id ? run : item))
    : [run, ...existing];
  saveFullAutoRuns(next);
  return next;
};

export const getOrCreateLatestFullAutoRun = () => {
  const existing = loadFullAutoRuns()[0];
  if (existing) return existing;
  const run = createFullAutoRun();
  saveFullAutoRuns([run]);
  return run;
};

export const resetFullAutoRuns = () => {
  const run = createFullAutoRun();
  saveFullAutoRuns([run]);
  return run;
};

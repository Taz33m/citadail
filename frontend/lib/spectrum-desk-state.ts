import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFullAutoRun } from "@/lib/full-auto-orchestrator";
import type { FullAutoRun } from "@/types/full-auto";
import type {
  SpectrumDeskAuditEntry,
  SpectrumDeskState,
} from "@/types/citadail-spectrum";

const getStatePath = () =>
  process.env.CITADAIL_SPECTRUM_STATE_PATH ??
  path.join(process.cwd(), ".citadail", "runtime", "spectrum-desk.json");
const MAX_PROCESSED_MESSAGES = 500;
const MAX_AUDIT_ENTRIES = 200;

const createInitialState = (): SpectrumDeskState => ({
  activeRun: createFullAutoRun(),
  auditTrail: [],
  knownSpaces: [],
  processedMessageIds: [],
  proactiveCursors: {},
  proactiveSpaces: [],
  updatedAt: new Date().toISOString(),
});

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" ? [item] : []))
    : [];

const normalizeAuditTrail = (value: unknown): SpectrumDeskAuditEntry[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as SpectrumDeskAuditEntry;
        if (
          !candidate.id ||
          !candidate.timestamp ||
          !candidate.spaceId ||
          !candidate.senderId ||
          !candidate.command ||
          !candidate.result
        ) {
          return [];
        }
        return [candidate];
      })
    : [];

const normalizeProactiveCursors = (
  value: unknown,
): SpectrumDeskState["proactiveCursors"] => {
  if (!value || typeof value !== "object") return {};
  const entries = Object.entries(value as Record<string, unknown>);
  return Object.fromEntries(
    entries.flatMap(([spaceId, item]) => {
      if (!item || typeof item !== "object") return [];
      const cursor = item as Partial<SpectrumDeskState["proactiveCursors"][string]>;
      return [
        [
          spaceId,
          {
            lastPulseAt:
              typeof cursor.lastPulseAt === "string" ? cursor.lastPulseAt : null,
            lastSimulationTime:
              typeof cursor.lastSimulationTime === "string"
                ? cursor.lastSimulationTime
                : null,
            nextAgentIndex:
              typeof cursor.nextAgentIndex === "number" &&
              Number.isFinite(cursor.nextAgentIndex)
                ? cursor.nextAgentIndex
                : 0,
          },
        ],
      ];
    }),
  );
};

const normalizeState = (value: unknown): SpectrumDeskState => {
  const fallback = createInitialState();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<SpectrumDeskState>;
  const activeRun =
    candidate.activeRun &&
    typeof candidate.activeRun === "object" &&
    candidate.activeRun.id &&
    candidate.activeRun.simulationTime
      ? ({ ...fallback.activeRun, ...candidate.activeRun } as FullAutoRun)
      : fallback.activeRun;

  return {
    activeRun,
    auditTrail: normalizeAuditTrail(candidate.auditTrail).slice(
      0,
      MAX_AUDIT_ENTRIES,
    ),
    knownSpaces: normalizeStringArray(candidate.knownSpaces),
    processedMessageIds: normalizeStringArray(
      candidate.processedMessageIds,
    ).slice(0, MAX_PROCESSED_MESSAGES),
    proactiveCursors: normalizeProactiveCursors(candidate.proactiveCursors),
    proactiveSpaces: normalizeStringArray(candidate.proactiveSpaces),
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : fallback.updatedAt,
  };
};

export const loadSpectrumDeskState = async (): Promise<SpectrumDeskState> => {
  try {
    const raw = await readFile(getStatePath(), "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    const initial = createInitialState();
    await saveSpectrumDeskState(initial);
    return initial;
  }
};

export const saveSpectrumDeskState = async (
  state: SpectrumDeskState,
): Promise<SpectrumDeskState> => {
  const next = {
    ...state,
    auditTrail: state.auditTrail.slice(0, MAX_AUDIT_ENTRIES),
    knownSpaces: [...new Set(state.knownSpaces)],
    processedMessageIds: state.processedMessageIds.slice(
      0,
      MAX_PROCESSED_MESSAGES,
    ),
    proactiveCursors: state.proactiveCursors ?? {},
    proactiveSpaces: [...new Set(state.proactiveSpaces ?? [])],
    updatedAt: new Date().toISOString(),
  };
  const statePath = getStatePath();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(next, null, 2), "utf8");
  return next;
};

export const getSpectrumFullAutoRun = async () =>
  (await loadSpectrumDeskState()).activeRun;

export const persistSpectrumFullAutoRun = async (run: FullAutoRun) => {
  const state = await loadSpectrumDeskState();
  await saveSpectrumDeskState({
    ...state,
    activeRun: run,
  });
  return run;
};

export const resetSpectrumDeskState = async (dateWindow?: {
  startDate?: string | null;
  endDate?: string | null;
}) => {
  const next = {
    ...createInitialState(),
    activeRun: createFullAutoRun(dateWindow),
  };
  await saveSpectrumDeskState(next);
  return next;
};

export const hasProcessedSpectrumMessage = async (messageId: string) => {
  const state = await loadSpectrumDeskState();
  return state.processedMessageIds.includes(messageId);
};

export const recordSpectrumMessageProcessed = async ({
  audit,
  messageId,
  spaceId,
}: {
  messageId: string;
  spaceId: string;
  audit?: SpectrumDeskAuditEntry;
}) => {
  const state = await loadSpectrumDeskState();
  await saveSpectrumDeskState({
    ...state,
    auditTrail: audit ? [audit, ...state.auditTrail] : state.auditTrail,
    knownSpaces: [spaceId, ...state.knownSpaces],
    processedMessageIds: [messageId, ...state.processedMessageIds],
  });
};

export const setSpectrumProactiveSpace = async ({
  enabled,
  spaceId,
}: {
  spaceId: string;
  enabled: boolean;
}) => {
  const state = await loadSpectrumDeskState();
  const proactiveSpaces = enabled
    ? [spaceId, ...state.proactiveSpaces]
    : state.proactiveSpaces.filter((item) => item !== spaceId);
  await saveSpectrumDeskState({
    ...state,
    knownSpaces: [spaceId, ...state.knownSpaces],
    proactiveCursors: {
      ...state.proactiveCursors,
      [spaceId]: state.proactiveCursors[spaceId] ?? {
        lastPulseAt: null,
        lastSimulationTime: null,
        nextAgentIndex: 0,
      },
    },
    proactiveSpaces,
  });
};

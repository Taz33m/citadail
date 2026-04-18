import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import Dedalus from "dedalus-labs";

import type {
  DedalusMachineSummary,
  DedalusOpenClawStatus,
  DedalusRuntimeAction,
  DedalusRuntimePhase,
  DedalusRuntimeProof,
  DedalusRuntimeStatus,
} from "@/types/dedalus-runtime";
import type { FullAutoRun } from "@/types/full-auto";

const DEFAULT_DCS_BASE_URL = "https://dcs.dedaluslabs.ai";
const DEFAULT_API_BASE_URL = "https://api.dedaluslabs.ai";
const STATE_DIR = "/home/machine/citadail/state";
const RUN_STATE_PATH = `${STATE_DIR}/full-auto-run.json`;
const RUNTIME_STATUS_PATH = `${STATE_DIR}/runtime-status.json`;
const MAX_ERROR_LENGTH = 280;

type DcsMachineResponse = {
  machine_id?: string;
  id?: string;
  status?: {
    phase?: string;
    reason?: string;
  };
};

type DcsExecutionResponse = {
  execution_id?: string;
  id?: string;
  status?: "pending" | "running" | "succeeded" | "failed" | string;
};

type DcsExecutionOutput = {
  stdout?: string;
  stderr?: string;
};

interface DedalusRuntimeState {
  machineId: string | null;
  machinePhase: string | null;
  machineReason: string | null;
  openclaw: DedalusOpenClawStatus;
  proof: DedalusRuntimeProof;
  apiConnected: boolean;
  phase: DedalusRuntimePhase;
  error: string | null;
  updatedAt: string;
}

const nowIso = () => new Date().toISOString();

const statePath = () =>
  process.env.CITADAIL_DEDALUS_STATE_PATH ??
  path.join(process.cwd(), ".citadail", "runtime", "dedalus-runtime.json");

export const validDedalusActions: DedalusRuntimeAction[] = [
  "ping_api",
  "create_machine",
  "bootstrap_machine",
  "sync_full_auto_run",
  "openclaw_health",
  "sleep_machine",
];

export const isDedalusRuntimeAction = (
  value: unknown,
): value is DedalusRuntimeAction =>
  typeof value === "string" &&
  validDedalusActions.includes(value as DedalusRuntimeAction);

const emptyProof = (): DedalusRuntimeProof => ({
  activeTheses: 0,
  journalEntries: 0,
  lastSyncedAt: null,
  persistedSimulationTime: null,
});

const emptyOpenClawStatus = (): DedalusOpenClawStatus => ({
  checkedAt: null,
  detail: null,
  health: "unknown",
});

const createInitialState = (): DedalusRuntimeState => ({
  apiConnected: false,
  error: null,
  machineId: process.env.DEDALUS_MACHINE_ID ?? null,
  machinePhase: null,
  machineReason: null,
  openclaw: emptyOpenClawStatus(),
  phase: process.env.DEDALUS_API_KEY ? "api_connected" : "unconfigured",
  proof: emptyProof(),
  updatedAt: nowIso(),
});

export const redactDedalusText = (value: unknown) => {
  const raw = value instanceof Error ? value.message : String(value ?? "");
  const key = process.env.DEDALUS_API_KEY;
  const redactedKey = key ? raw.replaceAll(key, "[redacted]") : raw;
  return redactedKey
    .replace(/dsk-[A-Za-z0-9_-]+/g, "dsk-[redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .slice(0, MAX_ERROR_LENGTH);
};

const normalizeState = (value: unknown): DedalusRuntimeState => {
  const fallback = createInitialState();
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<DedalusRuntimeState>;
  return {
    apiConnected: Boolean(candidate.apiConnected),
    error: typeof candidate.error === "string" ? candidate.error : null,
    machineId:
      process.env.DEDALUS_MACHINE_ID ??
      (typeof candidate.machineId === "string" ? candidate.machineId : null),
    machinePhase:
      typeof candidate.machinePhase === "string" ? candidate.machinePhase : null,
    machineReason:
      typeof candidate.machineReason === "string" ? candidate.machineReason : null,
    openclaw:
      candidate.openclaw && typeof candidate.openclaw === "object"
        ? {
            checkedAt:
              typeof candidate.openclaw.checkedAt === "string"
                ? candidate.openclaw.checkedAt
                : null,
            detail:
              typeof candidate.openclaw.detail === "string"
                ? candidate.openclaw.detail
                : null,
            health:
              candidate.openclaw.health === "healthy" ||
              candidate.openclaw.health === "offline" ||
              candidate.openclaw.health === "error"
                ? candidate.openclaw.health
                : "unknown",
          }
        : fallback.openclaw,
    phase:
      typeof candidate.phase === "string"
        ? (candidate.phase as DedalusRuntimePhase)
        : fallback.phase,
    proof:
      candidate.proof && typeof candidate.proof === "object"
        ? {
            activeTheses:
              typeof candidate.proof.activeTheses === "number"
                ? candidate.proof.activeTheses
                : 0,
            journalEntries:
              typeof candidate.proof.journalEntries === "number"
                ? candidate.proof.journalEntries
                : 0,
            lastSyncedAt:
              typeof candidate.proof.lastSyncedAt === "string"
                ? candidate.proof.lastSyncedAt
                : null,
            persistedSimulationTime:
              typeof candidate.proof.persistedSimulationTime === "string"
                ? candidate.proof.persistedSimulationTime
                : null,
          }
        : fallback.proof,
    updatedAt:
      typeof candidate.updatedAt === "string" ? candidate.updatedAt : fallback.updatedAt,
  };
};

export const loadDedalusRuntimeState = async () => {
  try {
    const raw = await readFile(statePath(), "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    const initial = createInitialState();
    await saveDedalusRuntimeState(initial);
    return initial;
  }
};

const saveDedalusRuntimeState = async (state: DedalusRuntimeState) => {
  const next = {
    ...state,
    error: state.error ? redactDedalusText(state.error) : null,
    updatedAt: nowIso(),
  };
  await mkdir(path.dirname(statePath()), { recursive: true });
  await writeFile(statePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
};

const runtimeStatusFromState = (
  state: DedalusRuntimeState,
): DedalusRuntimeStatus => ({
  apiConnected: state.apiConnected,
  configured: Boolean(process.env.DEDALUS_API_KEY),
  error: state.error,
  machine: {
    id: state.machineId,
    phase: state.machinePhase,
    reason: state.machineReason,
  },
  openclaw: state.openclaw,
  phase: Boolean(process.env.DEDALUS_API_KEY) ? state.phase : "unconfigured",
  proof: state.proof,
  updatedAt: state.updatedAt,
});

export const getDedalusRuntimeStatus = async (): Promise<DedalusRuntimeStatus> =>
  runtimeStatusFromState(await loadDedalusRuntimeState());

const assertConfigured = () => {
  const apiKey = process.env.DEDALUS_API_KEY;
  if (!apiKey) {
    throw new Error("DEDALUS_API_KEY is not configured.");
  }
  return apiKey;
};

const apiClient = () =>
  new Dedalus({
    apiKey: assertConfigured(),
    baseURL: process.env.DEDALUS_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    maxRetries: 0,
    timeout: 8000,
  });

const dcsClient = () =>
  new Dedalus({
    baseURL: process.env.DEDALUS_DCS_BASE_URL ?? DEFAULT_DCS_BASE_URL,
    maxRetries: 0,
    timeout: 12000,
    xAPIKey: assertConfigured(),
  });

const machineIdFrom = (machine: DcsMachineResponse) =>
  machine.machine_id ?? machine.id ?? null;

const machineSummaryFrom = (machine: DcsMachineResponse): DedalusMachineSummary => ({
  id: machineIdFrom(machine),
  phase: machine.status?.phase ?? null,
  reason: machine.status?.reason ?? null,
});

const updateMachineState = async (
  state: DedalusRuntimeState,
  machine: DedalusMachineSummary,
  phase?: DedalusRuntimePhase,
) =>
  saveDedalusRuntimeState({
    ...state,
    error: null,
    machineId: machine.id ?? state.machineId,
    machinePhase: machine.phase,
    machineReason: machine.reason,
    phase:
      phase ??
      (machine.phase === "running"
        ? "machine_running"
        : machine.phase === "sleeping" || machine.phase === "stopped"
          ? "sleeping"
          : state.phase),
  });

const retrieveMachine = async (machineId: string) => {
  const machine = await dcsClient().get<DcsMachineResponse>(`/machines/${machineId}`);
  return machineSummaryFrom(machine);
};

const requireMachineId = async () => {
  const state = await loadDedalusRuntimeState();
  const machineId = process.env.DEDALUS_MACHINE_ID ?? state.machineId;
  if (!machineId) throw new Error("No Dedalus machine id is attached.");
  return { machineId, state };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForExecution = async ({
  executionId,
  machineId,
  timeoutMs,
}: {
  machineId: string;
  executionId: string;
  timeoutMs: number;
}) => {
  const startedAt = Date.now();
  let latest = await dcsClient().get<DcsExecutionResponse>(
    `/machines/${machineId}/executions/${executionId}`,
  );
  while (
    latest.status !== "succeeded" &&
    latest.status !== "failed" &&
    Date.now() - startedAt < timeoutMs
  ) {
    await sleep(1000);
    latest = await dcsClient().get<DcsExecutionResponse>(
      `/machines/${machineId}/executions/${executionId}`,
    );
  }
  return latest;
};

const machineExec = async ({
  command,
  machineId,
  timeoutMs = 120000,
}: {
  machineId: string;
  command: string;
  timeoutMs?: number;
}) => {
  const created = await dcsClient().post<DcsExecutionResponse>(
    `/machines/${machineId}/executions`,
    {
      body: {
        command: ["/bin/bash", "-c", command],
        machine_id: machineId,
        timeout_ms: timeoutMs,
      },
    },
  );
  const executionId = created.execution_id ?? created.id;
  if (!executionId) throw new Error("Dedalus execution id missing.");
  const result = await waitForExecution({ executionId, machineId, timeoutMs });
  const output = await dcsClient().get<DcsExecutionOutput>(
    `/machines/${machineId}/executions/${executionId}/output`,
  );
  if (result.status !== "succeeded") {
    throw new Error(output.stderr || output.stdout || "Dedalus execution failed.");
  }
  return output.stdout?.trim() ?? "";
};

const bashQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const writeMachineFile = async ({
  content,
  machineId,
  remotePath,
}: {
  machineId: string;
  remotePath: string;
  content: string;
}) => {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const scratch = `${remotePath}.b64`;
  await machineExec({
    command: `mkdir -p ${bashQuote(path.posix.dirname(remotePath))} && : > ${bashQuote(scratch)}`,
    machineId,
    timeoutMs: 30000,
  });
  for (let index = 0; index < encoded.length; index += 24000) {
    const chunk = encoded.slice(index, index + 24000);
    await machineExec({
      command: `printf %s ${bashQuote(chunk)} >> ${bashQuote(scratch)}`,
      machineId,
      timeoutMs: 30000,
    });
  }
  await machineExec({
    command: `base64 -d ${bashQuote(scratch)} > ${bashQuote(remotePath)} && rm -f ${bashQuote(scratch)}`,
    machineId,
    timeoutMs: 30000,
  });
};

const proofFromRun = (run: FullAutoRun): DedalusRuntimeProof => ({
  activeTheses: run.thesisRecords.filter(
    (record) => record.monitoringState === "active",
  ).length,
  journalEntries: run.journal.length,
  lastSyncedAt: nowIso(),
  persistedSimulationTime: run.simulationTime,
});

export const pingDedalusApi = async () => {
  const state = await loadDedalusRuntimeState();
  try {
    await apiClient().models.list({ timeout: 7000 });
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        apiConnected: true,
        error: null,
        phase: state.machineId ? "machine_running" : "api_connected",
      }),
    );
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        apiConnected: false,
        error: redactDedalusText(error),
        phase: "error",
      }),
    );
  }
};

export const createDedalusMachine = async () => {
  let state = await loadDedalusRuntimeState();
  if (!process.env.DEDALUS_API_KEY) {
    return runtimeStatusFromState({
      ...state,
      error: "DEDALUS_API_KEY is not configured.",
      phase: "unconfigured",
    });
  }
  state = await saveDedalusRuntimeState({
    ...state,
    apiConnected: true,
    error: null,
    phase: "machine_creating",
  });
  try {
    const created = await dcsClient().post<DcsMachineResponse>("/machines", {
      body: {
        memory_mib: 4096,
        storage_gib: 10,
        vcpu: 2,
      },
      timeout: 20000,
    });
    const machine = machineSummaryFrom(created);
    const next = await updateMachineState(state, machine, "machine_creating");
    return runtimeStatusFromState(next);
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        error: redactDedalusText(error),
        phase: "error",
      }),
    );
  }
};

export const refreshDedalusMachineStatus = async () => {
  const { machineId, state } = await requireMachineId();
  try {
    const machine = await retrieveMachine(machineId);
    return runtimeStatusFromState(await updateMachineState(state, machine));
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        error: redactDedalusText(error),
        phase: "error",
      }),
    );
  }
};

export const bootstrapDedalusOpenClaw = async () => {
  const { machineId, state } = await requireMachineId();
  let next = await saveDedalusRuntimeState({
    ...state,
    error: null,
    phase: "bootstrapping_openclaw",
  });
  try {
    await machineExec({
      command:
        "mkdir -p /home/machine/.npm-global /home/machine/.npm-cache /home/machine/.tmp /home/machine/.openclaw /home/machine/.compile-cache /home/machine/citadail/state && " +
        "if ! command -v node >/dev/null 2>&1; then curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 && apt-get install -y nodejs >/dev/null 2>&1; fi && " +
        "if ! command -v openclaw >/dev/null 2>&1; then NPM_CONFIG_PREFIX=/home/machine/.npm-global NPM_CONFIG_CACHE=/home/machine/.npm-cache TMPDIR=/home/machine/.tmp npm install -g openclaw@latest >/dev/null 2>&1; fi && " +
        "export PATH=/home/machine/.npm-global/bin:$PATH && export HOME=/home/machine && export OPENCLAW_STATE_DIR=/home/machine/.openclaw && openclaw --version",
      machineId,
      timeoutMs: 240000,
    });
    next = await saveDedalusRuntimeState({
      ...next,
      error: null,
      openclaw: {
        checkedAt: nowIso(),
        detail: "OpenClaw CLI installed on the Dedalus machine.",
        health: "healthy",
      },
      phase: "runtime_ready",
    });
    return runtimeStatusFromState(next);
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...next,
        error: redactDedalusText(error),
        openclaw: {
          checkedAt: nowIso(),
          detail: "OpenClaw bootstrap failed.",
          health: "error",
        },
        phase: "error",
      }),
    );
  }
};

export const syncFullAutoRunToDedalus = async (run: FullAutoRun) => {
  const { machineId, state } = await requireMachineId();
  let next = await saveDedalusRuntimeState({
    ...state,
    error: null,
    phase: "syncing",
  });
  const proof = proofFromRun(run);
  const runtimeStatus = {
    activeTheses: proof.activeTheses,
    journalEntries: proof.journalEntries,
    lastSyncedAt: proof.lastSyncedAt,
    paperOnly: true,
    persistedSimulationTime: proof.persistedSimulationTime,
    source: "Citadail Full Auto",
  };
  try {
    await writeMachineFile({
      content: JSON.stringify(run),
      machineId,
      remotePath: RUN_STATE_PATH,
    });
    await writeMachineFile({
      content: JSON.stringify(runtimeStatus, null, 2),
      machineId,
      remotePath: RUNTIME_STATUS_PATH,
    });
    next = await saveDedalusRuntimeState({
      ...next,
      error: null,
      phase: next.openclaw.health === "healthy" ? "runtime_ready" : "machine_running",
      proof,
    });
    return runtimeStatusFromState(next);
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...next,
        error: redactDedalusText(error),
        phase: "error",
      }),
    );
  }
};

export const checkDedalusOpenClawHealth = async () => {
  const { machineId, state } = await requireMachineId();
  try {
    const output = await machineExec({
      command:
        "export PATH=/home/machine/.npm-global/bin:$PATH && export HOME=/home/machine && export OPENCLAW_STATE_DIR=/home/machine/.openclaw && " +
        "(openclaw --version 2>/dev/null || /home/machine/.npm-global/bin/openclaw --version 2>/dev/null)",
      machineId,
      timeoutMs: 45000,
    });
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        error: null,
        openclaw: {
          checkedAt: nowIso(),
          detail: output || "OpenClaw is installed.",
          health: "healthy",
        },
        phase: "runtime_ready",
      }),
    );
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        error: redactDedalusText(error),
        openclaw: {
          checkedAt: nowIso(),
          detail: "OpenClaw did not respond on the machine.",
          health: "error",
        },
        phase: "error",
      }),
    );
  }
};

export const sleepDedalusMachine = async () => {
  const { machineId, state } = await requireMachineId();
  try {
    await dcsClient().post<unknown>(`/machines/${machineId}/sleep`, {
      body: { machine_id: machineId },
      timeout: 12000,
    });
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        error: null,
        machinePhase: "sleeping",
        phase: "sleeping",
      }),
    );
  } catch (error) {
    return runtimeStatusFromState(
      await saveDedalusRuntimeState({
        ...state,
        error: redactDedalusText(error),
        phase: "error",
      }),
    );
  }
};

export const runDedalusRuntimeAction = async ({
  action,
  run,
}: {
  action: DedalusRuntimeAction;
  run?: FullAutoRun;
}) => {
  if (action === "ping_api") return pingDedalusApi();
  if (action === "create_machine") return createDedalusMachine();
  if (action === "bootstrap_machine") return bootstrapDedalusOpenClaw();
  if (action === "openclaw_health") return checkDedalusOpenClawHealth();
  if (action === "sleep_machine") return sleepDedalusMachine();
  if (action === "sync_full_auto_run") {
    if (!run) throw new Error("Full Auto run is required for Dedalus sync.");
    return syncFullAutoRunToDedalus(run);
  }
  throw new Error("Unsupported Dedalus runtime action.");
};

export const trySyncFullAutoRunToDedalus = async (run: FullAutoRun) => {
  try {
    const state = await loadDedalusRuntimeState();
    const machineId = process.env.DEDALUS_MACHINE_ID ?? state.machineId;
    if (!process.env.DEDALUS_API_KEY || !machineId) return null;
    return await syncFullAutoRunToDedalus(run);
  } catch (error) {
    const state = await loadDedalusRuntimeState();
    await saveDedalusRuntimeState({
      ...state,
      error: redactDedalusText(error),
      phase: "error",
    });
    return null;
  }
};

export const formatDedalusRuntimeForPm = (status: DedalusRuntimeStatus) => {
  if (!status.configured) {
    return [
      "Runtime is not attached yet.",
      "Dedalus key is missing on the server.",
      "Paper portfolio only.",
    ].join("\n");
  }

  const machine = status.machine.id
    ? `Machine: ${status.machine.phase ?? "attached"}`
    : "Machine: not attached";
  const openclaw =
    status.openclaw.health === "healthy"
      ? "OpenClaw: healthy"
      : `OpenClaw: ${status.openclaw.health}`;
  const sync = status.proof.lastSyncedAt
    ? `Last sync: ${new Date(status.proof.lastSyncedAt).toLocaleString([], {
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        timeZone: "UTC",
        year: "numeric",
      })}`
    : "Last sync: not yet";

  return [
    "Runtime is machine-backed on Dedalus.",
    machine,
    openclaw,
    sync,
    `Paper book: ${status.proof.activeTheses} active theses, ${status.proof.journalEntries} journal entries.`,
    "Paper portfolio only. No live execution.",
  ].join("\n");
};

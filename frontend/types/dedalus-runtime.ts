import type { FullAutoRun } from "@/types/full-auto";

export type FullAutoExecutionMode = "local" | "hybrid" | "dedalus_openclaw";

export type OpenClawStepCommand = "start" | "step" | "pause";

export type OpenClawExecutionStatus =
  | "remote_success"
  | "local_fallback"
  | "remote_failed";

export interface OpenClawExecutionProof {
  id: string;
  command: OpenClawStepCommand;
  completedAt: string;
  error: string | null;
  eventCount: number;
  executionId: string | null;
  executionMode: FullAutoExecutionMode;
  simulationTime: string;
  startedAt: string;
  status: OpenClawExecutionStatus;
  summaryLine: string;
}

export type DedalusRuntimePhase =
  | "unconfigured"
  | "api_connected"
  | "machine_creating"
  | "machine_running"
  | "bootstrapping_openclaw"
  | "runtime_ready"
  | "syncing"
  | "sleeping"
  | "error";

export type DedalusOpenClawHealth = "unknown" | "offline" | "healthy" | "error";

export type DedalusRuntimeAction =
  | "ping_api"
  | "create_machine"
  | "bootstrap_machine"
  | "sync_full_auto_run"
  | "run_openclaw_step"
  | "openclaw_health"
  | "sleep_machine";

export interface DedalusMachineSummary {
  id: string | null;
  phase: string | null;
  reason: string | null;
}

export interface DedalusRuntimeProof {
  activeTheses: number;
  journalEntries: number;
  lastSyncedAt: string | null;
  latestOpenClawProof: OpenClawExecutionProof | null;
  openClawProofs: OpenClawExecutionProof[];
  persistedSimulationTime: string | null;
}

export interface DedalusOpenClawStatus {
  health: DedalusOpenClawHealth;
  detail: string | null;
  checkedAt: string | null;
}

export interface DedalusRuntimeStatus {
  configured: boolean;
  phase: DedalusRuntimePhase;
  apiConnected: boolean;
  machine: DedalusMachineSummary;
  openclaw: DedalusOpenClawStatus;
  proof: DedalusRuntimeProof;
  error: string | null;
  updatedAt: string;
}

export interface DedalusRuntimeActionBody {
  action: DedalusRuntimeAction;
  command?: OpenClawStepCommand;
  run?: FullAutoRun;
}

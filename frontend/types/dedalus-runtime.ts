import type { FullAutoRun } from "@/types/full-auto";

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
  run?: FullAutoRun;
}

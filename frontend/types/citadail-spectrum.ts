import type { FullAutoRun } from "@/types/full-auto";

export type CitadailSpectrumCommandType =
  | "brief"
  | "book"
  | "positions"
  | "watch"
  | "step"
  | "fast_forward"
  | "thesis"
  | "memo"
  | "model"
  | "deck"
  | "chart"
  | "news"
  | "start_feed"
  | "stop_feed"
  | "pulse"
  | "runtime"
  | "run_machine_step"
  | "approve"
  | "send_back"
  | "reject"
  | "risk_approve"
  | "reduce"
  | "monitor"
  | "open"
  | "trim"
  | "exit"
  | "help"
  | "unknown";

export interface CitadailSpectrumCommand {
  type: CitadailSpectrumCommandType;
  ticker: string | null;
  rawText: string;
  spaceId: string;
  senderId: string;
  messageId: string;
  isGroup: boolean;
}

export interface CitadailSpectrumAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface CitadailSpectrumResponse {
  kind: "text" | "artifact" | "action" | "error";
  text: string;
  attachments?: CitadailSpectrumAttachment[];
  relatedTicker?: string;
  auditText?: string;
}

export interface SpectrumProactiveCursor {
  lastPulseAt: string | null;
  lastSimulationTime: string | null;
  nextAgentIndex: number;
}

export interface SpectrumDeskAuditEntry {
  id: string;
  timestamp: string;
  spaceId: string;
  senderId: string;
  command: string;
  result: string;
}

export interface SpectrumDeskState {
  activeRun: FullAutoRun;
  processedMessageIds: string[];
  knownSpaces: string[];
  proactiveSpaces: string[];
  proactiveCursors: Record<string, SpectrumProactiveCursor>;
  auditTrail: SpectrumDeskAuditEntry[];
  updatedAt: string;
}

import type {
  EquityPriorWindowValidation,
  ThesisRecommendation,
} from "@/types/session";

export type FullAutoRunStatus = "idle" | "running" | "paused" | "complete" | "failed";

export type FullAutoStepCommand =
  | "start"
  | "pause"
  | "step_day"
  | "step_event"
  | "fast_forward";

export type HistoricalSourceType =
  | "filing"
  | "fundamentals"
  | "macro"
  | "news"
  | "price";

export interface HistoricalSource {
  sourceId: string;
  ticker: string;
  sourceType: HistoricalSourceType;
  title: string;
  text: string;
  sourceUrl?: string;
  publishedAt: string;
  knownAt: string;
  asOfDate: string;
  retrievedAt: string;
  snapshotId: string;
  price?: number;
  metrics?: Record<string, number | string>;
}

export type FullAutoAgentRole =
  | "Morning Brief Agent"
  | "Candidate Agent"
  | "Fundamental Analyst"
  | "News / Sentiment Analyst"
  | "Market Structure Analyst"
  | "Macro / Context Analyst"
  | "PM Synthesizer"
  | "Validation Agent"
  | "Risk Gate Agent"
  | "Desk Agent"
  | "Monitor Agent"
  | "Journal Agent";

export interface FullAutoAgentEvent {
  id: string;
  role: FullAutoAgentRole;
  status: "running" | "complete" | "failed";
  timestamp: string;
  simulationTime: string;
  message: string;
  visibleSourceIds: string[];
  output?: Record<string, unknown>;
}

export interface FullAutoCandidate {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  score: number;
  reason: string;
  eventTag: string;
  status: "queued" | "worked_up" | "rejected";
  simulationTime: string;
  visibleSourceIds: string[];
}

export interface ThesisRecordEvidence {
  label: string;
  value: string;
  sourceId: string;
}

export interface ThesisRecord {
  id: string;
  ticker: string;
  companyName: string;
  sector: string;
  simulationTime: string;
  recommendation: ThesisRecommendation;
  conviction: number;
  oneLineThesis: string;
  variantView: {
    marketBelieves: string;
    weBelieve: string;
    whyNow: string;
  };
  evidence: ThesisRecordEvidence[];
  assumptions: string[];
  catalysts: string[];
  risks: string[];
  invalidationTriggers: string[];
  pmDecision: "pending" | "approved" | "rejected" | "revise";
  validation: EquityPriorWindowValidation | null;
  riskDecision: "pending" | "approved" | "reduced" | "rejected" | "monitor_first";
  paperPositionId: string | null;
  monitoringState: "not_started" | "active" | "weakened" | "broken";
  sourceIds: string[];
}

export interface FullAutoPaperPosition {
  id: string;
  thesisRecordId: string;
  ticker: string;
  side: "long" | "short";
  status: "open" | "closed";
  entryPrice: number;
  currentPrice: number;
  lastPriceKnownAt: string;
  size: number;
  initialSize: number;
  pnl: number;
  returnPct: number;
  openedAt: string;
  closedAt: string | null;
  thesisStatus: "active" | "weakened" | "broken";
  nextAction: "Hold" | "Add" | "Trim" | "Exit" | "Revisit";
  rationale: string;
  visibleSourceIds: string[];
  history: FullAutoPaperTradeAction[];
}

export interface FullAutoPaperTradeAction {
  id: string;
  type: "open" | "add" | "trim" | "exit" | "recheck";
  timestamp: string;
  simulationTime: string;
  price: number;
  sizeDelta: number;
  note: string;
}

export interface FullAutoEquityCurvePoint {
  date: string;
  label: string;
  value: number;
  cash: number;
  grossExposure: number;
  netExposure: number;
  openPositions: number;
  closedPositions: number;
}

export interface FullAutoPortfolio {
  startingCapital: number;
  cash: number;
  netLiquidationValue: number;
  grossExposure: number;
  grossExposurePct: number;
  realizedPnl: number;
  unrealizedPnl: number;
  openPositionCount: number;
  closedPositionCount: number;
  equityCurve: FullAutoEquityCurvePoint[];
}

export interface FullAutoThesisRegistry {
  active: string[];
  shelved: string[];
  broken: string[];
  closed: string[];
}

export interface FullAutoJournalEntry {
  id: string;
  timestamp: string;
  simulationTime: string;
  title: string;
  body: string;
  relatedTicker?: string;
  relatedThesisRecordId?: string;
  visibleSourceIds: string[];
}

export interface FullAutoRun {
  id: string;
  status: FullAutoRunStatus;
  createdAt: string;
  updatedAt: string;
  startDate: string;
  endDate: string;
  simulationTime: string;
  universe: string[];
  strategyProfile: string;
  riskLimits: {
    maxPositionPct: number;
    targetGrossExposurePct: number;
    maxGrossExposurePct: number;
    maxOpenPositions: number;
    cooldownDays: number;
  };
  portfolio: FullAutoPortfolio;
  thesisRegistry: FullAutoThesisRegistry;
  currentBrief: {
    headline: string;
    summary: string;
    sourceCount: number;
    tone: "constructive" | "mixed" | "defensive";
  } | null;
  candidateQueue: FullAutoCandidate[];
  agentEvents: FullAutoAgentEvent[];
  thesisRecords: ThesisRecord[];
  paperPositions: FullAutoPaperPosition[];
  journal: FullAutoJournalEntry[];
  error: string | null;
  openedSessionIds: Record<string, string>;
}

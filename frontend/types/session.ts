export type WorkspaceTabId =
  | "morning-brief"
  | "live-book"
  | "coverage-desk"
  | "thesis"
  | `project:${EquityProjectArtifactType}`
  | "pm-review"
  | "risk-gate"
  | "trade-desk"
  | "thread"
  | `artifact:${string}`;

export type ThesisRecommendation = "buy-long" | "hold-neutral" | "sell-short";

export type EquityValidationStatus =
  | "supportive"
  | "mixed"
  | "weak"
  | "insufficient";

export interface EquityPriorWindowValidation {
  status: EquityValidationStatus;
  lookbackDays: number;
  observationCount: number;
  medianForwardReturn: number | null;
  winRate: number | null;
  maxDrawdown: number | null;
  verdict: string;
  sourceIds: string[];
}

export interface ThesisDraft {
  ticker: string;
  recommendation: ThesisRecommendation | null;
  rationale: string;
  submittedAt: string | null;
}

export type EquityProjectStatus = "generating" | "ready" | "failed";

export type EquityProjectArtifactType =
  | "memo_docx"
  | "operating_model_xlsx"
  | "pm_deck_pptx";

export type EquityProjectArtifactStatus =
  | "generating"
  | "ready"
  | "failed";

export interface EquityProjectArtifact {
  type: EquityProjectArtifactType;
  title: string;
  status: EquityProjectArtifactStatus;
  filename: string;
  mimeType: string;
  preview: string;
  error: string | null;
}

export interface EquityMemoSection {
  heading: string;
  body: string;
}

export interface EquityEvidenceItem {
  label: string;
  value: string;
  source: string;
  implication: string;
}

export interface EquityModelAssumption {
  label: string;
  value: string;
  source: string;
}

export interface EquityForecastRow {
  year: string;
  revenue: number;
  revenueGrowth: number;
  grossMargin: number;
  operatingMargin: number;
  freeCashFlowMargin: number;
}

export interface EquityValuationOutput {
  metric: string;
  value: string;
  source: string;
}

export interface EquitySensitivityRow {
  case: string;
  revenueGrowth: number;
  operatingMargin: number;
  impliedValue: number;
}

export interface EquityCompsRow {
  ticker: string;
  company: string;
  evRevenue: number;
  evEbitda: number;
  pe: number;
  rationale: string;
}

export interface EquityRiskTrigger {
  trigger: string;
  threshold: string;
  action: string;
}

export interface EquityTradeProposal {
  bias: string;
  entryZone: string;
  positionSize: string;
  timeHorizon: string;
  addTrimExit: string;
}

export interface EquityDeckSlide {
  title: string;
  bullets: string[];
  speakerNotes: string;
}

export interface EquityProjectGeneratedContent {
  companyOverview: string;
  recommendationSummary: string;
  whyNow: string;
  whatChanged: string;
  marketMissing: string;
  variantPerception: string;
  bullCase: string;
  baseCase: string;
  bearCase: string;
  catalysts: string[];
  risks: string[];
  invalidationConditions: string[];
  memoSections: EquityMemoSection[];
  evidence: EquityEvidenceItem[];
  modelAssumptions: EquityModelAssumption[];
  forecast: EquityForecastRow[];
  valuation: EquityValuationOutput[];
  sensitivity: EquitySensitivityRow[];
  comps: EquityCompsRow[];
  riskTriggers: EquityRiskTrigger[];
  tradeProposal: EquityTradeProposal;
  deckSlides: EquityDeckSlide[];
  validation: EquityPriorWindowValidation | null;
}

export interface EquityProject {
  id: string;
  ticker: string;
  recommendation: ThesisRecommendation;
  rationale: string;
  status: EquityProjectStatus;
  createdAt: string;
  updatedAt: string;
  artifacts: Record<EquityProjectArtifactType, EquityProjectArtifact>;
  generatedContent: EquityProjectGeneratedContent | null;
  error: string | null;
}

export type EquityPmReviewDecision = "pending" | "approved_to_risk" | "revise" | "rejected";

export interface EquityPmReview {
  projectId: string;
  decision: EquityPmReviewDecision;
  note: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export type EquityRiskGateDecision =
  | "pending"
  | "approved_to_desk"
  | "reduce_size"
  | "monitor_first"
  | "rejected";

export interface EquityRiskGate {
  projectId: string;
  decision: EquityRiskGateDecision;
  note: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

export type EquityPaperPositionSide = "long" | "short";
export type EquityPaperPositionStatus = "open" | "closed";
export type EquityThesisStatus = "active" | "weakened" | "broken";
export type EquityDeskSuggestedAction = "Open" | "Hold" | "Add" | "Trim" | "Exit" | "Revisit";

export interface EquityPaperTradeEvent {
  id: string;
  type: "open" | "add" | "trim" | "exit" | "recheck";
  timestamp: string;
  price: number;
  sizeDelta: number;
  note: string;
}

export interface EquityPaperPosition {
  id: string;
  projectId: string;
  ticker: string;
  side: EquityPaperPositionSide;
  entryPrice: number;
  currentPrice: number;
  size: number;
  status: EquityPaperPositionStatus;
  openedAt: string;
  closedAt: string | null;
  rationale: string;
  thesisStatus: EquityThesisStatus;
  nextCatalyst: string;
  nextAction: EquityDeskSuggestedAction;
  history: EquityPaperTradeEvent[];
}

export type SessionEventType =
  | "session_started"
  | "session_ended"
  | "tool_called"
  | "tool_result"
  | "artifact_created"
  | "view_changed"
  | "note";

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestamp: Date;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SessionTranscriptEntry {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: Date;
}

export type SessionArtifactType = "text" | "data" | "tool_result";

export interface SessionArtifact {
  id: string;
  type: SessionArtifactType;
  title: string;
  createdAt: Date;
  summary: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SessionSnapshot {
  activeTab: WorkspaceTabId;
  activeArtifactId: string | null;
  selectedTicker: string | null;
  thesisDraft: ThesisDraft | null;
  equityProject: EquityProject | null;
  pmReview: EquityPmReview | null;
  riskGate: EquityRiskGate | null;
  paperPosition: EquityPaperPosition | null;
  transcript: SessionTranscriptEntry[];
}

export interface ShellSession {
  id: string;
  title: string;
  summary: string;
  status: "active" | "ended" | "idle";
  createdAt: Date;
  updatedAt: Date;
  endedAt: Date | null;
  events: SessionEvent[];
  artifacts: SessionArtifact[];
  snapshot: SessionSnapshot;
}

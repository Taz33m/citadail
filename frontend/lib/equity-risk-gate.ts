import { buildPmReviewPacket } from "@/lib/equity-pm-review";
import { formatThesisRecommendation } from "@/lib/equity-project";
import type {
  EquityPmReview,
  EquityPriorWindowValidation,
  EquityProject,
  EquityRiskGate,
  EquityRiskGateDecision,
} from "@/types/session";

export interface EquityRiskGatePacket {
  ticker: string;
  recommendation: string;
  conviction: number;
  proposedTrade: string;
  riskScore: number;
  suggestedSize: string;
  suggestedAction: "Approve to Desk" | "Reduce Size" | "Monitor First" | "Reject";
  keyRisks: string[];
  invalidationTriggers: string[];
  majorObjections: string[];
  validation: EquityPriorWindowValidation | null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const compact = (value: string, fallback: string, maxLength = 180) => {
  const cleaned = value.replace(/\s+/g, " ").trim() || fallback;
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trim()}...`
    : cleaned;
};

export const createPendingRiskGate = (projectId: string): EquityRiskGate => {
  const now = new Date().toISOString();
  return {
    projectId,
    decision: "pending",
    note: null,
    decidedAt: null,
    updatedAt: now,
  };
};

export const updateRiskGateDecision = ({
  decision,
  note,
  projectId,
}: {
  projectId: string;
  decision: EquityRiskGateDecision;
  note?: string | null;
}): EquityRiskGate => {
  const now = new Date().toISOString();
  return {
    projectId,
    decision,
    note: note?.trim() || null,
    decidedAt: decision === "pending" ? null : now,
    updatedAt: now,
  };
};

export const buildRiskGatePacket = (
  project: EquityProject | null,
  pmReview: EquityPmReview | null,
): EquityRiskGatePacket | null => {
  const content = project?.generatedContent;
  if (
    !project ||
    project.status !== "ready" ||
    !content ||
    pmReview?.decision !== "approved_to_risk"
  ) {
    return null;
  }

  const pmPacket = buildPmReviewPacket(project);
  const conviction = pmPacket?.conviction ?? 6.5;
  const riskLoad =
    Math.min(content.risks.length, 6) * 4 +
    Math.min(content.riskTriggers.length, 4) * 5 +
    (project.recommendation === "sell-short" ? 12 : 0) +
    (conviction < 7 ? 8 : 0);
  const riskScore = Math.round(clamp(35 + riskLoad - conviction * 2, 20, 92));
  const suggestedAction =
    riskScore >= 78
      ? "Reject"
      : riskScore >= 62
        ? "Monitor First"
        : riskScore >= 48
          ? "Reduce Size"
          : "Approve to Desk";
  const suggestedSize =
    suggestedAction === "Approve to Desk"
      ? content.tradeProposal.positionSize
      : suggestedAction === "Reduce Size"
        ? "Half starter size; require catalyst confirmation before adding."
        : suggestedAction === "Monitor First"
          ? "No initial position; monitor until the top trigger resolves."
          : "No position.";

  const keyRisks = content.risks
    .map((risk) => compact(risk, "Risk not specified."))
    .slice(0, 3);
  while (keyRisks.length < 3) keyRisks.push("Execution risk.");

  const invalidationTriggers = [
    ...content.invalidationConditions,
    ...content.riskTriggers.map(
      (trigger) => `${trigger.trigger}: ${trigger.threshold}`,
    ),
  ]
    .map((trigger) => compact(trigger, "Trigger not specified."))
    .slice(0, 3);
  while (invalidationTriggers.length < 3) {
    invalidationTriggers.push("New evidence contradicts the thesis.");
  }

  return {
    ticker: project.ticker,
    recommendation: formatThesisRecommendation(project.recommendation),
    conviction,
    proposedTrade: compact(
      `${content.tradeProposal.bias}; ${content.tradeProposal.entryZone}; ${content.tradeProposal.timeHorizon}.`,
      content.tradeProposal.bias,
      240,
    ),
    riskScore,
    suggestedSize,
    suggestedAction,
    keyRisks,
    invalidationTriggers,
    validation: content.validation,
    majorObjections: [
      compact(content.bearCase, "Downside path needs tighter sizing.", 170),
      compact(
        content.riskTriggers[0]?.action ?? content.tradeProposal.addTrimExit,
        "Exit logic must be explicit before desk handoff.",
        170,
      ),
      compact(
        pmReview.note ?? "PM approved; risk still needs sizing discipline.",
        "PM approved; risk still needs sizing discipline.",
        170,
      ),
    ],
  };
};

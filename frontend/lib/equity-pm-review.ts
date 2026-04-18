import { formatThesisRecommendation } from "@/lib/equity-project";
import type {
  EquityPmReview,
  EquityProject,
  EquityProjectGeneratedContent,
  EquityRiskTrigger,
} from "@/types/session";

export interface EquityPmReviewPacket {
  ticker: string;
  recommendation: string;
  conviction: number;
  oneLineThesis: string;
  timeHorizon: string;
  marketBelieves: string;
  weBelieve: string;
  whyNow: string;
  killConditions: string[];
  loadBearingAssumption: string;
  challengeQuestions: string[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const compact = (value: string, fallback: string, maxLength = 220) => {
  const cleaned = value.replace(/\s+/g, " ").trim() || fallback;
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trim()}...`
    : cleaned;
};

const firstSentence = (value: string, fallback: string) => {
  const sentence = value.match(/.*?[.!?](?:\s|$)/)?.[0] ?? value;
  return compact(sentence, fallback, 180);
};

export const createPendingPmReview = (projectId: string): EquityPmReview => {
  const now = new Date().toISOString();
  return {
    projectId,
    decision: "pending",
    note: null,
    decidedAt: null,
    updatedAt: now,
  };
};

export const updatePmReviewDecision = ({
  decision,
  note,
  projectId,
}: {
  projectId: string;
  decision: EquityPmReview["decision"];
  note?: string | null;
}): EquityPmReview => {
  const now = new Date().toISOString();
  return {
    projectId,
    decision,
    note: note?.trim() || null,
    decidedAt: decision === "pending" ? null : now,
    updatedAt: now,
  };
};

const convictionFor = (
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const score =
    6.6 +
    Math.min(content.evidence.length, 8) * 0.1 +
    Math.min(content.riskTriggers.length, 3) * 0.1 +
    (content.forecast.length >= 5 ? 0.1 : 0) +
    (project.recommendation === "hold-neutral" ? -0.3 : 0);
  return Number(clamp(score, 5.5, 8.8).toFixed(1));
};

const killConditionFromTrigger = (trigger: EquityRiskTrigger) =>
  `${trigger.trigger}: ${trigger.threshold}`;

export const buildPmReviewPacket = (
  project: EquityProject | null,
): EquityPmReviewPacket | null => {
  const content = project?.generatedContent;
  if (!project || project.status !== "ready" || !content) return null;

  const killConditions = [
    ...content.invalidationConditions,
    ...content.riskTriggers.map(killConditionFromTrigger),
  ]
    .map((condition) => compact(condition, "Missing kill condition.", 160))
    .slice(0, 3);

  while (killConditions.length < 3) {
    killConditions.push("New evidence contradicts the core thesis.");
  }

  const loadBearingAssumption =
    content.modelAssumptions.find((row) =>
      /growth|margin|revenue|cash|user thesis|driver/i.test(row.label),
    ) ?? content.modelAssumptions[0];

  const closestPeer = content.comps[0];

  return {
    ticker: project.ticker,
    recommendation: formatThesisRecommendation(project.recommendation).replace(
      " / Long",
      "",
    ).replace(" / Neutral", "").replace(" / Short", ""),
    conviction: convictionFor(project, content),
    oneLineThesis: firstSentence(
      content.recommendationSummary,
      project.rationale,
    ),
    timeHorizon: compact(
      content.tradeProposal.timeHorizon,
      "Multi-week to multi-month.",
      120,
    ),
    marketBelieves: compact(
      content.marketMissing,
      "Market is focused on the wrong near-term driver.",
    ),
    weBelieve: compact(
      content.variantPerception,
      project.rationale,
    ),
    whyNow: compact(content.whyNow, content.whatChanged),
    killConditions,
    loadBearingAssumption: loadBearingAssumption
      ? `${loadBearingAssumption.label}: ${loadBearingAssumption.value}`
      : "Base-case revenue and margin path must hold.",
    challengeQuestions: [
      "What assumption is doing the most work?",
      closestPeer
        ? `Why this instead of ${closestPeer.ticker}?`
        : "Why this instead of the closest peer?",
      "What would make us wrong quickly?",
    ],
  };
};

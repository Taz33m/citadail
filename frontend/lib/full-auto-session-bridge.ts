import {
  completeEquityProject,
  createPendingEquityProject,
  formatThesisRecommendation,
} from "@/lib/equity-project";
import { createPendingPmReview } from "@/lib/equity-pm-review";
import { createPendingRiskGate } from "@/lib/equity-risk-gate";
import { getLocalSessionRepository } from "@/lib/session-repository";
import type {
  FullAutoPaperPosition,
  FullAutoRun,
  ThesisRecord,
} from "@/types/full-auto";
import type {
  EquityPaperPosition,
  EquityProjectGeneratedContent,
  ShellSession,
  ThesisDraft,
} from "@/types/session";

const metricBaseFor = (record: ThesisRecord) => {
  const tilted = record.recommendation === "sell-short" ? -1 : 1;
  return {
    revenue: record.ticker === "AAPL" ? 260_200 : 100_000,
    growth: record.recommendation === "hold-neutral" ? 0.03 : 0.055 * tilted,
    grossMargin: record.ticker === "AAPL" ? 0.38 : 0.52,
    operatingMargin: record.recommendation === "sell-short" ? 0.18 : 0.29,
  };
};

export const buildGeneratedContentFromThesisRecord = (
  record: ThesisRecord,
): EquityProjectGeneratedContent => {
  const base = metricBaseFor(record);
  const rec = formatThesisRecommendation(record.recommendation);
  const evidenceText = record.evidence.map((item) => item.value).join(" ");
  const summary = `${rec}. ${record.oneLineThesis}`;
  const assumptions = [
    {
      label: "Source-backed narrative driver",
      value: record.variantView.weBelieve,
      source: "Full Auto replay source pack",
    },
    {
      label: "Revenue Growth",
      value: `${(base.growth * 100).toFixed(1)}% forward path`,
      source: "Full Auto operating bridge",
    },
    {
      label: "Gross Margin",
      value: `${(base.grossMargin * 100).toFixed(1)}% baseline`,
      source: "Full Auto operating bridge",
    },
    {
      label: "Operating Margin",
      value: `${(base.operatingMargin * 100).toFixed(1)}% baseline`,
      source: "Full Auto operating bridge",
    },
  ];

  return {
    companyOverview: `${record.companyName} is reviewed inside the Full Auto replay with sources visible through ${record.simulationTime.slice(0, 10)}.`,
    recommendationSummary: summary,
    whyNow: record.variantView.whyNow,
    whatChanged: evidenceText || record.oneLineThesis,
    marketMissing: record.variantView.marketBelieves,
    variantPerception: record.variantView.weBelieve,
    bullCase: `${record.ticker} compounds if the visible catalyst improves revenue durability and margin quality.`,
    baseCase: `${record.ticker} tracks the sourced operating bridge with measured position sizing.`,
    bearCase: `${record.ticker} fails if the catalyst is transitory or the market already priced it.`,
    catalysts: record.catalysts.length >= 3
      ? record.catalysts.slice(0, 3)
      : [...record.catalysts, "Next earnings update", "Management commentary", "Price confirmation"].slice(0, 3),
    risks: record.risks,
    invalidationConditions: record.invalidationTriggers,
    memoSections: [
      { heading: "What the Company Is", body: `${record.companyName} (${record.ticker}) in ${record.sector}.` },
      { heading: "Recommendation / Bias", body: summary },
      { heading: "Why Now", body: record.variantView.whyNow },
      { heading: "What Changed", body: evidenceText || record.oneLineThesis },
      { heading: "Variant Perception / Edge", body: `${record.variantView.marketBelieves}. We believe ${record.variantView.weBelieve}.` },
      { heading: "Bull / Base / Bear", body: `Bull: catalyst durability. Base: sourced operating bridge. Bear: ${record.invalidationTriggers[0]}.` },
      { heading: "Catalysts", body: record.catalysts.join("\n") },
      { heading: "Risks", body: record.risks.join("\n") },
      { heading: "Invalidation Conditions", body: record.invalidationTriggers.join("\n") },
    ],
    evidence: record.evidence.length >= 3
      ? record.evidence.slice(0, 5).map((item) => ({
          label: item.label,
          value: item.value,
          source: item.sourceId,
          implication: "Visible before the simulation timestamp and used by the agent packet.",
        }))
      : [
          {
            label: "Variant view",
            value: record.variantView.weBelieve,
            source: "Full Auto replay source pack",
            implication: "Defines the market disagreement.",
          },
          {
            label: "Why now",
            value: record.variantView.whyNow,
            source: "Full Auto replay source pack",
            implication: "Defines the catalyst.",
          },
          {
            label: "Kill condition",
            value: record.invalidationTriggers[0],
            source: "Full Auto replay source pack",
            implication: "Defines falsification.",
          },
        ],
    modelAssumptions: assumptions,
    forecast: [0, 1, 2, 3].map((year) => ({
      year: `FY${2020 + year}`,
      revenue: Math.round(base.revenue * (1 + base.growth) ** year),
      revenueGrowth: base.growth,
      grossMargin: base.grossMargin + year * 0.002,
      operatingMargin: base.operatingMargin + year * 0.003,
      freeCashFlowMargin: base.operatingMargin - 0.04 + year * 0.002,
    })),
    valuation: [
      { metric: "Base value", value: "$220/sh", source: "Full Auto model bridge" },
      { metric: "Bull value", value: "$265/sh", source: "Full Auto model bridge" },
      { metric: "Bear value", value: "$165/sh", source: "Full Auto model bridge" },
    ],
    sensitivity: [
      { case: "Bull", revenueGrowth: base.growth + 0.02, operatingMargin: base.operatingMargin + 0.025, impliedValue: 265 },
      { case: "Base", revenueGrowth: base.growth, operatingMargin: base.operatingMargin, impliedValue: 220 },
      { case: "Bear", revenueGrowth: base.growth - 0.025, operatingMargin: base.operatingMargin - 0.03, impliedValue: 165 },
    ],
    comps: [
      { ticker: "MSFT", company: "Microsoft", evRevenue: 12.2, evEbitda: 24.5, pe: 31.1, rationale: "Quality-growth anchor." },
      { ticker: "GOOGL", company: "Alphabet", evRevenue: 5.9, evEbitda: 15.2, pe: 21.4, rationale: "Platform peer." },
      { ticker: "META", company: "Meta Platforms", evRevenue: 7.4, evEbitda: 14.1, pe: 22.6, rationale: "High-margin internet peer." },
    ],
    riskTriggers: record.invalidationTriggers.map((trigger) => ({
      trigger,
      threshold: "Trigger appears in a visible replay source or price drawdown exceeds guardrail.",
      action: "Re-check thesis and reduce or exit paper position if confirmed.",
    })),
    validation: record.validation,
    tradeProposal: {
      bias: rec,
      entryZone: "Use replay price at Risk approval.",
      positionSize: "Starter size within Full Auto risk limit.",
      timeHorizon: "Medium horizon; replay compresses lifecycle.",
      addTrimExit: "Hold while intact; revisit on weakened thesis; exit if broken.",
    },
    deckSlides: [
      { title: `${record.ticker} Recommendation`, bullets: [summary, `Conviction ${record.conviction.toFixed(1)}/10`], speakerNotes: "Title recommendation." },
      { title: "Thesis Summary", bullets: [record.oneLineThesis, record.variantView.whyNow], speakerNotes: "Core thesis." },
      { title: "Variant Perception", bullets: [record.variantView.marketBelieves, record.variantView.weBelieve], speakerNotes: "Market disagreement." },
      { title: "Model Read-through", bullets: assumptions.slice(1).map((item) => `${item.label}: ${item.value}`), speakerNotes: "Operating bridge." },
      { title: "Risks / Falsification", bullets: record.invalidationTriggers.slice(0, 3), speakerNotes: "Kill conditions." },
      { title: "Trade Plan", bullets: ["Paper-only execution", "Risk-gated starter size", "Monitor on visible event updates"], speakerNotes: "Desk plan." },
    ],
  };
};

export const createEquityProjectFromThesisRecord = (record: ThesisRecord) => {
  const draft: ThesisDraft = {
    ticker: record.ticker,
    recommendation: record.recommendation,
    rationale: record.oneLineThesis,
    submittedAt: record.simulationTime,
  };
  const pending = createPendingEquityProject(draft);
  return completeEquityProject({
    project: pending,
    content: buildGeneratedContentFromThesisRecord(record),
  });
};

const mapPaperPosition = (
  projectId: string,
  position: FullAutoPaperPosition | null,
): EquityPaperPosition | null => {
  if (!position) return null;
  return {
    id: position.id,
    projectId,
    ticker: position.ticker,
    side: position.side,
    entryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    size: position.size,
    status: position.status,
    openedAt: position.openedAt,
    closedAt: position.closedAt,
    rationale: position.rationale,
    thesisStatus: position.thesisStatus,
    nextCatalyst: "Next visible replay event",
    nextAction: position.nextAction,
    history: [
      {
        id: `${position.id}-open`,
        type: "open",
        timestamp: position.openedAt,
        price: position.entryPrice,
        sizeDelta: position.size,
        note: "Opened by Full Auto historical replay.",
      },
    ],
  };
};

export const openThesisRecordInSession = ({
  record,
  run,
}: {
  record: ThesisRecord;
  run: FullAutoRun;
}) => {
  const repository = getLocalSessionRepository();
  const project = createEquityProjectFromThesisRecord(record);
  const session = repository.create(`${record.ticker} Full Auto`);
  const pmReview = createPendingPmReview(project.id);
  const riskGate = createPendingRiskGate(project.id);
  const position =
    run.paperPositions.find((item) => item.id === record.paperPositionId) ??
    null;
  const nextSession: ShellSession = {
    ...session,
    title: `${record.ticker} Full Auto`,
    updatedAt: new Date(),
    snapshot: {
      ...session.snapshot,
      activeTab: position ? "trade-desk" : "project:memo_docx",
      selectedTicker: record.ticker,
      thesisDraft: {
        ticker: record.ticker,
        recommendation: record.recommendation,
        rationale: record.oneLineThesis,
        submittedAt: record.simulationTime,
      },
      equityProject: project,
      pmReview: {
        ...pmReview,
        decision: record.pmDecision === "approved" ? "approved_to_risk" : "pending",
        note: `Imported from Full Auto run ${run.id}.`,
        decidedAt: record.pmDecision === "approved" ? record.simulationTime : null,
      },
      riskGate: {
        ...riskGate,
        decision:
          record.riskDecision === "approved"
            ? "approved_to_desk"
            : record.riskDecision === "reduced"
              ? "reduce_size"
              : record.riskDecision === "monitor_first"
                ? "monitor_first"
                : "pending",
        note: `Imported from Full Auto run ${run.id}.`,
        decidedAt:
          record.riskDecision === "pending" ? null : record.simulationTime,
      },
      paperPosition: mapPaperPosition(project.id, position),
    },
  };
  repository.upsert(nextSession);
  return nextSession.id;
};

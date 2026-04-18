import { buildRiskGatePacket } from "@/lib/equity-risk-gate";
import type {
  EquityPaperPosition,
  EquityPaperPositionSide,
  EquityPmReview,
  EquityProject,
  EquityRiskGate,
  EquityThesisStatus,
} from "@/types/session";

export interface EquityTradeDeskTicket {
  ticker: string;
  side: EquityPaperPositionSide;
  entryPrice: number;
  currentPrice: number;
  size: number;
  thesisStatus: EquityThesisStatus;
  suggestedAction: string;
  rationale: string;
  mustBeTrue: string;
  breaksTrade: string;
  nextCatalyst: string;
  triggers: string[];
}

const compact = (value: string, fallback: string, maxLength = 220) => {
  const cleaned = value.replace(/\s+/g, " ").trim() || fallback;
  return cleaned.length > maxLength
    ? `${cleaned.slice(0, maxLength - 1).trim()}...`
    : cleaned;
};

const money = (value: number) => Number(value.toFixed(2));

const basePriceFor = (project: EquityProject) => {
  const content = project.generatedContent;
  const baseSensitivity = content?.sensitivity.find((row) =>
    /base/i.test(row.case),
  );
  if (baseSensitivity?.impliedValue) return money(baseSensitivity.impliedValue);
  const baseValuation = content?.valuation.find((row) => /base/i.test(row.metric));
  const parsed = baseValuation?.value.match(/(\d+(?:\.\d+)?)/)?.[1];
  if (parsed) return money(Number(parsed));
  return 100;
};

const sideFor = (project: EquityProject): EquityPaperPositionSide =>
  project.recommendation === "sell-short" ? "short" : "long";

const tradeSizeFor = (
  riskGate: EquityRiskGate | null,
  fallbackSize: string | undefined,
) => {
  const source = `${riskGate?.note ?? ""} ${fallbackSize ?? ""}`;
  const percent = source.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
  if (percent) return Math.max(25_000, Number(percent) * 50_000);
  return 100_000;
};

export const buildTradeDeskTicket = (
  project: EquityProject | null,
  pmReview: EquityPmReview | null,
  riskGate: EquityRiskGate | null,
): EquityTradeDeskTicket | null => {
  const content = project?.generatedContent;
  if (
    !project ||
    project.status !== "ready" ||
    !content ||
    pmReview?.decision !== "approved_to_risk" ||
    riskGate?.decision !== "approved_to_desk"
  ) {
    return null;
  }

  const riskPacket = buildRiskGatePacket(project, pmReview);
  const entryPrice = basePriceFor(project);
  const side = sideFor(project);
  const loadBearingAssumption =
    content.modelAssumptions.find((row) =>
      /growth|margin|revenue|cash|driver|user thesis/i.test(row.label),
    ) ?? content.modelAssumptions[0];
  const breaksTrade =
    content.invalidationConditions[0] ??
    content.riskTriggers[0]?.threshold ??
    "Core thesis evidence breaks.";

  return {
    ticker: project.ticker,
    side,
    entryPrice,
    currentPrice: entryPrice,
    size: tradeSizeFor(riskGate, content.tradeProposal.positionSize),
    thesisStatus: "active",
    suggestedAction: riskPacket?.suggestedAction ?? "Open Paper Trade",
    rationale: compact(content.recommendationSummary, project.rationale, 260),
    mustBeTrue: loadBearingAssumption
      ? compact(`${loadBearingAssumption.label}: ${loadBearingAssumption.value}`, project.rationale)
      : compact(project.rationale, "Base thesis must hold."),
    breaksTrade: compact(breaksTrade, "Kill condition not specified."),
    nextCatalyst: compact(
      content.catalysts[0] ?? "Next earnings / guidance update.",
      "Next earnings / guidance update.",
      120,
    ),
    triggers: [
      ...content.invalidationConditions,
      ...content.riskTriggers.map(
        (trigger) => `${trigger.trigger}: ${trigger.threshold}`,
      ),
    ]
      .slice(0, 4)
      .map((trigger) => compact(trigger, "Trigger not specified.", 150)),
  };
};

const createTradeEvent = (
  type: EquityPaperPosition["history"][number]["type"],
  price: number,
  sizeDelta: number,
  note: string,
) => ({
  id: `trade-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  timestamp: new Date().toISOString(),
  price: money(price),
  sizeDelta: Math.round(sizeDelta),
  note,
});

export const openPaperPosition = (
  ticket: EquityTradeDeskTicket,
  projectId: string,
): EquityPaperPosition => {
  const now = new Date().toISOString();
  return {
    id: `paper-position-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    ticker: ticket.ticker,
    side: ticket.side,
    entryPrice: ticket.entryPrice,
    currentPrice: ticket.currentPrice,
    size: Math.round(ticket.size),
    status: "open",
    openedAt: now,
    closedAt: null,
    rationale: ticket.rationale,
    thesisStatus: ticket.thesisStatus,
    nextCatalyst: ticket.nextCatalyst,
    nextAction: "Hold",
    history: [
      createTradeEvent(
        "open",
        ticket.entryPrice,
        ticket.size,
        "Opened thesis-linked paper trade.",
      ),
    ],
  };
};

export const positionPnl = (position: EquityPaperPosition) => {
  const direction = position.side === "long" ? 1 : -1;
  const returnPct =
    ((position.currentPrice - position.entryPrice) / position.entryPrice) *
    direction;
  return {
    pnl: Math.round(position.size * returnPct),
    returnPct,
  };
};

export const updatePaperPosition = (
  position: EquityPaperPosition,
  action: "add" | "trim" | "exit" | "recheck",
): EquityPaperPosition => {
  const now = new Date().toISOString();
  const direction = position.side === "long" ? 1 : -1;
  const markMove = action === "recheck" ? 0.012 * direction : 0;
  const currentPrice = money(position.currentPrice * (1 + markMove));

  if (action === "exit") {
    return {
      ...position,
      currentPrice,
      status: "closed",
      closedAt: now,
      nextAction: "Exit",
      history: [
        ...position.history,
        createTradeEvent("exit", currentPrice, -position.size, "Closed paper trade."),
      ],
    };
  }

  if (action === "add") {
    const sizeDelta = Math.round(position.size * 0.25);
    return {
      ...position,
      currentPrice,
      size: position.size + sizeDelta,
      nextAction: "Hold",
      history: [
        ...position.history,
        createTradeEvent("add", currentPrice, sizeDelta, "Added 25% to paper notional."),
      ],
    };
  }

  if (action === "trim") {
    const sizeDelta = -Math.round(position.size * 0.25);
    return {
      ...position,
      currentPrice,
      size: Math.max(0, position.size + sizeDelta),
      nextAction: "Hold",
      history: [
        ...position.history,
        createTradeEvent("trim", currentPrice, sizeDelta, "Trimmed 25% of paper notional."),
      ],
    };
  }

  return {
    ...position,
    currentPrice,
    thesisStatus: "active",
    nextAction: "Hold",
    history: [
      ...position.history,
      createTradeEvent(
        "recheck",
        currentPrice,
        0,
        "Re-checked thesis against current trigger set.",
      ),
    ],
  };
};

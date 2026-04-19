import { runAgent } from "@/lib/full-auto-agent-runtime";
import {
  FULL_AUTO_DEFAULT_UNIVERSE,
  addSimulationDay,
  companyForTicker,
  getLatestPriceSnapshotAt,
  getNextKnownEventDate,
  getNextPortfolioMarkDate,
  getVisibleSources,
} from "@/lib/full-auto-historical-data";
import type {
  FullAutoAgentEvent,
  FullAutoCandidate,
  FullAutoJournalEntry,
  FullAutoPaperTradeAction,
  FullAutoPaperPosition,
  FullAutoPortfolio,
  FullAutoRun,
  FullAutoStepCommand,
  FullAutoThesisRegistry,
  HistoricalSource,
  ThesisRecord,
} from "@/types/full-auto";
import type {
  EquityPriorWindowValidation,
  ThesisRecommendation,
} from "@/types/session";

export const FULL_AUTO_START_DATE = "2022-01-01T14:30:00.000Z";
export const FULL_AUTO_END_DATE = "2026-04-18T20:00:00.000Z";
const STARTING_CAPITAL = 1_000_000;
export const VALIDATION_LOOKBACK_DAYS = 504;
const VALIDATION_FORWARD_DAYS = 28;
const VALIDATION_MIN_OBSERVATIONS = 3;

const getReplayEndDate = () => {
  const configuredEnd = new Date(FULL_AUTO_END_DATE).getTime();
  const now = Date.now();
  return new Date(Math.min(configuredEnd, now)).toISOString();
};

const clampToReplayEnd = (value: string, run: FullAutoRun) => {
  const requested = new Date(value).getTime();
  const configuredEnd = new Date(run.endDate).getTime();
  const hardEnd = Math.min(configuredEnd, Date.now());
  if (!Number.isFinite(requested)) return new Date(hardEnd).toISOString();
  return new Date(Math.min(requested, hardEnd)).toISOString();
};

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const localizeReplayCopy = (value: string) =>
  value
    .replace(/Replay mark:\s*/gi, "")
    .replace(/\breplay mark\b/gi, "visible mark")
    .replace(/\breplay tape\b/gi, "visible tape")
    .replace(
      /present-day placeholder snapshot.*?live market data.*?claimed\./gi,
      "",
    );

const clean = (value: string, max = 180) => {
  const normalized = localizeReplayCopy(value).replace(/\s+/g, " ").trim();
  return normalized.length > max
    ? `${normalized.slice(0, max - 1).trim()}...`
    : normalized;
};

const toMs = (value: string) => new Date(value).getTime();

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

const unique = <T,>(values: T[]) => [...new Set(values)];

const recommendationForTicker: Record<string, ThesisRecommendation> = {
  AAPL: "buy-long",
  MSFT: "buy-long",
  NVDA: "buy-long",
  TSLA: "sell-short",
  AMD: "buy-long",
  NFLX: "hold-neutral",
  META: "buy-long",
  GOOGL: "buy-long",
  AMZN: "buy-long",
  AVGO: "buy-long",
  ORCL: "buy-long",
  CRM: "buy-long",
  ADBE: "buy-long",
  NOW: "buy-long",
  INTU: "buy-long",
  QCOM: "buy-long",
  TXN: "buy-long",
  AMAT: "buy-long",
  LRCX: "buy-long",
  JPM: "buy-long",
  V: "buy-long",
  MA: "buy-long",
  COST: "buy-long",
  WMT: "buy-long",
  HD: "buy-long",
  UNH: "buy-long",
  LLY: "buy-long",
  MRK: "buy-long",
  XOM: "buy-long",
  CVX: "buy-long",
};

const convictionForTicker: Record<string, number> = {
  AAPL: 7.8,
  MSFT: 7.5,
  NVDA: 8.1,
  TSLA: 6.9,
  AMD: 7.2,
  NFLX: 6.4,
  META: 7.1,
  GOOGL: 7.4,
  AMZN: 7.2,
  AVGO: 8.0,
  ORCL: 7.0,
  CRM: 7.1,
  ADBE: 7.0,
  NOW: 7.4,
  INTU: 7.3,
  QCOM: 7.0,
  TXN: 6.9,
  AMAT: 7.2,
  LRCX: 7.3,
  JPM: 6.9,
  V: 7.2,
  MA: 7.2,
  COST: 7.1,
  WMT: 6.8,
  HD: 6.9,
  UNH: 7.0,
  LLY: 8.0,
  MRK: 6.8,
  XOM: 6.9,
  CVX: 6.8,
};

const SHORT_MAX_POSITION_PCT = 3;
const SHORT_MIN_CONVICTION = 8;

const targetGrossPctFor = (run: FullAutoRun) =>
  run.riskLimits.targetGrossExposurePct ??
  Math.min(70, run.riskLimits.maxGrossExposurePct);

const buildInitialPortfolio = (): FullAutoPortfolio => ({
  startingCapital: STARTING_CAPITAL,
  cash: STARTING_CAPITAL,
  netLiquidationValue: STARTING_CAPITAL,
  grossExposure: 0,
  grossExposurePct: 0,
  realizedPnl: 0,
  unrealizedPnl: 0,
  openPositionCount: 0,
  closedPositionCount: 0,
  equityCurve: [
    {
      date: FULL_AUTO_START_DATE,
      label: "Jan 1, 2022",
      value: STARTING_CAPITAL,
      cash: STARTING_CAPITAL,
      grossExposure: 0,
      netExposure: 0,
      openPositions: 0,
      closedPositions: 0,
    },
  ],
});

const buildThesisRegistry = (
  records: ThesisRecord[],
): FullAutoThesisRegistry => ({
  active: records
    .filter((record) => record.monitoringState === "active")
    .map((record) => record.id),
  shelved: records
    .filter((record) => record.monitoringState === "not_started")
    .map((record) => record.id),
  broken: records
    .filter((record) => record.monitoringState === "broken")
    .map((record) => record.id),
  closed: records
    .filter((record) => record.paperPositionId && record.monitoringState !== "active")
    .map((record) => record.id),
});

const formatCurveLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export const recalcPortfolio = ({
  previousPortfolio,
  positions,
  simulationTime,
}: {
  previousPortfolio: FullAutoPortfolio;
  positions: FullAutoPaperPosition[];
  simulationTime: string;
}): FullAutoPortfolio => {
  const open = positions.filter((position) => position.status === "open");
  const closed = positions.filter((position) => position.status === "closed");
  const grossExposure = open.reduce((total, position) => total + position.size, 0);
  const netExposure = open.reduce(
    (total, position) =>
      total + (position.side === "long" ? position.size : -position.size),
    0,
  );
  const unrealizedPnl = open.reduce((total, position) => total + position.pnl, 0);
  const realizedPnl = closed.reduce((total, position) => total + position.pnl, 0);
  const netLiquidationValue =
    previousPortfolio.startingCapital + realizedPnl + unrealizedPnl;
  const grossExposurePct = netLiquidationValue
    ? (grossExposure / netLiquidationValue) * 100
    : 0;
  const cash = Math.max(0, netLiquidationValue - grossExposure);
  const latestPoint = previousPortfolio.equityCurve.at(-1);
  const nextPoint = {
    date: simulationTime,
    label: formatCurveLabel(simulationTime),
    value: Math.round(netLiquidationValue),
    cash: Math.round(cash),
    grossExposure: Math.round(grossExposure),
    netExposure: Math.round(netExposure),
    openPositions: open.length,
    closedPositions: closed.length,
  };
  const equityCurve =
    latestPoint?.date === simulationTime
      ? [...previousPortfolio.equityCurve.slice(0, -1), nextPoint]
      : [...previousPortfolio.equityCurve, nextPoint].slice(-32);

  return {
    ...previousPortfolio,
    cash,
    netLiquidationValue,
    grossExposure,
    grossExposurePct,
    realizedPnl,
    unrealizedPnl,
    openPositionCount: open.length,
    closedPositionCount: closed.length,
    equityCurve,
  };
};

export const createFullAutoRun = (): FullAutoRun => {
  const now = new Date().toISOString();
  return {
    id: uid("full-auto-run"),
    status: "idle",
    createdAt: now,
    updatedAt: now,
    startDate: FULL_AUTO_START_DATE,
    endDate: getReplayEndDate(),
    simulationTime: FULL_AUTO_START_DATE,
    universe: [...FULL_AUTO_DEFAULT_UNIVERSE],
    strategyProfile: "Medium-horizon quality/event replay",
    riskLimits: {
      maxPositionPct: 10,
      targetGrossExposurePct: 70,
      maxGrossExposurePct: 85,
      maxOpenPositions: 10,
      cooldownDays: 14,
    },
    portfolio: buildInitialPortfolio(),
    thesisRegistry: buildThesisRegistry([]),
    currentBrief: null,
    candidateQueue: [],
    agentEvents: [],
    thesisRecords: [],
    paperPositions: [],
    journal: [],
    error: null,
    openedSessionIds: {},
  };
};

const journal = ({
  body,
  relatedThesisRecordId,
  relatedTicker,
  simulationTime,
  sourceIds,
  title,
}: {
  title: string;
  body: string;
  simulationTime: string;
  relatedTicker?: string;
  relatedThesisRecordId?: string;
  sourceIds: string[];
}): FullAutoJournalEntry => ({
  id: uid("journal"),
  timestamp: new Date().toISOString(),
  simulationTime,
  title,
  body,
  ...(relatedTicker ? { relatedTicker } : {}),
  ...(relatedThesisRecordId ? { relatedThesisRecordId } : {}),
  visibleSourceIds: sourceIds,
});

const latestByTicker = (sources: HistoricalSource[]) => {
  const map = new Map<string, HistoricalSource>();
  for (const source of sources) {
    if (source.ticker === "SPY") continue;
    const existing = map.get(source.ticker);
    if (!existing || existing.knownAt < source.knownAt) {
      map.set(source.ticker, source);
    }
  }
  return map;
};

const buildBrief = (simulationTime: string, sources: HistoricalSource[]) => {
  const recent = sources
    .filter((source) => source.ticker !== "SPY")
    .sort((left, right) => right.knownAt.localeCompare(left.knownAt));
  const lead = recent[0];
  const macro = sources.find((source) => source.ticker === "SPY");
  const defensive =
    macro?.text.toLowerCase().includes("drawdown") ||
    recent.some((source) => /pressure|uncertainty|warning|shock/i.test(source.text));
  return {
    headline: lead
      ? `${lead.ticker}: ${lead.title}`
      : "Replay tape waiting for new visible catalysts",
    summary: lead
      ? clean(lead.text, 220)
      : "No new company-specific source is visible at this simulation time.",
    sourceCount: sources.length,
    tone: defensive ? ("defensive" as const) : ("mixed" as const),
    simulationTime,
  };
};

const buildCandidates = (
  run: FullAutoRun,
  simulationTime: string,
  visibleSources: HistoricalSource[],
  limit: number,
): FullAutoCandidate[] => {
  const existing = new Set(run.thesisRecords.map((record) => record.ticker));
  const latest = [...latestByTicker(visibleSources).values()]
    .filter((source) => !existing.has(source.ticker))
    .map((source) => {
      const text = `${source.title} ${source.text}`.toLowerCase();
      const score =
        4 +
        (source.sourceType === "fundamentals" ? 3 : 0) +
        (source.sourceType === "filing" ? 2 : 0) +
        (/growth|margin|profit|cloud|data center|services|silicon/.test(text)
          ? 2
          : 0) +
        (/pressure|warning|uncertainty|shock/.test(text) ? 1 : 0);
      return { source, score };
    })
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;
      if (scoreDelta) return scoreDelta;
      return right.source.knownAt.localeCompare(left.source.knownAt);
    });

  const picks: FullAutoCandidate[] = [];
  for (const pick of latest) {
    if (picks.length >= limit) break;
    const company = companyForTicker(pick.source.ticker);
    existing.add(company.ticker);
    picks.push({
      id: uid("candidate"),
      ticker: company.ticker,
      companyName: company.companyName,
      sector: company.sector,
      score: pick.score,
      reason: clean(pick.source.text, 150),
      eventTag: pick.source.sourceType,
      status: "queued",
      simulationTime,
      visibleSourceIds: visibleSources
        .filter((source) => source.ticker === company.ticker || source.ticker === "SPY")
        .map((source) => source.sourceId),
    });
  }

  return picks;
};

export const createThesisRecordFromAgentOutputs = ({
  candidate,
  simulationTime,
  visibleSources,
}: {
  candidate: FullAutoCandidate;
  simulationTime: string;
  visibleSources: HistoricalSource[];
}): ThesisRecord => {
  const tickerSources = visibleSources.filter(
    (source) => source.ticker === candidate.ticker,
  );
  const lead = tickerSources.at(-1) ?? visibleSources.at(-1);
  const recommendation =
    recommendationForTicker[candidate.ticker] ?? "hold-neutral";
  const conviction = convictionForTicker[candidate.ticker] ?? 6.8;
  const marketBelieves =
    recommendation === "sell-short"
      ? "the market is underwriting too much execution recovery"
      : "near-term disruption matters more than durable business quality";
  const weBelieve =
    recommendation === "sell-short"
      ? "valuation and execution risk outweigh the visible catalyst"
      : "the visible catalyst improves the durability of revenue, margin, or cash-flow expectations";

  return {
    id: uid("thesis-record"),
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    sector: candidate.sector,
    simulationTime,
    recommendation,
    conviction,
    oneLineThesis: `${candidate.ticker} ${recommendation.replace("-", " ")}: ${clean(
      lead?.text ?? candidate.reason,
      135,
    )}`,
    variantView: {
      marketBelieves,
      weBelieve,
      whyNow: clean(lead?.title ?? candidate.reason, 150),
    },
    evidence: tickerSources.slice(-4).map((source) => ({
      label: source.title,
      value: clean(source.text, 180),
      sourceId: source.sourceId,
    })),
    assumptions: [
      "Visible source pack is complete only through the current simulation timestamp.",
      "Position sizing uses paper notional and current replay price.",
      "No source after simulation time is available to the agents.",
    ],
    catalysts: tickerSources.slice(-3).map((source) => source.title),
    risks: [
      "Catalyst proves transitory rather than durable.",
      "Margin path fails to follow the narrative evidence.",
      "Macro regime forces position size reduction.",
    ],
    invalidationTriggers: [
      "New filing or earnings update contradicts the core driver.",
      "Visible price drawdown exceeds 12% before confirming evidence appears.",
      "Risk source changes thesis status to weakened or broken.",
    ],
    pmDecision: "pending",
    validation: null,
    riskDecision: "pending",
    paperPositionId: null,
    monitoringState: "not_started",
    sourceIds: tickerSources.map((source) => source.sourceId),
  };
};

export const runPriorWindowValidation = ({
  simulationTime,
  thesis,
  visibleSources,
}: {
  thesis: ThesisRecord;
  simulationTime: string;
  visibleSources: HistoricalSource[];
}): EquityPriorWindowValidation => {
  const simulationMs = toMs(simulationTime);
  const lookbackStartMs =
    simulationMs - VALIDATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const horizonMs = VALIDATION_FORWARD_DAYS * 24 * 60 * 60 * 1000;
  const side = thesis.recommendation === "sell-short" ? -1 : 1;
  const allowedTickers = new Set([thesis.ticker, "SPY"]);
  const priceSources = visibleSources
    .filter(
      (source) =>
        allowedTickers.has(source.ticker) &&
        typeof source.price === "number" &&
        toMs(source.knownAt) <= simulationMs &&
        toMs(source.knownAt) >= lookbackStartMs,
    )
    .sort((left, right) => left.knownAt.localeCompare(right.knownAt));
  const tickerPrices = priceSources.filter(
    (source) => source.ticker === thesis.ticker,
  );
  const observations = tickerPrices.flatMap((entry, index) => {
    const entryMs = toMs(entry.knownAt);
    const later = tickerPrices
      .slice(index + 1)
      .filter((source) => toMs(source.knownAt) > entryMs)
      .sort(
        (left, right) =>
          Math.abs(toMs(left.knownAt) - (entryMs + horizonMs)) -
          Math.abs(toMs(right.knownAt) - (entryMs + horizonMs)),
      )[0];
    if (!later || !entry.price || !later.price) return [];
    const rawReturn = (later.price - entry.price) / entry.price;
    return [
      {
        sourceIds: [entry.sourceId, later.sourceId],
        signedReturn: rawReturn * side,
      },
    ];
  });
  const sourceIds = unique([
    ...priceSources.map((source) => source.sourceId),
    ...observations.flatMap((item) => item.sourceIds),
  ]);

  if (observations.length < VALIDATION_MIN_OBSERVATIONS) {
    return {
      status: "insufficient",
      lookbackDays: VALIDATION_LOOKBACK_DAYS,
      observationCount: observations.length,
      medianForwardReturn: null,
      winRate: null,
      maxDrawdown: null,
      verdict: `Only ${observations.length} prior setup mark${observations.length === 1 ? "" : "s"} visible before ${simulationTime.slice(0, 10)}; validation is non-blocking for longs and conservative for shorts.`,
      sourceIds,
    };
  }

  const returns = observations.map((item) => item.signedReturn);
  const medianForwardReturn = median(returns) ?? 0;
  const winRate =
    returns.filter((value) => value > 0).length / Math.max(returns.length, 1);
  const maxDrawdown = Math.min(...returns, 0);
  const status =
    medianForwardReturn >= 0.035 && winRate >= 0.55 && maxDrawdown > -0.12
      ? "supportive"
      : medianForwardReturn >= 0 && winRate >= 0.45 && maxDrawdown > -0.2
        ? "mixed"
        : "weak";
  const verdict =
    status === "supportive"
      ? "Prior visible marks support the setup; Risk Gate can size normally."
      : status === "mixed"
        ? "Prior visible marks are usable but not decisive; Risk Gate should stay disciplined."
        : "Prior visible marks do not support the setup; Risk Gate should reduce or block.";

  return {
    status,
    lookbackDays: VALIDATION_LOOKBACK_DAYS,
    observationCount: observations.length,
    medianForwardReturn,
    winRate,
    maxDrawdown,
    verdict,
    sourceIds,
  };
};

const sideForRecommendation = (recommendation: ThesisRecommendation) => {
  if (recommendation === "sell-short") return "short";
  if (recommendation === "buy-long") return "long";
  return null;
};

export const riskDecisionForThesis = (
  thesis: ThesisRecord,
): ThesisRecord["riskDecision"] => {
  if (thesis.pmDecision !== "approved") return "monitor_first";
  if (thesis.recommendation === "hold-neutral") return "monitor_first";
  const validationStatus = thesis.validation?.status ?? "insufficient";
  if (thesis.recommendation === "sell-short") {
    if (thesis.conviction < SHORT_MIN_CONVICTION) return "monitor_first";
    if (validationStatus === "supportive") return "approved";
    if (validationStatus === "mixed" && thesis.conviction >= 8.5) {
      return "reduced";
    }
    return "monitor_first";
  }
  if (validationStatus === "weak") {
    return thesis.conviction >= 7.6 ? "reduced" : "monitor_first";
  }
  return "approved";
};

const createTradeAction = ({
  note,
  price,
  simulationTime,
  sizeDelta,
  type,
}: {
  type: FullAutoPaperTradeAction["type"];
  simulationTime: string;
  price: number;
  sizeDelta: number;
  note: string;
}): FullAutoPaperTradeAction => ({
  id: uid("trade-action"),
  type,
  timestamp: new Date().toISOString(),
  simulationTime,
  price,
  sizeDelta: Math.round(sizeDelta),
  note,
});

export const createPaperPositionFromRiskDecision = (
  record: ThesisRecord,
  run: FullAutoRun,
): FullAutoPaperPosition | null => {
  if (
    record.pmDecision !== "approved" ||
    !record.validation ||
    !["approved", "reduced"].includes(record.riskDecision)
  ) {
    return null;
  }
  if (run.paperPositions.filter((position) => position.status === "open").length >= run.riskLimits.maxOpenPositions) {
    return null;
  }
  const entrySnapshot = getLatestPriceSnapshotAt(record.ticker, record.simulationTime);
  const entryPrice = entrySnapshot?.price;
  if (!entryPrice || !entrySnapshot) return null;
  const side = sideForRecommendation(record.recommendation);
  if (!side) return null;
  const portfolio = run.portfolio ?? buildInitialPortfolio();
  const positionPct =
    side === "short"
      ? Math.min(SHORT_MAX_POSITION_PCT, run.riskLimits.maxPositionPct)
      : run.riskLimits.maxPositionPct;
  const validationMultiplier =
    record.riskDecision === "reduced"
      ? 0.5
      : record.validation?.status === "insufficient"
        ? 0.75
        : 1;
  const maxPositionSize = portfolio.netLiquidationValue * (positionPct / 100);
  const targetGrossSize =
    portfolio.netLiquidationValue * (targetGrossPctFor(run) / 100);
  const maxGrossSize =
    portfolio.netLiquidationValue * (run.riskLimits.maxGrossExposurePct / 100);
  const availableGross = Math.max(
    0,
    Math.min(targetGrossSize, maxGrossSize) - portfolio.grossExposure,
  );
  const size = Math.round(
    Math.min(maxPositionSize * validationMultiplier, availableGross),
  );
  if (size < 5_000) return null;
  const nextGrossExposure = portfolio.grossExposure + size;
  if (
    portfolio.netLiquidationValue &&
    (nextGrossExposure / portfolio.netLiquidationValue) * 100 >
      run.riskLimits.maxGrossExposurePct
  ) {
    return null;
  }
  return {
    id: uid("full-auto-position"),
    thesisRecordId: record.id,
    ticker: record.ticker,
    side,
    status: "open",
    entryPrice,
    currentPrice: entryPrice,
    lastPriceKnownAt: entrySnapshot.knownAt,
    size,
    initialSize: size,
    pnl: 0,
    returnPct: 0,
    openedAt: record.simulationTime,
    closedAt: null,
    thesisStatus: "active",
    nextAction: "Hold",
    rationale: record.oneLineThesis,
    visibleSourceIds: record.sourceIds,
    history: [
      createTradeAction({
        type: "open",
        simulationTime: record.simulationTime,
        price: entryPrice,
        sizeDelta: size,
        note: "Opened thesis-linked paper position.",
      }),
    ],
  };
};

const daysBetween = (from: string, to: string) =>
  Math.max(
    0,
    (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000),
  );

const manageOpenPositions = (
  run: FullAutoRun,
  simulationTime: string,
  visibleSources: HistoricalSource[],
): {
  positions: FullAutoPaperPosition[];
  journalEntries: FullAutoJournalEntry[];
} => {
  const journalEntries: FullAutoJournalEntry[] = [];
  const startingPortfolio = run.portfolio ?? buildInitialPortfolio();
  const openExposureBefore = run.paperPositions
    .filter((position) => position.status === "open")
    .reduce((total, position) => total + position.size, 0);

  let exposureDelta = 0;
  const positions = run.paperPositions.map((position) => {
    if (position.status !== "open") return position;
    const currentSnapshot = getLatestPriceSnapshotAt(position.ticker, simulationTime);
    const currentPrice = currentSnapshot?.price ?? position.currentPrice;
    const direction = position.side === "long" ? 1 : -1;
    const returnPct = ((currentPrice - position.entryPrice) / position.entryPrice) * direction;
    const tickerSources = visibleSources.filter(
      (source) =>
        source.ticker === position.ticker &&
        source.knownAt > position.openedAt,
    );
    const positionHistory = position.history ?? [];
    const initialSize = position.initialSize || position.size;
    const riskText = tickerSources.map((source) => source.text).join(" ").toLowerCase();
    const holdingDays = daysBetween(position.openedAt, simulationTime);
    const sourceIds = [
      ...new Set([
        ...position.visibleSourceIds,
        ...tickerSources.map((source) => source.sourceId),
      ]),
    ];
    const broken =
      returnPct < (position.side === "short" ? -0.08 : -0.22) ||
      /breaks|broke|\bbreak\b|subscriber reset|margin pressure|risk-driven re-think/.test(riskText) ||
      (position.side === "short" && /challenged the short thesis|short thesis challenged/.test(riskText));
    const weakened =
      broken ||
      returnPct < (position.side === "short" ? -0.04 : -0.12) ||
      /warning|pressure|uncertainty|deceleration|shock/.test(riskText);
    const basePosition = {
      ...position,
      currentPrice,
      lastPriceKnownAt: currentSnapshot?.knownAt ?? position.lastPriceKnownAt,
      initialSize,
      returnPct,
      pnl: Math.round(position.size * returnPct),
      thesisStatus: broken
        ? ("broken" as const)
        : weakened
          ? ("weakened" as const)
          : position.thesisStatus,
      nextAction: broken
        ? ("Exit" as const)
        : weakened
          ? ("Revisit" as const)
          : position.nextAction,
      visibleSourceIds: sourceIds,
      history: positionHistory,
    };

    if (broken) {
      exposureDelta -= position.size;
      const closed = {
        ...basePosition,
        status: "closed" as const,
        closedAt: simulationTime,
        nextAction: "Exit" as const,
        history: [
          ...positionHistory,
          createTradeAction({
            type: "exit",
            simulationTime,
            price: currentPrice,
            sizeDelta: -position.size,
            note: "Exited after thesis break or drawdown guardrail.",
          }),
        ],
      };
      journalEntries.push(
        journal({
          title: `Desk exited ${position.ticker}`,
          body: `Closed paper ${position.side} after thesis health moved to broken. P&L ${Math.round(
            closed.pnl,
          ).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`,
          relatedTicker: position.ticker,
          relatedThesisRecordId: position.thesisRecordId,
          simulationTime,
          sourceIds,
        }),
      );
      return closed;
    }

    const hasAdded = positionHistory.some((action) => action.type === "add");
    const currentExposure = openExposureBefore + exposureDelta;
    const targetGross =
      startingPortfolio.netLiquidationValue * (targetGrossPctFor(run) / 100);
    const maxGross =
      startingPortfolio.netLiquidationValue *
      (run.riskLimits.maxGrossExposurePct / 100);
    const maxPosition =
      startingPortfolio.netLiquidationValue *
      (run.riskLimits.maxPositionPct / 100);
    const canAdd =
      !hasAdded &&
      !weakened &&
      position.side === "long" &&
      returnPct > -0.03 &&
      holdingDays >= 21 &&
      currentExposure < targetGross &&
      position.size < maxPosition * 0.98;
    const addSize = Math.min(
      initialSize * 0.5,
      Math.max(0, maxPosition - position.size),
      Math.max(0, targetGross - currentExposure),
      Math.max(0, maxGross - currentExposure),
    );
    if (canAdd && addSize >= 5_000) {
      exposureDelta += addSize;
      journalEntries.push(
        journal({
          title: `Desk added ${position.ticker}`,
          body: `Added to intact paper ${position.side} after the thesis worked and visible sources did not break the view.`,
          relatedTicker: position.ticker,
          relatedThesisRecordId: position.thesisRecordId,
          simulationTime,
          sourceIds,
        }),
      );
      return {
        ...basePosition,
        size: Math.round(position.size + addSize),
        nextAction: "Hold" as const,
        history: [
          ...positionHistory,
          createTradeAction({
            type: "add",
            simulationTime,
            price: currentPrice,
            sizeDelta: addSize,
            note: "Added to intact winner inside gross exposure limit.",
          }),
        ],
      };
    }

    const breachesPositionCap = position.size > maxPosition * 1.05;
    const breachesGrossCap = currentExposure > maxGross * 1.01;
    const shouldTrim =
      breachesPositionCap || breachesGrossCap || (weakened && returnPct > 0.05);
    if (shouldTrim) {
      const neededGrossTrim = breachesGrossCap ? currentExposure - maxGross : 0;
      const neededPositionTrim = breachesPositionCap ? position.size - maxPosition : 0;
      const trimSize = Math.min(
        Math.max(position.size * 0.2, neededGrossTrim, neededPositionTrim),
        position.size - 5_000,
      );
      if (trimSize > 0) {
        exposureDelta -= trimSize;
        journalEntries.push(
          journal({
            title: `Desk trimmed ${position.ticker}`,
            body: `Trimmed paper ${position.side} after ${
              weakened ? "thesis weakening" : "risk cap pressure"
            }.`,
            relatedTicker: position.ticker,
            relatedThesisRecordId: position.thesisRecordId,
            simulationTime,
            sourceIds,
          }),
        );
        return {
          ...basePosition,
          size: Math.round(position.size - trimSize),
          nextAction: weakened ? ("Revisit" as const) : ("Hold" as const),
          history: [
            ...positionHistory,
            createTradeAction({
              type: "trim",
              simulationTime,
              price: currentPrice,
              sizeDelta: -trimSize,
              note: weakened
                ? "Trimmed after thesis health weakened."
                : "Trimmed to restore risk limits.",
            }),
          ],
        };
      }
    }

    return {
      ...basePosition,
      nextAction: weakened ? ("Revisit" as const) : ("Hold" as const),
      history:
        tickerSources.length && tickerSources.some((source) => source.knownAt === simulationTime)
          ? [
              ...positionHistory,
              createTradeAction({
                type: "recheck",
                simulationTime,
                price: currentPrice,
                sizeDelta: 0,
                note: weakened
                  ? "Re-check marked thesis weakened."
                  : "Re-check kept thesis intact.",
              }),
            ]
          : positionHistory,
    };
  });
  return { positions, journalEntries };
};

const shouldKeepCandidateQueued = ({
  candidate,
  positions,
  thesisRecords,
}: {
  candidate: FullAutoCandidate;
  positions: FullAutoPaperPosition[];
  thesisRecords: ThesisRecord[];
}) => {
  const record = thesisRecords.find((item) => item.ticker === candidate.ticker);
  if (!record) return true;
  if (record.recommendation === "hold-neutral") return false;

  const position =
    (record.paperPositionId
      ? positions.find((item) => item.id === record.paperPositionId)
      : null) ?? positions.find((item) => item.thesisRecordId === record.id);

  return (
    record.monitoringState === "weakened" ||
    record.monitoringState === "broken" ||
    position?.thesisStatus === "weakened" ||
    position?.thesisStatus === "broken" ||
    position?.nextAction === "Revisit" ||
    position?.nextAction === "Exit"
  );
};

const nextTimeFor = (run: FullAutoRun, command: FullAutoStepCommand) => {
  if (command === "start") return clampToReplayEnd(run.startDate, run);
  if (command === "step_day") {
    return clampToReplayEnd(addSimulationDay(run.simulationTime), run);
  }
  if (command === "step_event") {
    const openPositions = run.paperPositions.filter(
      (position) => position.status === "open",
    );
    const bookGross = run.portfolio?.grossExposurePct ?? 0;
    const bookIsDeployed =
      bookGross >= targetGrossPctFor(run) - 1 ||
      openPositions.length >= run.riskLimits.maxOpenPositions;
    if (bookIsDeployed && openPositions.length) {
      const nextPortfolioMark = getNextPortfolioMarkDate({
        currentTime: run.simulationTime,
        tickers: openPositions.map((position) => position.ticker),
      });
      if (nextPortfolioMark) {
        return clampToReplayEnd(nextPortfolioMark, run);
      }
    }
    return clampToReplayEnd(
      getNextKnownEventDate({
        currentTime: run.simulationTime,
        universe: run.universe,
      }) ?? addSimulationDay(run.simulationTime),
      run,
    );
  }
  return clampToReplayEnd(run.simulationTime, run);
};

const runSingleStep = async (
  run: FullAutoRun,
  simulationTime: string,
): Promise<FullAutoRun> => {
  const visibleSources = getVisibleSources({
    simulationTime,
    universe: run.universe,
    lookbackWindowDays: 120,
  });
  const sourceIds = visibleSources.map((source) => source.sourceId);
  const events: FullAutoAgentEvent[] = [];
  const journalEntries: FullAutoJournalEntry[] = [];

  events.push(
    (
      await runAgent({
        role: "Morning Brief Agent",
        simulationTime,
        input: { universe: run.universe },
        visibleSources,
      })
    ).event,
  );
  const brief = buildBrief(simulationTime, visibleSources);
  journalEntries.push(
    journal({
      title: "Morning Brief",
      body: brief.summary,
      simulationTime,
      sourceIds,
    }),
  );

  const managed = manageOpenPositions(run, simulationTime, visibleSources);
  let nextPositions = managed.positions;
  journalEntries.push(...managed.journalEntries);
  const managedPortfolio = recalcPortfolio({
    previousPortfolio: run.portfolio ?? buildInitialPortfolio(),
    positions: nextPositions,
    simulationTime,
  });
  const openSlots = Math.max(
    0,
    run.riskLimits.maxOpenPositions -
      nextPositions.filter((position) => position.status === "open").length,
  );
  const grossShortfall =
    targetGrossPctFor(run) - managedPortfolio.grossExposurePct;
  const workupLimit =
    grossShortfall > 30
      ? Math.min(3, openSlots)
      : grossShortfall > 10
        ? Math.min(2, openSlots)
        : Math.min(1, openSlots);
  const candidates = buildCandidates(
    run,
    simulationTime,
    visibleSources,
    workupLimit,
  );
  events.push(
    (
      await runAgent({
        role: "Candidate Agent",
        simulationTime,
        input: { candidateTickers: candidates.map((candidate) => candidate.ticker) },
        visibleSources,
      })
    ).event,
  );

  let nextCandidates = [...run.candidateQueue];
  let nextTheses = [...run.thesisRecords];
  const positionByThesis = new Map(
    nextPositions.map((position) => [position.id, position]),
  );
  nextTheses = nextTheses.map((record) => {
    const position = record.paperPositionId
      ? positionByThesis.get(record.paperPositionId)
      : null;
    if (!position) return record;
    return {
      ...record,
      monitoringState:
        position.status === "closed"
          ? position.thesisStatus === "broken"
            ? ("broken" as const)
            : ("weakened" as const)
          : position.thesisStatus,
    };
  });

  for (const candidate of candidates) {
    const candidateSources = visibleSources.filter(
      (source) => source.ticker === candidate.ticker || source.ticker === "SPY",
    );
    nextCandidates = [
      { ...candidate, status: "worked_up" as const },
      ...nextCandidates.filter((item) => item.ticker !== candidate.ticker),
    ].slice(0, 12);

    for (const role of [
      "Fundamental Analyst",
      "News / Sentiment Analyst",
      "Market Structure Analyst",
      "Macro / Context Analyst",
    ] as const) {
      events.push(
        (
          await runAgent({
            role,
            simulationTime,
            input: { ticker: candidate.ticker },
            visibleSources: candidateSources,
          })
        ).event,
      );
    }

    let thesis = createThesisRecordFromAgentOutputs({
      candidate,
      simulationTime,
      visibleSources: candidateSources,
    });
    events.push(
      (
        await runAgent({
          role: "PM Synthesizer",
          simulationTime,
          input: { ticker: candidate.ticker, conviction: thesis.conviction },
          visibleSources: candidateSources,
        })
      ).event,
    );

    thesis = {
      ...thesis,
      pmDecision: thesis.conviction >= 6.8 ? "approved" : "revise",
    };
    journalEntries.push(
      journal({
        title: `PM ${thesis.pmDecision === "approved" ? "approved" : "sent back"} ${thesis.ticker}`,
        body: `${thesis.oneLineThesis} Conviction ${thesis.conviction.toFixed(1)}/10.`,
        relatedTicker: thesis.ticker,
        relatedThesisRecordId: thesis.id,
        simulationTime,
        sourceIds: thesis.sourceIds,
      }),
    );

    const validationSources = [
      ...getVisibleSources({
        simulationTime,
        ticker: candidate.ticker,
        lookbackWindowDays: VALIDATION_LOOKBACK_DAYS,
      }),
      ...getVisibleSources({
        simulationTime,
        ticker: "SPY",
        lookbackWindowDays: VALIDATION_LOOKBACK_DAYS,
      }),
    ].sort((left, right) => left.knownAt.localeCompare(right.knownAt));
    const validation = runPriorWindowValidation({
      thesis,
      simulationTime,
      visibleSources: validationSources,
    });
    thesis = {
      ...thesis,
      validation,
      sourceIds: unique([...thesis.sourceIds, ...validation.sourceIds]),
    };
    events.push(
      (
        await runAgent({
          role: "Validation Agent",
          simulationTime,
          input: {
            ticker: thesis.ticker,
            observationCount: validation.observationCount,
            validationStatus: validation.status,
          },
          visibleSources: validationSources,
        })
      ).event,
    );
    journalEntries.push(
      journal({
        title: `Validation ${validation.status} ${thesis.ticker}`,
        body: validation.verdict,
        relatedTicker: thesis.ticker,
        relatedThesisRecordId: thesis.id,
        simulationTime,
        sourceIds: validation.sourceIds,
      }),
    );

    events.push(
      (
        await runAgent({
          role: "Risk Gate Agent",
          simulationTime,
          input: {
            ticker: thesis.ticker,
            pmDecision: thesis.pmDecision,
            maxPositionPct: run.riskLimits.maxPositionPct,
          },
          visibleSources: candidateSources,
        })
      ).event,
    );

    const riskDecision = riskDecisionForThesis(thesis);
    thesis = {
      ...thesis,
      riskDecision,
      monitoringState:
        ["approved", "reduced"].includes(riskDecision)
          ? "active"
          : "not_started",
    };

    const portfolioForSizing = recalcPortfolio({
      previousPortfolio: run.portfolio ?? buildInitialPortfolio(),
      positions: nextPositions,
      simulationTime,
    });
    const position = createPaperPositionFromRiskDecision(thesis, {
      ...run,
      paperPositions: nextPositions,
      portfolio: portfolioForSizing,
    });
    if (position) {
      thesis = { ...thesis, paperPositionId: position.id };
      nextPositions = [position, ...nextPositions];
      events.push(
        (
          await runAgent({
            role: "Desk Agent",
            simulationTime,
            input: { ticker: thesis.ticker, positionId: position.id },
            visibleSources: candidateSources,
          })
        ).event,
      );
      journalEntries.push(
        journal({
          title: `Desk opened ${position.side} ${position.ticker}`,
          body: `Paper position opened at $${position.entryPrice.toFixed(2)} with ${run.riskLimits.maxPositionPct}% starter sizing.`,
          relatedTicker: thesis.ticker,
          relatedThesisRecordId: thesis.id,
          simulationTime,
          sourceIds: thesis.sourceIds,
        }),
      );
    }

    nextTheses = [thesis, ...nextTheses];
  }

  if (nextPositions.some((position) => position.status === "open")) {
    events.push(
      (
        await runAgent({
          role: "Monitor Agent",
          simulationTime,
          input: { openPositions: nextPositions.filter((position) => position.status === "open").length },
          visibleSources,
        })
      ).event,
    );
  }

  events.push(
    (
      await runAgent({
        role: "Journal Agent",
        simulationTime,
        input: { entries: journalEntries.length },
        visibleSources,
      })
    ).event,
  );

  nextCandidates = nextCandidates
    .filter((candidate) =>
      shouldKeepCandidateQueued({
        candidate,
        positions: nextPositions,
        thesisRecords: nextTheses,
      }),
    )
    .slice(0, 12);

  const now = new Date().toISOString();
  const isComplete =
    new Date(simulationTime).getTime() >=
    Math.min(new Date(run.endDate).getTime(), Date.now());
  const portfolio = recalcPortfolio({
    previousPortfolio: run.portfolio ?? buildInitialPortfolio(),
    positions: nextPositions,
    simulationTime,
  });
  const thesisRegistry = buildThesisRegistry(nextTheses);
  return {
    ...run,
    status: isComplete ? "complete" : "running",
    simulationTime,
    updatedAt: now,
    currentBrief: {
      headline: brief.headline,
      summary: brief.summary,
      sourceCount: brief.sourceCount,
      tone: brief.tone,
    },
    candidateQueue: nextCandidates,
    thesisRecords: nextTheses,
    paperPositions: nextPositions,
    portfolio,
    thesisRegistry,
    journal: [...journalEntries, ...run.journal].slice(0, 80),
    agentEvents: [...events, ...run.agentEvents].slice(0, 120),
    error: null,
  };
};

export const stepFullAutoRun = async ({
  command,
  run,
}: {
  command: FullAutoStepCommand;
  run: FullAutoRun;
}): Promise<FullAutoRun> => {
  if (command === "pause") {
    return {
      ...run,
      status: "paused",
      updatedAt: new Date().toISOString(),
    };
  }

  if (command === "fast_forward") {
    let next = run.status === "idle" ? { ...run, status: "running" as const } : run;
    for (let index = 0; index < 5 && next.status !== "complete"; index += 1) {
      const nextEventDate = clampToReplayEnd(
        getNextKnownEventDate({
          currentTime: next.simulationTime,
          universe: next.universe,
        }) ?? addSimulationDay(next.simulationTime),
        next,
      );
      next = await runSingleStep(next, nextEventDate);
    }
    return next;
  }

  const simulationTime = nextTimeFor(run, command);
  return runSingleStep(
    {
      ...run,
      status: "running",
      error: null,
    },
    simulationTime,
  );
};

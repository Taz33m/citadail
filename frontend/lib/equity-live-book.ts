import { coverageDeskItems } from "@/lib/coverage-desk-data";
import { buildPmReviewPacket } from "@/lib/equity-pm-review";
import { formatThesisRecommendation } from "@/lib/equity-project";
import { positionPnl } from "@/lib/equity-trade-desk";
import type {
  FullAutoRun,
  ThesisRecord,
} from "@/types/full-auto";
import type {
  EquityPaperPosition,
  EquityProject,
  ShellSession,
} from "@/types/session";

export type LiveBookStage =
  | "PM Review"
  | "Risk Gate"
  | "Trade Desk"
  | "Closed"
  | "Analyst";

export type LiveBookAttentionTone = "risk" | "review" | "desk";

export interface LiveBookPositionRow {
  sessionId: string;
  sessionTitle: string;
  ticker: string;
  companyName: string;
  sector: string;
  side: string;
  status: EquityPaperPosition["status"];
  sourceLabel?: "Assist" | "Full Auto";
  fullAutoRunId?: string;
  fullAutoThesisRecordId?: string;
  entryPrice: number;
  currentPrice: number;
  size: number;
  pnl: number;
  returnPct: number;
  thesisStatus: EquityPaperPosition["thesisStatus"];
  nextAction: EquityPaperPosition["nextAction"];
  nextCatalyst: string;
  rationale: string;
  openedAt: string;
}

export interface LiveBookThesisRow {
  sessionId: string;
  ticker: string;
  companyName: string;
  sector: string;
  recommendation: string;
  conviction: number | null;
  stage: LiveBookStage;
  status: string;
  sourceLabel?: "Assist" | "Full Auto";
  fullAutoRunId?: string;
  fullAutoThesisRecordId?: string;
  oneLineThesis: string;
}

export interface LiveBookAttentionItem {
  id: string;
  sessionId: string;
  ticker: string;
  label: string;
  detail: string;
  tone: LiveBookAttentionTone;
  priority: number;
}

export interface LiveBookRiskBucket {
  label: string;
  exposure: number;
  count: number;
}

export interface LiveBookSnapshot {
  openPositions: LiveBookPositionRow[];
  closedPositions: LiveBookPositionRow[];
  thesisPipeline: LiveBookThesisRow[];
  attention: LiveBookAttentionItem[];
  sideBuckets: LiveBookRiskBucket[];
  sectorBuckets: LiveBookRiskBucket[];
  totals: {
    openPositions: number;
    closedPositions: number;
    activeTheses: number;
    grossNotional: number;
    netPnl: number;
    attention: number;
    active: number;
    weakened: number;
    broken: number;
  };
}

interface BuildLiveBookOptions {
  includeDemoAssistData?: boolean;
}

const companyFor = (ticker: string) => {
  const coverage = coverageDeskItems.find((item) => item.ticker === ticker);
  return {
    companyName: coverage?.companyName ?? ticker,
    sector: coverage?.sector ?? "Unclassified",
  };
};

const firstSentence = (value: string, fallback: string) => {
  const source = value.replace(/\s+/g, " ").trim() || fallback;
  const sentence = source.match(/.*?[.!?](?:\s|$)/)?.[0] ?? source;
  return sentence.length > 180 ? `${sentence.slice(0, 179).trim()}...` : sentence;
};

const stageFor = (
  project: EquityProject,
  session: ShellSession,
): LiveBookStage => {
  if (session.snapshot.paperPosition?.status === "closed") return "Closed";
  if (
    session.snapshot.paperPosition ||
    session.snapshot.riskGate?.decision === "approved_to_desk"
  ) {
    return "Trade Desk";
  }
  if (session.snapshot.pmReview?.decision === "approved_to_risk") {
    return "Risk Gate";
  }
  if (project.status === "ready") return "PM Review";
  return "Analyst";
};

const statusFor = (session: ShellSession, stage: LiveBookStage) => {
  const { paperPosition, pmReview, riskGate } = session.snapshot;
  if (paperPosition?.status === "open") {
    return `${paperPosition.thesisStatus}; ${paperPosition.nextAction}`;
  }
  if (paperPosition?.status === "closed") return "Closed";
  if (riskGate?.decision === "approved_to_desk") return "Approved; not opened";
  if (riskGate?.decision && riskGate.decision !== "pending") {
    return riskGate.decision.replace(/_/g, " ");
  }
  if (pmReview?.decision === "approved_to_risk") return "Risk sizing";
  if (pmReview?.decision && pmReview.decision !== "pending") {
    return pmReview.decision.replace(/_/g, " ");
  }
  return stage === "PM Review" ? "Awaiting PM" : "In progress";
};

const buildPositionRow = (
  position: EquityPaperPosition,
  session: ShellSession,
): LiveBookPositionRow => {
  const company = companyFor(position.ticker);
  const pnl = positionPnl(position);
  return {
    sessionId: session.id,
    sessionTitle: session.title,
    sourceLabel: "Assist",
    ticker: position.ticker,
    companyName: company.companyName,
    sector: company.sector,
    side: position.side.toUpperCase(),
    status: position.status,
    entryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    size: position.size,
    pnl: pnl.pnl,
    returnPct: pnl.returnPct,
    thesisStatus: position.thesisStatus,
    nextAction: position.nextAction,
    nextCatalyst: position.nextCatalyst,
    rationale: position.rationale,
    openedAt: position.openedAt,
  };
};

const buildThesisRow = (
  project: EquityProject,
  session: ShellSession,
): LiveBookThesisRow => {
  const company = companyFor(project.ticker);
  const pmPacket = buildPmReviewPacket(project);
  const stage = stageFor(project, session);
  return {
    sessionId: session.id,
    sourceLabel: "Assist",
    ticker: project.ticker,
    companyName: company.companyName,
    sector: company.sector,
    recommendation: formatThesisRecommendation(project.recommendation),
    conviction: pmPacket?.conviction ?? null,
    stage,
    status: statusFor(session, stage),
    oneLineThesis: firstSentence(
      project.generatedContent?.recommendationSummary ?? "",
      project.rationale,
    ),
  };
};

const buildFullAutoPositionRow = (
  position: FullAutoRun["paperPositions"][number],
  record: ThesisRecord | undefined,
  run: FullAutoRun,
): LiveBookPositionRow => {
  const company = companyFor(position.ticker);
  return {
    sessionId: `full-auto:${run.id}:${position.id}`,
    sessionTitle: "Full Auto",
    sourceLabel: "Full Auto",
    fullAutoRunId: run.id,
    fullAutoThesisRecordId: position.thesisRecordId,
    ticker: position.ticker,
    companyName: record?.companyName ?? company.companyName,
    sector: record?.sector ?? company.sector,
    side: position.side.toUpperCase(),
    status: position.status,
    entryPrice: position.entryPrice,
    currentPrice: position.currentPrice,
    size: position.size,
    pnl: position.pnl,
    returnPct: position.returnPct,
    thesisStatus: position.thesisStatus,
    nextAction: position.nextAction,
    nextCatalyst: record?.catalysts[0] ?? "Next replay event",
    rationale: position.rationale,
    openedAt: position.openedAt,
  };
};

const buildFullAutoThesisRow = (
  record: ThesisRecord,
  run: FullAutoRun,
): LiveBookThesisRow => ({
  sessionId: `full-auto:${run.id}:${record.id}`,
  sourceLabel: "Full Auto",
  fullAutoRunId: run.id,
  fullAutoThesisRecordId: record.id,
  ticker: record.ticker,
  companyName: record.companyName,
  sector: record.sector,
  recommendation: formatThesisRecommendation(record.recommendation),
  conviction: record.conviction,
  stage: record.paperPositionId ? "Trade Desk" : "PM Review",
  status:
    record.monitoringState === "active"
      ? "Active"
      : record.monitoringState.replace(/_/g, " "),
  oneLineThesis: record.oneLineThesis,
});

const addBucket = (
  buckets: Map<string, LiveBookRiskBucket>,
  label: string,
  exposure: number,
) => {
  const bucket = buckets.get(label) ?? { label, exposure: 0, count: 0 };
  buckets.set(label, {
    ...bucket,
    exposure: bucket.exposure + exposure,
    count: bucket.count + 1,
  });
};

const buildRiskBuckets = (openPositions: LiveBookPositionRow[]) => {
  const sideBuckets = new Map<string, LiveBookRiskBucket>();
  const sectorBuckets = new Map<string, LiveBookRiskBucket>();
  for (const position of openPositions) {
    addBucket(sideBuckets, position.side, position.size);
    addBucket(sectorBuckets, position.sector, position.size);
  }

  return {
    sideBuckets: [...sideBuckets.values()].sort(
      (left, right) => right.exposure - left.exposure,
    ),
    sectorBuckets: [...sectorBuckets.values()].sort(
      (left, right) => right.exposure - left.exposure,
    ),
  };
};

const demoAssistPosition = ({
  currentPrice,
  entryPrice,
  nextAction,
  nextCatalyst,
  openedAt,
  rationale,
  size,
  status = "open",
  thesisStatus = "active",
  ticker,
}: {
  ticker: string;
  entryPrice: number;
  currentPrice: number;
  size: number;
  openedAt: string;
  rationale: string;
  nextCatalyst: string;
  nextAction: EquityPaperPosition["nextAction"];
  status?: EquityPaperPosition["status"];
  thesisStatus?: EquityPaperPosition["thesisStatus"];
}): LiveBookPositionRow => {
  const company = companyFor(ticker);
  const returnPct = (currentPrice - entryPrice) / entryPrice;
  return {
    sessionId: `assist-demo:${ticker}`,
    sessionTitle: "Assist Demo Book",
    sourceLabel: "Assist",
    ticker,
    companyName: company.companyName,
    sector: company.sector,
    side: "LONG",
    status,
    entryPrice,
    currentPrice,
    size,
    pnl: Math.round(size * returnPct),
    returnPct,
    thesisStatus,
    nextAction,
    nextCatalyst,
    rationale,
    openedAt,
  };
};

const buildDemoAssistSnapshot = (): LiveBookSnapshot => {
  const openPositions: LiveBookPositionRow[] = [
    demoAssistPosition({
      ticker: "NVDA",
      entryPrice: 92,
      currentPrice: 155,
      size: 70_000,
      openedAt: "2024-07-10T13:30:00.000Z",
      nextAction: "Hold",
      nextCatalyst: "Next AI accelerator demand check",
      rationale:
        "AI accelerator demand and data-center backlog supported a medium-horizon long.",
    }),
    demoAssistPosition({
      ticker: "MSFT",
      entryPrice: 420,
      currentPrice: 500,
      size: 80_000,
      openedAt: "2024-05-15T13:30:00.000Z",
      nextAction: "Hold",
      nextCatalyst: "Cloud margin and AI monetization update",
      rationale:
        "Azure durability and Office cash flow supported a steady compounder position.",
    }),
    demoAssistPosition({
      ticker: "LLY",
      entryPrice: 760,
      currentPrice: 840,
      size: 55_000,
      openedAt: "2024-09-04T13:30:00.000Z",
      nextAction: "Revisit",
      nextCatalyst: "Obesity franchise capacity update",
      rationale:
        "GLP-1 demand and pipeline optionality supported the long, with valuation still monitored.",
      thesisStatus: "weakened",
    }),
    demoAssistPosition({
      ticker: "JPM",
      entryPrice: 200,
      currentPrice: 245,
      size: 45_000,
      openedAt: "2025-02-18T14:30:00.000Z",
      nextAction: "Hold",
      nextCatalyst: "Credit quality and net interest income update",
      rationale:
        "Balance-sheet quality and resilient credit trends supported bank exposure.",
    }),
  ];
  const closedPositions: LiveBookPositionRow[] = [
    demoAssistPosition({
      ticker: "CRM",
      entryPrice: 255,
      currentPrice: 295,
      size: 35_000,
      openedAt: "2024-10-09T13:30:00.000Z",
      nextAction: "Hold",
      nextCatalyst: "Closed after margin catalyst played through",
      rationale:
        "Margin discipline and enterprise software demand drove a completed paper trade.",
      status: "closed",
    }),
    demoAssistPosition({
      ticker: "XOM",
      entryPrice: 120,
      currentPrice: 112,
      size: 30_000,
      openedAt: "2024-06-03T13:30:00.000Z",
      nextAction: "Exit",
      nextCatalyst: "Closed after commodity setup weakened",
      rationale:
        "Energy cash-flow recovery thesis was closed when the catalyst path deteriorated.",
      status: "closed",
      thesisStatus: "weakened",
    }),
  ];
  const thesisPipeline: LiveBookThesisRow[] = [
    ...openPositions.map((position) => ({
      sessionId: position.sessionId,
      sourceLabel: "Assist" as const,
      ticker: position.ticker,
      companyName: position.companyName,
      sector: position.sector,
      recommendation: "Buy / Long",
      conviction:
        position.ticker === "NVDA"
          ? 8.1
          : position.ticker === "MSFT"
            ? 7.6
            : position.ticker === "LLY"
              ? 7.4
              : 7.0,
      stage: "Trade Desk" as const,
      status: `${position.thesisStatus}; ${position.nextAction}`,
      oneLineThesis: firstSentence(position.rationale, position.rationale),
    })),
    {
      sessionId: "assist-demo:ORCL-review",
      sourceLabel: "Assist",
      ticker: "ORCL",
      companyName: companyFor("ORCL").companyName,
      sector: companyFor("ORCL").sector,
      recommendation: "Buy / Long",
      conviction: 6.9,
      stage: "PM Review",
      status: "Awaiting PM",
      oneLineThesis:
        "Database cash flow and cloud migration remain under PM review before sizing.",
    },
  ];
  const { sectorBuckets, sideBuckets } = buildRiskBuckets(openPositions);
  const grossNotional = openPositions.reduce(
    (total, position) => total + position.size,
    0,
  );
  const netPnl = openPositions.reduce((total, position) => total + position.pnl, 0);

  return {
    openPositions,
    closedPositions,
    thesisPipeline,
    attention: [],
    sideBuckets,
    sectorBuckets,
    totals: {
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      activeTheses: thesisPipeline.length,
      grossNotional,
      netPnl,
      attention: 0,
      active: openPositions.filter((position) => position.thesisStatus === "active")
        .length,
      weakened: openPositions.filter(
        (position) => position.thesisStatus === "weakened",
      ).length,
      broken: openPositions.filter((position) => position.thesisStatus === "broken")
        .length,
    },
  };
};

const buildAttention = (
  sessions: ShellSession[],
  openPositions: LiveBookPositionRow[],
): LiveBookAttentionItem[] => {
  const positionItems: LiveBookAttentionItem[] = [];
  for (const position of openPositions) {
    if (position.thesisStatus === "broken") {
      positionItems.push({
        id: `${position.sessionId}-broken`,
        sessionId: position.sessionId,
        ticker: position.ticker,
        label: "Broken thesis",
        detail: `${position.nextAction}: ${position.nextCatalyst}`,
        tone: "risk",
        priority: 1,
      });
      continue;
    }
    if (
      position.thesisStatus === "weakened" ||
      position.nextAction === "Trim" ||
      position.nextAction === "Exit" ||
      position.nextAction === "Revisit"
    ) {
      positionItems.push({
        id: `${position.sessionId}-action`,
        sessionId: position.sessionId,
        ticker: position.ticker,
        label: "Position needs action",
        detail: `${position.thesisStatus}; ${position.nextAction}`,
        tone: "desk",
        priority: 2,
      });
    }
  }

  const workflowItems: LiveBookAttentionItem[] = [];
  for (const session of sessions) {
    const project = session.snapshot.equityProject;
    if (!project || project.status !== "ready") continue;
    if (
      session.snapshot.riskGate?.decision === "approved_to_desk" &&
      !session.snapshot.paperPosition
    ) {
      workflowItems.push({
        id: `${session.id}-trade-open`,
        sessionId: session.id,
        ticker: project.ticker,
        label: "Approved trade not opened",
        detail: "Desk can create the paper position.",
        tone: "desk",
        priority: 3,
      });
      continue;
    }
    if (
      session.snapshot.pmReview?.decision === "approved_to_risk" &&
      (!session.snapshot.riskGate ||
        session.snapshot.riskGate.decision === "pending")
    ) {
      workflowItems.push({
        id: `${session.id}-risk`,
        sessionId: session.id,
        ticker: project.ticker,
        label: "Awaiting Risk Gate",
        detail: "PM approved; sizing decision is pending.",
        tone: "risk",
        priority: 4,
      });
      continue;
    }
    if (
      !session.snapshot.pmReview ||
      session.snapshot.pmReview.decision === "pending"
    ) {
      workflowItems.push({
        id: `${session.id}-pm`,
        sessionId: session.id,
        ticker: project.ticker,
        label: "Awaiting PM Review",
        detail: "Analyst package is ready for decision.",
        tone: "review",
        priority: 5,
      });
    }
  }

  return [...positionItems, ...workflowItems]
    .sort((left, right) => left.priority - right.priority)
    .slice(0, 8);
};

export const buildLiveBookSnapshot = (
  sessions: ShellSession[],
  options: BuildLiveBookOptions = {},
): LiveBookSnapshot => {
  const positions = sessions.flatMap((session) => {
    const position = session.snapshot.paperPosition;
    return position ? [buildPositionRow(position, session)] : [];
  });
  const openPositions = positions.filter((position) => position.status === "open");
  const closedPositions = positions.filter(
    (position) => position.status === "closed",
  );
  const thesisPipeline = sessions.flatMap((session) => {
    const project = session.snapshot.equityProject;
    return project?.status === "ready" ? [buildThesisRow(project, session)] : [];
  });

  const netPnl = openPositions.reduce((total, position) => total + position.pnl, 0);
  const grossNotional = openPositions.reduce(
    (total, position) => total + position.size,
    0,
  );
  const attention = buildAttention(sessions, openPositions);
  const { sectorBuckets, sideBuckets } = buildRiskBuckets(openPositions);
  const hasRealBook =
    openPositions.length > 0 ||
    closedPositions.length > 0 ||
    thesisPipeline.length > 0;

  if (options.includeDemoAssistData && !hasRealBook) {
    return buildDemoAssistSnapshot();
  }

  return {
    openPositions,
    closedPositions,
    thesisPipeline,
    attention,
    sideBuckets,
    sectorBuckets,
    totals: {
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      activeTheses: thesisPipeline.length,
      grossNotional,
      netPnl,
      attention: attention.length,
      active: openPositions.filter((position) => position.thesisStatus === "active")
        .length,
      weakened: openPositions.filter(
        (position) => position.thesisStatus === "weakened",
      ).length,
      broken: openPositions.filter((position) => position.thesisStatus === "broken")
        .length,
    },
  };
};

export const buildUnifiedLiveBook = ({
  fullAutoRuns,
  sessions,
}: {
  sessions: ShellSession[];
  fullAutoRuns: FullAutoRun[];
}): LiveBookSnapshot => {
  const base = buildLiveBookSnapshot(sessions);
  const fullAutoPositions = fullAutoRuns.flatMap((run) =>
    run.paperPositions.map((position) =>
      buildFullAutoPositionRow(
        position,
        run.thesisRecords.find((record) => record.id === position.thesisRecordId),
        run,
      ),
    ),
  );
  const fullAutoOpen = fullAutoPositions.filter(
    (position) => position.status === "open",
  );
  const fullAutoClosed = fullAutoPositions.filter(
    (position) => position.status === "closed",
  );
  const thesisPipeline = [
    ...base.thesisPipeline,
    ...fullAutoRuns.flatMap((run) =>
      run.thesisRecords.map((record) => buildFullAutoThesisRow(record, run)),
    ),
  ];
  const openPositions = [...base.openPositions, ...fullAutoOpen];
  const closedPositions = [...base.closedPositions, ...fullAutoClosed];

  const sideBuckets = new Map<string, LiveBookRiskBucket>();
  const sectorBuckets = new Map<string, LiveBookRiskBucket>();
  for (const position of openPositions) {
    addBucket(sideBuckets, position.side, position.size);
    addBucket(sectorBuckets, position.sector, position.size);
  }
  const grossNotional = openPositions.reduce(
    (total, position) => total + position.size,
    0,
  );
  const netPnl = openPositions.reduce((total, position) => total + position.pnl, 0);

  return {
    ...base,
    openPositions,
    closedPositions,
    thesisPipeline,
    sideBuckets: [...sideBuckets.values()].sort(
      (left, right) => right.exposure - left.exposure,
    ),
    sectorBuckets: [...sectorBuckets.values()].sort(
      (left, right) => right.exposure - left.exposure,
    ),
    totals: {
      ...base.totals,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      activeTheses: thesisPipeline.length,
      grossNotional,
      netPnl,
      active: openPositions.filter((position) => position.thesisStatus === "active")
        .length,
      weakened: openPositions.filter(
        (position) => position.thesisStatus === "weakened",
      ).length,
      broken: openPositions.filter((position) => position.thesisStatus === "broken")
        .length,
    },
  };
};

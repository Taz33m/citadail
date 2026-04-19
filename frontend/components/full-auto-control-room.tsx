"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import EquityLineChart from "@/components/equity-line-chart";
import {
  getOrCreateLatestFullAutoRun,
  upsertFullAutoRun,
} from "@/lib/full-auto-storage";
import { openThesisRecordInSession } from "@/lib/full-auto-session-bridge";
import { cn } from "@/lib/utils";
import type { DedalusRuntimeStatus } from "@/types/dedalus-runtime";
import type {
  FullAutoAgentEvent,
  FullAutoAgentRole,
  FullAutoCandidate,
  FullAutoPaperPosition,
  FullAutoRun,
  FullAutoStepCommand,
  ThesisRecord,
} from "@/types/full-auto";

const fmtDate = (value: string) =>
  new Date(value).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

const fmtMoney = (value: number) =>
  value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  });

const fmtPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const fmtUnsignedPct = (value: number) => `${(value * 100).toFixed(1)}%`;

const fmtMaybePct = (value: number | null) =>
  value === null ? "n/a" : fmtPct(value);

const commandLabel: Record<FullAutoStepCommand, string> = {
  start: "Start",
  pause: "Pause",
  step_day: "Step Day",
  step_event: "Step Event",
  fast_forward: "Fast-forward",
};

const workflowStages = [
  "Morning Brief",
  "Candidate",
  "Analyst Swarm",
  "PM Synth",
  "Validation",
  "Risk Gate",
  "Desk",
  "Monitor",
] as const;

type WorkflowStage = (typeof workflowStages)[number];

const richActivityRoles = new Set<FullAutoAgentRole>([
  "PM Synthesizer",
  "Validation Agent",
  "Risk Gate Agent",
  "Desk Agent",
]);

const roleStage: Record<FullAutoAgentRole, WorkflowStage> = {
  "Morning Brief Agent": "Morning Brief",
  "Candidate Agent": "Candidate",
  "Fundamental Analyst": "Analyst Swarm",
  "News / Sentiment Analyst": "Analyst Swarm",
  "Market Structure Analyst": "Analyst Swarm",
  "Macro / Context Analyst": "Analyst Swarm",
  "PM Synthesizer": "PM Synth",
  "Validation Agent": "Validation",
  "Risk Gate Agent": "Risk Gate",
  "Desk Agent": "Desk",
  "Monitor Agent": "Monitor",
  "Journal Agent": "Monitor",
};

const titleCaseStatus = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const recommendationLabel = (value: ThesisRecord["recommendation"] | null | undefined) =>
  value ? value.split("-").map(titleCaseStatus).join(" / ") : "n/a";

const displayDeskCopy = (value: string | null | undefined) =>
  (value ?? "")
    .replace(/Replay mark:\s*/gi, "")
    .replace(/\breplay mark\b/gi, "visible mark")
    .replace(/\breplay tape\b/gi, "visible tape")
    .replace(
      /current replay boundary.*?live market data.*?claimed\.?/gi,
      "",
    )
    .replace(
      /present-day placeholder snapshot.*?live market data.*?claimed\.?/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();

const deskCopyOrFallback = (
  value: string | null | undefined,
  fallback: string,
) => {
  const cleaned = displayDeskCopy(value);
  if (!cleaned || /^[A-Z]{1,5}\s+(buy long|sell short|hold neutral):?$/i.test(cleaned)) {
    return fallback;
  }
  return cleaned;
};

const candidatePriorityLabel = (score: number) => {
  if (score >= 7) return "High";
  if (score >= 5.5) return "Review";
  return "Low";
};

const linkedPositionForRecord = (
  record: ThesisRecord,
  positionById: Map<string, FullAutoPaperPosition>,
  positionByThesisId: Map<string, FullAutoPaperPosition>,
) =>
  (record.paperPositionId ? positionById.get(record.paperPositionId) : null) ??
  positionByThesisId.get(record.id) ??
  null;

const isActiveExposureRecord = (
  record: ThesisRecord,
  position: FullAutoPaperPosition | null,
) =>
  record.recommendation !== "hold-neutral" &&
  position?.status === "open" &&
  position.thesisStatus === "active" &&
  position.nextAction === "Hold" &&
  record.monitoringState === "active";

const candidateActionLabel = ({
  candidate,
  position,
  record,
}: {
  candidate: FullAutoCandidate;
  position: FullAutoPaperPosition | null;
  record: ThesisRecord | null;
}) => {
  if (!record) return candidate.status === "queued" ? "Work up" : "Review";
  if (
    record.monitoringState === "broken" ||
    position?.thesisStatus === "broken" ||
    position?.nextAction === "Exit"
  ) {
    return "Re-underwrite";
  }
  if (
    record.monitoringState === "weakened" ||
    position?.thesisStatus === "weakened" ||
    position?.nextAction === "Revisit"
  ) {
    return "Revisit";
  }
  return "Monitor";
};

const thesisStateLabel = (
  record: ThesisRecord,
  position: FullAutoPaperPosition | null,
) => {
  if (record.recommendation === "hold-neutral") return "Watch";
  if (!position) return titleCaseStatus(record.riskDecision);
  if (position.status === "closed") {
    return position.thesisStatus === "broken" ? "Closed / Broken" : "Closed";
  }
  if (position.thesisStatus !== "active") return titleCaseStatus(position.thesisStatus);
  return position.nextAction;
};

const targetGrossPctFor = (run: FullAutoRun) =>
  run.riskLimits.targetGrossExposurePct ??
  Math.min(70, run.riskLimits.maxGrossExposurePct);

const daysBetween = (from: string, to: string) =>
  Math.max(
    0,
    (new Date(to).getTime() - new Date(from).getTime()) / (24 * 60 * 60 * 1000),
  );

const average = (values: number[]) =>
  values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;

const maxDrawdownFor = (values: number[]) => {
  let peak = values[0] ?? 0;
  let maxDrawdown = 0;

  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, (value - peak) / peak);
    }
  }

  return maxDrawdown;
};

const contributionByTicker = (positions: FullAutoPaperPosition[]) =>
  [...positions.reduce((map, position) => {
    const existing = map.get(position.ticker) ?? {
      pnl: 0,
      size: 0,
      trades: 0,
      ticker: position.ticker,
    };
    existing.pnl += position.pnl;
    existing.size += position.initialSize || position.size;
    existing.trades += 1;
    map.set(position.ticker, existing);
    return map;
  }, new Map<string, { pnl: number; size: number; ticker: string; trades: number }>()).values()]
    .sort((left, right) => Math.abs(right.pnl) - Math.abs(left.pnl))
    .slice(0, 5);

const journalEntriesForDisplay = (run: FullAutoRun) => {
  const materialPattern =
    /PM |Validation|Risk|Desk|Monitor|opened|added|trimmed|exited|approved|sent back|weakened|broken|recheck|re-underwrite/i;
  const selected: FullAutoRun["journal"] = [];
  const seen = new Set<string>();
  let includedMorningBrief = false;

  for (const entry of run.journal) {
    const isMorningBrief = entry.title === "Morning Brief";
    const isMaterial =
      materialPattern.test(`${entry.title} ${entry.body}`) || isMorningBrief;

    if (!isMaterial) continue;
    if (isMorningBrief && includedMorningBrief) continue;

    const body = displayDeskCopy(entry.body);
    if (!body) continue;

    const key = [
      entry.title,
      entry.relatedTicker ?? "market",
      body.toLowerCase().replace(/\$[\d,]+/g, "$").slice(0, 90),
    ].join("|");
    if (seen.has(key)) continue;

    seen.add(key);
    if (isMorningBrief) includedMorningBrief = true;
    selected.push({ ...entry, body });
    if (selected.length >= 10) break;
  }

  if (selected.length) return selected;
  return run.journal
    .map((entry) => ({ ...entry, body: displayDeskCopy(entry.body) }))
    .filter((entry) => entry.body)
    .slice(0, 10);
};

const buildDeskScorecard = ({
  closedPositions,
  openPositions,
  run,
}: {
  closedPositions: FullAutoPaperPosition[];
  openPositions: FullAutoPaperPosition[];
  run: FullAutoRun;
}) => {
  const totalReturn =
    (run.portfolio.netLiquidationValue - run.portfolio.startingCapital) /
    run.portfolio.startingCapital;
  const curve = run.portfolio.equityCurve.filter((point) => point.value > 0);
  const avgGrossExposure =
    average(curve.map((point) => point.grossExposure / point.value)) ?? 0;
  const avgNetExposure =
    average(
      curve.map((point) => {
        const netExposure =
          "netExposure" in point && typeof point.netExposure === "number"
            ? point.netExposure
            : point.grossExposure;
        return netExposure / point.value;
      }),
    ) ?? 0;
  const avgCashPct = average(curve.map((point) => point.cash / point.value)) ?? 0;
  const openPositionSteps = new Set(
    run.paperPositions.map((position) => position.openedAt),
  );
  const workupSteps = new Set(
    run.thesisRecords.map((record) => record.simulationTime),
  );
  const noOpenWorkupPct = workupSteps.size
    ? [...workupSteps].filter((step) => !openPositionSteps.has(step)).length /
      workupSteps.size
    : 0;
  const maxDrawdown = maxDrawdownFor(
    run.portfolio.equityCurve.map((point) => point.value),
  );
  const allPositions = [...openPositions, ...closedPositions];
  const markedPositions = allPositions.filter(
    (position) =>
      position.status === "closed" ||
      Math.abs(position.pnl) >= 1 ||
      Math.abs(position.currentPrice - position.entryPrice) >= 0.01,
  );
  const winners = markedPositions.filter((position) => position.pnl > 0);
  const losers = markedPositions.filter((position) => position.pnl < 0);
  const evaluatedPositions = winners.length + losers.length;
  const winRate = evaluatedPositions ? winners.length / evaluatedPositions : null;
  const averageWinner = average(winners.map((position) => position.pnl));
  const averageLoser = average(losers.map((position) => Math.abs(position.pnl)));
  const winnerLoserRatio =
    averageWinner && averageLoser
      ? averageWinner / averageLoser
      : averageWinner && !averageLoser
        ? Number.POSITIVE_INFINITY
        : null;
  const brokenThesisIds = new Set(
    run.thesisRecords
      .filter((record) => record.monitoringState === "broken")
      .map((record) => record.id),
  );
  for (const position of run.paperPositions) {
    if (position.thesisStatus === "broken") {
      brokenThesisIds.add(position.thesisRecordId);
    }
  }
  const caughtBreaks = closedPositions.filter(
    (position) =>
      position.thesisStatus === "broken" ||
      position.history.some((action) => /thesis break|guardrail/i.test(action.note)),
  ).length;
  const reviewedTheses = run.thesisRecords.filter(
    (record) => record.pmDecision !== "pending" || record.riskDecision !== "pending",
  );
  const workedUpTheses = run.thesisRecords.length;
  const pmApprovedTheses = reviewedTheses.filter(
    (record) => record.pmDecision === "approved",
  );
  const riskApprovedTheses = reviewedTheses.filter((record) =>
    ["approved", "reduced"].includes(record.riskDecision),
  );
  const openedTheses = reviewedTheses.filter((record) => record.paperPositionId);
  const rejectedTheses = reviewedTheses.filter(
    (record) =>
      record.pmDecision !== "approved" ||
      !["approved", "reduced"].includes(record.riskDecision),
  );
  const rejectRate = reviewedTheses.length
    ? rejectedTheses.length / reviewedTheses.length
    : null;
  const researchedTickers = new Set([
    ...run.candidateQueue.map((candidate) => candidate.ticker),
    ...run.thesisRecords.map((record) => record.ticker),
  ]);
  const exposureBreaches = run.portfolio.equityCurve.filter((point) => {
    const exposurePct = point.value ? (point.grossExposure / point.value) * 100 : 0;
    return exposurePct > run.riskLimits.maxGrossExposurePct + 0.01;
  }).length;
  const avgHoldPeriod = average(
    allPositions.map((position) =>
      daysBetween(position.openedAt, position.closedAt ?? run.simulationTime),
    ),
  );
  const summary =
    avgGrossExposure < 0.25
      ? "Capital utilization is low; the book is mostly cash, so even good theses barely move book-level return."
      : totalReturn >= 0 && maxDrawdown > -0.1 && exposureBreaches === 0
        ? "The desk is compounding with contained drawdowns and no exposure breaches."
        : exposureBreaches > 0
        ? "The desk generated activity but breached exposure discipline."
        : "The desk remains inside limits while the paper book is still proving out.";

  return {
    avgCashPct,
    avgGrossExposure,
    avgHoldPeriod,
    avgNetExposure,
    caughtBreaks,
    contribution: contributionByTicker(run.paperPositions),
    exposureBreaches,
    funnel: {
      candidateCount: researchedTickers.size,
      openedTheses: openedTheses.length,
      pmApprovedTheses: pmApprovedTheses.length,
      reviewedTheses: reviewedTheses.length,
      riskApprovedTheses: riskApprovedTheses.length,
      workedUpTheses,
    },
    maxDrawdown,
    noOpenWorkupPct,
    rejectRate,
    summary,
    totalBreaks: brokenThesisIds.size,
    totalReturn,
    winRate,
    winnerLoserRatio,
  };
};

export default function FullAutoControlRoom() {
  const router = useRouter();
  const [run, setRun] = useState<FullAutoRun | null>(null);
  const [isStepping, setIsStepping] = useState(false);
  const [activityCursor, setActivityCursor] = useState(0);
  const [dedalusRuntime, setDedalusRuntime] =
    useState<DedalusRuntimeStatus | null>(null);

  const openPositions = useMemo(
    () => run?.paperPositions.filter((position) => position.status === "open") ?? [],
    [run],
  );
  const closedPositions = useMemo(
    () => run?.paperPositions.filter((position) => position.status === "closed") ?? [],
    [run],
  );
  const positionById = useMemo(
    () => new Map(run?.paperPositions.map((position) => [position.id, position]) ?? []),
    [run],
  );
  const positionByThesisId = useMemo(
    () =>
      new Map(
        run?.paperPositions.map((position) => [position.thesisRecordId, position]) ??
          [],
      ),
    [run],
  );
  const thesisByTicker = useMemo(() => {
    const byTicker = new Map<string, ThesisRecord>();
    for (const record of run?.thesisRecords ?? []) {
      if (!byTicker.has(record.ticker)) {
        byTicker.set(record.ticker, record);
      }
    }
    return byTicker;
  }, [run]);
  const actionableCandidates = useMemo(() => {
    if (!run) return [];
    return run.candidateQueue
      .filter((candidate) => {
        const record = thesisByTicker.get(candidate.ticker) ?? null;
        const position = record
          ? linkedPositionForRecord(record, positionById, positionByThesisId)
          : null;
        const action = candidateActionLabel({ candidate, position, record });
        return !record || (record.recommendation !== "hold-neutral" && action !== "Monitor");
      })
      .slice(0, 8);
  }, [positionById, positionByThesisId, run, thesisByTicker]);
  const activeExposureRecords = useMemo(() => {
    if (!run) return [];
    return run.thesisRecords
      .filter((record) =>
        isActiveExposureRecord(
          record,
          linkedPositionForRecord(record, positionById, positionByThesisId),
        ),
      )
      .slice(0, 8);
  }, [positionById, positionByThesisId, run]);
  const watchRevisitRecords = useMemo(() => {
    if (!run) return [];
    return run.thesisRecords
      .filter((record) => {
        const position = linkedPositionForRecord(record, positionById, positionByThesisId);
        if (isActiveExposureRecord(record, position)) return false;
        return (
          record.recommendation === "hold-neutral" ||
          record.monitoringState !== "active" ||
          !position ||
          position.status !== "open" ||
          position.thesisStatus !== "active" ||
          position.nextAction !== "Hold"
        );
      })
      .sort((left, right) => {
        const severity = (record: ThesisRecord) => {
          const position = linkedPositionForRecord(record, positionById, positionByThesisId);
          if (record.monitoringState === "broken" || position?.thesisStatus === "broken") {
            return 4;
          }
          if (record.monitoringState === "weakened" || position?.thesisStatus === "weakened") {
            return 3;
          }
          if (record.recommendation === "hold-neutral") return 2;
          return 1;
        };
        return severity(right) - severity(left);
      })
      .slice(0, 8);
  }, [positionById, positionByThesisId, run]);
  const scorecard = useMemo(
    () =>
      run
        ? buildDeskScorecard({
            closedPositions,
            openPositions,
            run,
          })
        : null,
    [closedPositions, openPositions, run],
  );
  const equitySeries = useMemo(
    () => ({
      fromLabel: run?.portfolio.equityCurve[0]?.label ?? "Start",
      toLabel: run?.portfolio.equityCurve.at(-1)?.label ?? "Now",
      points:
        run?.portfolio.equityCurve.map((point) => ({
          date: point.date,
          label: point.label,
          value: point.value,
        })) ?? [],
    }),
    [run],
  );
  const bookPhase = useMemo(() => {
    if (!run) return null;
    const grossTarget = targetGrossPctFor(run);
    const staleOpenCount = openPositions.filter(
      (position) =>
        (position.lastPriceKnownAt ?? position.openedAt) === position.openedAt &&
        position.currentPrice === position.entryPrice,
    ).length;
    const isBuilding =
      run.portfolio.grossExposurePct < grossTarget - 1 || staleOpenCount > openPositions.length / 2;

    return {
      label: isBuilding ? "Building Book" : "Marking Book",
      detail: isBuilding
        ? "Fresh positions start at $0 until the next visible price mark."
        : "Open positions are updating against visible event marks.",
    };
  }, [openPositions, run]);
  const deskActivityEvents = useMemo(() => {
    if (!run) return [];

    const currentStepEvents = run.agentEvents.filter(
      (event) =>
        event.simulationTime === run.simulationTime &&
        event.role !== "Journal Agent",
    );
    if (currentStepEvents.some((event) => richActivityRoles.has(event.role))) {
      return currentStepEvents;
    }

    const groupedByStep = new Map<string, FullAutoAgentEvent[]>();
    for (const event of run.agentEvents) {
      if (event.role === "Journal Agent") continue;
      const group = groupedByStep.get(event.simulationTime) ?? [];
      group.push(event);
      groupedByStep.set(event.simulationTime, group);
    }
    const latestRichStep = [...groupedByStep.values()].find((events) =>
      events.some((event) => richActivityRoles.has(event.role)),
    );
    if (latestRichStep?.length) return latestRichStep;
    if (currentStepEvents.length) return currentStepEvents;

    return run.agentEvents
      .filter((event) => event.role !== "Journal Agent")
      .slice(0, 12);
  }, [run]);
  const deskActivitySignature = useMemo(
    () => deskActivityEvents.map((event) => event.id).join("|"),
    [deskActivityEvents],
  );
  const deskActivityStages = useMemo(
    () =>
      workflowStages.filter((stage) =>
        deskActivityEvents.some((event) => roleStage[event.role] === stage),
      ),
    [deskActivityEvents],
  );
  useEffect(() => {
    setActivityCursor(0);
  }, [deskActivitySignature]);
  useEffect(() => {
    if (!deskActivityStages.length) return;
    if (run?.status === "complete") {
      setActivityCursor(deskActivityStages.length - 1);
      return;
    }
    if (deskActivityStages.length < 2) return;

    const interval = window.setInterval(() => {
      setActivityCursor((cursor) => (cursor + 1) % deskActivityStages.length);
    }, isStepping || run?.status === "running" ? 560 : 980);

    return () => window.clearInterval(interval);
  }, [deskActivitySignature, deskActivityStages, isStepping, run?.status]);
  const activeWorkflowStage = deskActivityStages.length
    ? deskActivityStages[activityCursor % deskActivityStages.length]
    : "Morning Brief";
  const activeActivityEvent =
    deskActivityEvents.find(
      (event) => roleStage[event.role] === activeWorkflowStage,
    ) ??
    deskActivityEvents[0] ??
    null;
  const currentFocus = useMemo(() => {
    if (!run) return null;

    const currentStepEvents = run.agentEvents.filter(
      (event) => event.simulationTime === run.simulationTime,
    );
    const eventScope = currentStepEvents.length ? currentStepEvents : run.agentEvents;
    const activeEvent =
      [...eventScope].reverse().find((event) => event.role !== "Journal Agent") ??
      eventScope[0];
    const currentStepJournal = run.journal.filter(
      (entry) => entry.simulationTime === run.simulationTime,
    );
    const latestMaterialAction = currentStepJournal.at(-1) ?? run.journal[0];
    const activePosition = openPositions[0] ?? run.paperPositions[0];
    const activeThesis =
      run.thesisRecords.find((record) => record.id === activePosition?.thesisRecordId) ??
      run.thesisRecords[0];
    const activeCandidate =
      run.candidateQueue.find((candidate) => candidate.status === "queued") ??
      run.candidateQueue[0];
    const phase = activeEvent ? roleStage[activeEvent.role] : "Morning Brief";
    const status = activePosition
      ? `${activePosition.nextAction} / ${titleCaseStatus(activePosition.thesisStatus)}`
      : activeThesis
        ? `${titleCaseStatus(activeThesis.pmDecision)} / ${titleCaseStatus(activeThesis.riskDecision)}`
        : titleCaseStatus(run.status);

    return {
      ticker: activePosition?.ticker ?? activeThesis?.ticker ?? activeCandidate?.ticker ?? "Market",
      phase,
      recommendation: activeThesis
        ? recommendationLabel(activeThesis.recommendation)
        : activePosition
          ? titleCaseStatus(activePosition.side)
        : "n/a",
      status,
      lastAction: latestMaterialAction?.title ?? activeEvent?.message ?? "Waiting to start.",
    };
  }, [openPositions, run]);
  const currentValidation = useMemo(() => {
    if (!run) return null;
    const ticker = currentFocus?.ticker;
    return (
      run.thesisRecords.find(
        (record) => record.ticker === ticker && record.validation,
      )?.validation ??
      run.thesisRecords.find((record) => record.validation)?.validation ??
      null
    );
  }, [currentFocus?.ticker, run]);
  const latestOpenClawProof = dedalusRuntime?.proof.latestOpenClawProof ?? null;
  const displayJournal = useMemo(
    () => (run ? journalEntriesForDisplay(run) : []),
    [run],
  );

  const loadDedalusRuntime = useCallback(async () => {
    try {
      const response = await fetch("/api/dedalus/runtime");
      const payload = (await response.json()) as {
        success?: boolean;
        runtime?: DedalusRuntimeStatus;
      };
      if (response.ok && payload.success && payload.runtime) {
        setDedalusRuntime(payload.runtime);
      }
    } catch {
      // Dedalus is optional; Full Auto stays local when unavailable.
    }
  }, []);

  const dispatch = useCallback(async (command: FullAutoStepCommand) => {
    if (!run || isStepping) return;
    setIsStepping(true);
    try {
      const response = await fetch("/api/full-auto/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          executionMode: "hybrid",
          run,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        run?: FullAutoRun;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.run) {
        throw new Error(payload.error ?? "Full Auto step failed.");
      }
      upsertFullAutoRun(payload.run);
      setRun(payload.run);
      void loadDedalusRuntime();
    } catch (error) {
      const failedRun = {
        ...run,
        status: "failed" as const,
        error: error instanceof Error ? error.message : "Full Auto step failed.",
      };
      upsertFullAutoRun(failedRun);
      setRun(failedRun);
    } finally {
      setIsStepping(false);
    }
  }, [isStepping, loadDedalusRuntime, run]);

  useEffect(() => {
    const cachedRun = getOrCreateLatestFullAutoRun();
    setRun(cachedRun);

    let cancelled = false;
    const loadSharedRun = async () => {
      try {
        const response = await fetch("/api/full-auto/run");
        const payload = (await response.json()) as {
          success?: boolean;
          run?: FullAutoRun;
        };
        if (!cancelled && response.ok && payload.success && payload.run) {
          upsertFullAutoRun(payload.run);
          setRun(payload.run);
        }
      } catch {
        // Local cache remains the fallback when the shared runtime is unavailable.
      }
    };

    void loadSharedRun();
    void loadDedalusRuntime();
    return () => {
      cancelled = true;
    };
  }, [loadDedalusRuntime]);

  useEffect(() => {
    if (!run || run.status !== "running" || isStepping) return;
    if (new Date(run.simulationTime).getTime() >= new Date(run.endDate).getTime()) {
      return;
    }
    const timer = window.setTimeout(() => {
      void dispatch("step_event");
    }, 6200);
    return () => window.clearTimeout(timer);
  }, [dispatch, isStepping, run]);

  const resetRun = async () => {
    if (isStepping) return;
    setIsStepping(true);
    try {
      const response = await fetch("/api/full-auto/run/reset", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        run?: FullAutoRun;
      };
      if (!response.ok || !payload.success || !payload.run) {
        throw new Error("Could not reset Full Auto run.");
      }
      upsertFullAutoRun(payload.run);
      setRun(payload.run);
    } catch (error) {
      if (run) {
        const failedRun = {
          ...run,
          status: "failed" as const,
          error:
            error instanceof Error
              ? error.message
              : "Could not reset Full Auto run.",
        };
        upsertFullAutoRun(failedRun);
        setRun(failedRun);
      }
    } finally {
      setIsStepping(false);
    }
  };

  const openThesis = async (record: ThesisRecord) => {
    if (!run) return;
    try {
      await fetch("/api/full-auto/open-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesisRecord: record }),
      }).catch(() => null);
      const sessionId = openThesisRecordInSession({ record, run });
      const nextRun = {
        ...run,
        openedSessionIds: {
          ...run.openedSessionIds,
          [record.id]: sessionId,
        },
      };
      upsertFullAutoRun(nextRun);
      setRun(nextRun);
      router.push(`/sessions/${sessionId}`);
    } catch (error) {
      const failedRun = {
        ...run,
        status: "failed" as const,
        error:
          error instanceof Error
            ? error.message
            : "Could not open thesis workspace.",
      };
      upsertFullAutoRun(failedRun);
      setRun(failedRun);
    }
  };

  if (!run) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f8fb] text-sm text-slate-500">
        Loading Full Auto.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] px-5 py-5 text-[#0a2259] sm:px-7">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#d9e0e8] pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Full Auto
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#0a2259]">
              Historical investment-firm simulation.
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Timestamped replay pack. Paper positions only. Not live execution or an audited backtest.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={resetRun}
              disabled={isStepping}
              className="rounded-md border border-[#d9e0e8] bg-white px-3 py-2 text-sm font-semibold text-[#0a2259] shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              Refresh
            </button>
            {(["start", "pause", "step_day", "step_event", "fast_forward"] as const).map(
              (command) => (
                <button
                  key={command}
                  type="button"
                  onClick={() => dispatch(command)}
                  disabled={isStepping || (command === "pause" && run.status !== "running")}
                  className={cn(
                    "rounded-md border border-[#d9e0e8] bg-white px-3 py-2 text-sm font-semibold text-[#0a2259] shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300",
                    command === "start" &&
                      "border-[#0a2259] bg-white text-black hover:bg-slate-50",
                  )}
                >
                  {isStepping && command !== "pause" ? "Working" : commandLabel[command]}
                </button>
              ),
            )}
          </div>
        </header>

        {equitySeries.points.length > 1 ? (
          <section className="mt-4">
            <EquityLineChart
              title="Walk-forward Paper Equity Curve"
              series={equitySeries}
              formatValue={fmtMoney}
            />
            {scorecard?.contribution.length ? (
              <ContributionChips contribution={scorecard.contribution} />
            ) : null}
          </section>
        ) : null}

        <section className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <div className="grid items-start gap-4 xl:grid-cols-[0.85fr_1fr]">
              <Panel>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Simulation Clock
                    </p>
                    <p className="mt-2 text-3xl font-semibold">
                      {fmtDate(run.simulationTime)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded border px-2 py-1 text-xs font-semibold capitalize",
                      run.status === "running" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                      run.status === "paused" && "border-amber-200 bg-amber-50 text-amber-700",
                      run.status === "idle" && "border-slate-200 bg-slate-50 text-slate-500",
                      run.status === "failed" && "border-red-200 bg-red-50 text-red-700",
                      run.status === "complete" && "border-slate-300 bg-slate-100 text-slate-700",
                    )}
                  >
                    {run.status}
                  </span>
                </div>

                <div className="mt-5 border border-[#d9e0e8] bg-[#f8fafc] p-4">
                  {run.status === "running" || isStepping ? (
                    <div className="relative h-24 overflow-hidden">
                      {[0, 1, 2, 3].map((paper) => (
                        <motion.div
                          key={paper}
                          className="absolute left-4 top-3 h-16 w-28 border border-[#cfd7e2] bg-white p-3 shadow-sm"
                          animate={{
                            x: [paper * 16, paper * 16 + 30, paper * 16],
                            rotate: [-5 + paper * 2, 1 + paper * 2, -5 + paper * 2],
                            y: [paper * 3, paper * 3 - 5, paper * 3],
                          }}
                          transition={{
                            delay: paper * 0.12,
                            duration: 1.6,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                        >
                          <div className="h-1.5 w-14 bg-[#0a2259]" />
                          <div className="mt-3 space-y-1.5">
                            <div className="h-px w-20 bg-slate-300" />
                            <div className="h-px w-16 bg-slate-300" />
                            <div className="h-px w-24 bg-slate-300" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Latest Brief
                      </p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {displayDeskCopy(run.currentBrief?.summary) ||
                          "Start the simulation to scan visible sources."}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    Morning Brief
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    {displayDeskCopy(run.currentBrief?.headline) || "Not started."}
                  </p>
                </div>
              </Panel>

              <Panel>
                <SectionTitle
                  title="Current Focus"
                  detail="What the desk is working on right now."
                />
                {latestOpenClawProof?.status === "remote_success" ? (
                  <div className="mt-4 inline-flex rounded border border-[#b9c7da] bg-[#eef3fb] px-2.5 py-1 text-xs font-semibold text-[#0a2259]">
                    Executed by OpenClaw on Dedalus
                  </div>
                ) : null}
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Metric label="Ticker" value={currentFocus?.ticker ?? "Market"} />
                  <Metric label="Phase" value={activeWorkflowStage} />
                  <Metric
                    label="Recommendation"
                    value={currentFocus?.recommendation ?? "n/a"}
                  />
                  <Metric label="Status" value={currentFocus?.status ?? titleCaseStatus(run.status)} />
                </div>
                <div className="mt-4 border border-[#e1e6ee] px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Last Action
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {currentFocus?.lastAction ?? "Waiting to start."}
                  </p>
                </div>
                <ValidationCard validation={currentValidation} />
              </Panel>
            </div>

            <Panel>
              <div className="flex items-center justify-between">
                <SectionTitle title="Desk Activity" detail="Bounded replay steps. No future data." />
                <span className="text-xs text-slate-400">{run.agentEvents.length} events</span>
              </div>
              <WorkflowStrip
                activeEvent={activeActivityEvent}
                activeStage={activeWorkflowStage}
              />
              <ActivityFeed
                activeEventId={activeActivityEvent?.id}
                events={deskActivityEvents}
              />
            </Panel>

            <div className="grid items-start gap-4 xl:grid-cols-3">
              <Panel>
                <SectionTitle title="Candidate Queue" detail="New workups and re-underwrites only." />
                <div className="mt-4 space-y-2">
                  {actionableCandidates.length ? (
                    actionableCandidates.map((candidate) => {
                      const record = thesisByTicker.get(candidate.ticker) ?? null;
                      const position = record
                        ? linkedPositionForRecord(record, positionById, positionByThesisId)
                        : null;
                      return (
                        <div
                          key={candidate.id}
                          className="grid gap-3 border border-[#e1e6ee] px-3 py-3 md:grid-cols-[70px_1fr_94px] xl:grid-cols-1"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-mono text-sm font-semibold">{candidate.ticker}</p>
                            <div className="flex shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                              <span>{candidatePriorityLabel(candidate.score)}</span>
                              <span>{candidateActionLabel({ candidate, position, record })}</span>
                            </div>
                          </div>
                          <p className="text-sm leading-6 text-slate-600">
                            {deskCopyOrFallback(
                              candidate.reason,
                              `${candidate.companyName} has a visible event that may deserve underwriting.`,
                            )}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <EmptyText>No new or revisit-worthy names.</EmptyText>
                  )}
                </div>
              </Panel>

              <Panel>
                <SectionTitle title="Active Positions" detail="Open, intact thesis exposure." />
                <div className="mt-4 space-y-2">
                  {activeExposureRecords.length ? (
                    activeExposureRecords.map((record) => {
                      const position = linkedPositionForRecord(
                        record,
                        positionById,
                        positionByThesisId,
                      );
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => openThesis(record)}
                          className="w-full border border-[#e1e6ee] px-3 py-3 text-left transition-colors hover:bg-slate-50"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="font-mono text-sm font-semibold">
                              {record.ticker} — {recommendationLabel(record.recommendation)}
                            </p>
                            <p className="text-sm font-semibold text-emerald-700">
                              {position ? fmtMoney(position.pnl) : "$0"}{" "}
                              {position ? fmtPct(position.returnPct) : "+0.0%"}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {deskCopyOrFallback(
                              record.oneLineThesis,
                              record.variantView.weBelieve,
                            )}
                          </p>
                        </button>
                      );
                    })
                  ) : (
                    <EmptyText>No intact open exposure.</EmptyText>
                  )}
                </div>
              </Panel>

              <Panel>
                <SectionTitle title="Watch / Revisit" detail="Neutral, weakened, broken, or challenged." />
                <div className="mt-4 space-y-2">
                  {watchRevisitRecords.length ? (
                    watchRevisitRecords.map((record) => {
                      const position = linkedPositionForRecord(
                        record,
                        positionById,
                        positionByThesisId,
                      );
                      return (
                        <button
                          key={record.id}
                          type="button"
                          onClick={() => openThesis(record)}
                          className="w-full border border-[#e1e6ee] px-3 py-3 text-left transition-colors hover:bg-slate-50"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="font-mono text-sm font-semibold">
                              {record.ticker} — {recommendationLabel(record.recommendation)}
                            </p>
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {thesisStateLabel(record, position)}
                            </p>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {deskCopyOrFallback(
                              record.oneLineThesis,
                              record.variantView.weBelieve,
                            )}
                          </p>
                        </button>
                      );
                    })
                  ) : (
                    <EmptyText>No watch or revisit names.</EmptyText>
                  )}
                </div>
              </Panel>
            </div>
          </div>

          <div className="space-y-4">
            <Panel>
              <SectionTitle title="Risk Limits / Book State" detail={run.strategyProfile} />
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Metric label="Starting Capital" value={fmtMoney(run.portfolio.startingCapital)} />
                <Metric label="Book Equity" value={fmtMoney(run.portfolio.netLiquidationValue)} />
                <Metric label="Cash" value={fmtMoney(run.portfolio.cash)} />
                <Metric label="Open Positions" value={`${openPositions.length}`} />
                <Metric label="Max Position" value={`${run.riskLimits.maxPositionPct}%`} />
                <Metric label="Target Gross" value={`${targetGrossPctFor(run)}%`} />
                <Metric label="Max Gross" value={`${run.riskLimits.maxGrossExposurePct}%`} />
                <Metric label="Current Gross" value={`${run.portfolio.grossExposurePct.toFixed(1)}%`} />
                <Metric label="P&L" value={fmtMoney(run.portfolio.realizedPnl + run.portfolio.unrealizedPnl)} />
              </div>
            </Panel>

            <Panel>
              <SectionTitle
                title="Open Positions"
                detail={`${openPositions.length} open / ${closedPositions.length} closed.`}
              />
              {bookPhase ? (
                <div className="mt-4 border border-[#e1e6ee] bg-[#f8fafc] px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Phase: {bookPhase.label}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {bookPhase.detail}
                  </p>
                </div>
              ) : null}
              <div className="mt-4 space-y-2">
                {openPositions.length ? (
                  openPositions.map((position) => (
                    <PositionCard key={position.id} position={position} />
                  ))
                ) : (
                  <EmptyText>No paper positions yet.</EmptyText>
                )}
              </div>
            </Panel>
          </div>
        </section>

        {scorecard ? (
          <DeskScorecard
            endLabel={fmtDate(run.simulationTime)}
            openPositions={openPositions.length}
            scorecard={scorecard}
            startLabel={fmtDate(run.startDate)}
          />
        ) : null}

        <Panel className="mt-4">
          <SectionTitle title="Audit Journal" detail="Every material action gets logged." />
          <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
            {displayJournal.length ? (
              displayJournal.map((entry) => (
                <div key={entry.id} className="border border-[#e1e6ee] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{entry.title}</p>
                    <p className="text-xs text-slate-400">{fmtDate(entry.simulationTime)}</p>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {entry.body}
                  </p>
                </div>
              ))
            ) : (
              <EmptyText>No journal entries yet.</EmptyText>
            )}
          </div>
          {run.error ? <p className="mt-4 text-sm font-semibold text-red-700">{run.error}</p> : null}
        </Panel>
      </div>
    </main>
  );
}

const Panel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("bg-white p-5 shadow-sm ring-1 ring-[#d9e0e8]", className)}>
    {children}
  </section>
);

const SectionTitle = ({ detail, title }: { detail: string; title: string }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
      {title}
    </p>
    <p className="mt-1 text-sm text-slate-500">{detail}</p>
  </div>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-[#e1e6ee] px-3 py-3">
    <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
    <p className="mt-1 text-xl font-semibold">{value}</p>
  </div>
);

const ValidationCard = ({
  validation,
}: {
  validation: ThesisRecord["validation"];
}) => {
  if (!validation) {
    return (
      <div className="mt-4 border border-[#e1e6ee] px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Prior-Window Validation
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Runs after PM Synth and before Risk Gate.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 border border-[#e1e6ee] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Prior-Window Validation
        </p>
        <span
          className={cn(
            "border px-2 py-1 text-xs font-semibold capitalize",
            validation.status === "supportive" &&
              "border-emerald-200 bg-emerald-50 text-emerald-700",
            validation.status === "mixed" &&
              "border-amber-200 bg-amber-50 text-amber-700",
            validation.status === "weak" &&
              "border-red-200 bg-red-50 text-red-700",
            validation.status === "insufficient" &&
              "border-slate-200 bg-slate-50 text-slate-600",
          )}
        >
          {validation.status}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Lookback" value={`${validation.lookbackDays}d`} />
        <Metric label="Obs" value={`${validation.observationCount}`} />
        <Metric
          label="Median"
          value={fmtMaybePct(validation.medianForwardReturn)}
        />
        <Metric label="Win Rate" value={fmtMaybePct(validation.winRate)} />
        <Metric
          label="Max DD"
          value={fmtMaybePct(validation.maxDrawdown)}
        />
        <Metric label="Sources" value={`${validation.sourceIds.length}`} />
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {validation.verdict}
      </p>
    </div>
  );
};

const PositionCard = ({ position }: { position: FullAutoPaperPosition }) => {
  const lastPriceKnownAt = position.lastPriceKnownAt ?? position.openedAt;
  const awaitingNextMark =
    lastPriceKnownAt === position.openedAt &&
    position.currentPrice === position.entryPrice;
  const actionLabel: Record<FullAutoPaperPosition["nextAction"], string> = {
    Add: "Add",
    Exit: "Exit",
    Hold: "Hold",
    Revisit: "Revisit",
    Trim: "Trim",
  };

  return (
    <div className="border border-[#e1e6ee] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-mono text-sm font-semibold">
          {position.ticker} {position.side.toUpperCase()}
        </p>
        <p
          className={cn(
            "whitespace-nowrap text-sm font-semibold tabular-nums",
            position.pnl >= 0 ? "text-emerald-700" : "text-red-700",
          )}
        >
          {fmtMoney(position.pnl)} {fmtPct(position.returnPct)}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <PositionStat label="Entry" value={`$${position.entryPrice.toFixed(2)}`} />
        <PositionStat label="Current" value={`$${position.currentPrice.toFixed(2)}`} />
        <PositionStat label="Action" value={actionLabel[position.nextAction]} />
        <PositionStat label="Events" value={`${position.history.length}`} />
      </div>
      <p className="mt-2 text-xs font-semibold text-slate-400">
        {awaitingNextMark
          ? "Awaiting next price mark"
          : `Marked ${fmtDate(lastPriceKnownAt)}`}
      </p>
    </div>
  );
};

const PositionStat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 border border-[#edf1f5] bg-[#fbfcfe] px-2 py-1.5">
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
      {label}
    </p>
    <p className="mt-0.5 truncate font-semibold tabular-nums text-[#0a2259]">
      {value}
    </p>
  </div>
);

const ActivityFeed = ({
  activeEventId,
  events,
}: {
  activeEventId?: string;
  events: FullAutoAgentEvent[];
}) => {
  const stageRows = workflowStages.flatMap((stage) => {
    const event = events.find((item) => roleStage[item.role] === stage);
    return event ? [{ event, stage }] : [];
  });

  if (!stageRows.length) {
    return <div className="mt-4"><EmptyText>Run a step to see the desk loop.</EmptyText></div>;
  }

  return (
    <div className="mt-4 overflow-hidden">
      <motion.div
        key={activeEventId ?? "idle"}
        className="space-y-1.5"
        initial={{ opacity: 0.98, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: "easeOut" }}
      >
        <AnimatePresence initial={false}>
          {stageRows.map(({ event, stage }) => (
            <motion.div
              key={stage}
              layout
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12, scale: 0.99 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cn(
                "grid min-w-0 grid-cols-[112px_132px_minmax(0,1fr)_48px] items-center gap-3 border px-3 py-2",
                event.id === activeEventId
                  ? "border-[#0a2259] bg-[#0a2259] text-white"
                  : "border-[#e1e6ee] bg-white text-[#0a2259]",
              )}
            >
              <p
                className={cn(
                  "truncate text-[11px] font-semibold uppercase tracking-[0.12em]",
                  event.id === activeEventId ? "text-white/55" : "text-slate-400",
                )}
              >
                {stage}
              </p>
              <p className="truncate text-xs font-semibold">{event.role}</p>
              <p
                className={cn(
                  "min-w-0 truncate text-sm",
                  event.id === activeEventId ? "text-white/85" : "text-slate-600",
                )}
              >
                {event.message}
              </p>
              <p
                className={cn(
                  "text-right text-xs font-semibold",
                  event.id === activeEventId ? "text-white/60" : "text-slate-400",
                )}
              >
                {event.visibleSourceIds.length} src
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

const WorkflowStrip = ({
  activeEvent,
  activeStage,
}: {
  activeEvent: FullAutoAgentEvent | null;
  activeStage?: WorkflowStage;
}) => (
  <div className="mt-4 overflow-x-auto border border-[#e1e6ee] bg-[#f8fafc] px-3 py-3">
    <div className="flex min-w-[820px] items-center gap-2">
      {workflowStages.map((stage, index) => {
        const isActive = stage === activeStage;
        const activeIndex = activeStage ? workflowStages.indexOf(activeStage) : -1;
        const isDone = activeIndex > index;

        return (
          <div key={stage} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "relative flex min-h-9 flex-1 items-center justify-center overflow-hidden border px-2 text-center text-xs font-semibold uppercase tracking-[0.12em]",
                isActive && "border-[#0a2259] bg-[#0a2259] text-white",
                isDone && "border-[#b8c2cf] bg-white text-[#0a2259]",
                !isActive && !isDone && "border-[#d9e0e8] bg-white text-slate-400",
              )}
            >
              {isActive ? (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 bg-white/14"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.7, ease: "linear" }}
                />
              ) : null}
              <span className="relative z-10">{stage}</span>
            </div>
            {index < workflowStages.length - 1 ? (
              <div className={cn("h-px w-4", isDone ? "bg-[#0a2259]" : "bg-[#cfd7e2]")} />
            ) : null}
          </div>
        );
      })}
    </div>
    {activeEvent ? (
      <motion.div
        key={activeEvent.id}
        className="mt-3 flex items-center justify-between gap-3 border border-[#e1e6ee] bg-white px-3 py-2"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <p className="truncate text-xs font-semibold text-[#0a2259]">
          {activeEvent.role}
        </p>
        <p className="shrink-0 text-xs font-semibold text-slate-400">
          {activeEvent.visibleSourceIds.length} src
        </p>
      </motion.div>
    ) : null}
  </div>
);

const DeskScorecard = ({
  endLabel,
  openPositions,
  scorecard,
  startLabel,
}: {
  endLabel: string;
  openPositions: number;
  scorecard: ReturnType<typeof buildDeskScorecard>;
  startLabel: string;
}) => (
  <Panel className="mt-4">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <SectionTitle
        title="Desk Scorecard"
        detail={`${startLabel} to ${endLabel} / curated event-mark replay`}
      />
      <p className="max-w-xl text-sm leading-6 text-slate-600">{scorecard.summary}</p>
    </div>

    <div className="mt-5 space-y-4">
      <ScorecardBand title="Capital Utilization" columns={4}>
        <ScorecardTile
          label="Avg Gross Exposure"
          tone={scorecard.avgGrossExposure < 0.25 ? "negative" : "neutral"}
          value={fmtUnsignedPct(scorecard.avgGrossExposure)}
        />
        <ScorecardTile
          label="Avg Net Exposure"
          value={fmtPct(scorecard.avgNetExposure)}
        />
        <ScorecardTile
          label="Avg Cash"
          tone={scorecard.avgCashPct > 0.7 ? "negative" : "neutral"}
          value={fmtUnsignedPct(scorecard.avgCashPct)}
        />
        <ScorecardTile
          label="No-Open Workups"
          value={fmtUnsignedPct(scorecard.noOpenWorkupPct)}
        />
      </ScorecardBand>

      <ScorecardBand title="Throughput Funnel" columns={4}>
        <ScorecardTile
          label="Candidates"
          value={`${scorecard.funnel.candidateCount}`}
        />
        <ScorecardTile
          label="Workups"
          value={`${scorecard.funnel.workedUpTheses}`}
        />
        <ScorecardTile
          label="PM Approved"
          value={`${scorecard.funnel.pmApprovedTheses} / ${scorecard.funnel.reviewedTheses}`}
        />
        <ScorecardTile
          label="Risk to Desk"
          value={`${scorecard.funnel.openedTheses} / ${scorecard.funnel.riskApprovedTheses}`}
        />
      </ScorecardBand>

      <ScorecardBand title="Performance">
        <ScorecardTile
          label="Total Return"
          tone={scorecard.totalReturn >= 0 ? "positive" : "negative"}
          value={fmtPct(scorecard.totalReturn)}
        />
        <ScorecardTile
          label="Max Drawdown"
          tone={scorecard.maxDrawdown < 0 ? "negative" : "neutral"}
          value={fmtUnsignedPct(scorecard.maxDrawdown)}
        />
        <ScorecardTile
          label="Win Rate"
          value={scorecard.winRate === null ? "n/a" : fmtUnsignedPct(scorecard.winRate)}
        />
      </ScorecardBand>

      <ScorecardBand title="Quality">
        <ScorecardTile
          label="Avg Winner / Loser"
          value={
            scorecard.winnerLoserRatio === null
              ? "n/a"
              : scorecard.winnerLoserRatio === Number.POSITIVE_INFINITY
                ? "No losers"
              : `${scorecard.winnerLoserRatio.toFixed(1)}x`
          }
        />
        <ScorecardTile
          label="Thesis Breaks Caught"
          value={`${scorecard.caughtBreaks} / ${scorecard.totalBreaks}`}
        />
        <ScorecardTile
          label="Rejected by PM / Risk"
          value={scorecard.rejectRate === null ? "n/a" : fmtUnsignedPct(scorecard.rejectRate)}
        />
      </ScorecardBand>

      <ScorecardBand title="Discipline">
        <ScorecardTile
          label="Exposure Breaches"
          tone={scorecard.exposureBreaches > 0 ? "negative" : "neutral"}
          value={`${scorecard.exposureBreaches}`}
        />
        <ScorecardTile label="Open Positions" value={`${openPositions}`} />
        <ScorecardTile
          label="Avg Hold Period"
          value={
            scorecard.avgHoldPeriod === null
              ? "n/a"
              : `${Math.round(scorecard.avgHoldPeriod)}d`
          }
        />
      </ScorecardBand>

    </div>
  </Panel>
);

const ContributionChips = ({
  contribution,
}: {
  contribution: ReturnType<typeof contributionByTicker>;
}) => (
  <div className="border-x border-b border-slate-200 bg-white px-4 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Drivers
      </p>
      {contribution.map((item) => (
        <div
          key={item.ticker}
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded border px-2.5 py-1.5 text-xs font-semibold",
            item.pnl > 0 && "border-emerald-200 bg-emerald-50 text-emerald-800",
            item.pnl < 0 && "border-red-200 bg-red-50 text-red-800",
            item.pnl === 0 && "border-slate-200 bg-slate-50 text-slate-500",
          )}
        >
          <span className="font-mono">{item.ticker}</span>
          <span>{fmtMoney(item.pnl)}</span>
          <span className="font-normal opacity-70">
            {item.size ? fmtPct(item.pnl / item.size) : "flat"}
          </span>
        </div>
      ))}
    </div>
  </div>
);

const ScorecardBand = ({
  children,
  columns = 3,
  title,
}: {
  children: ReactNode;
  columns?: 3 | 4;
  title: string;
}) => (
  <section>
    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
      {title}
    </p>
    <div
      className={cn(
        "mt-2 grid gap-2",
        columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3",
      )}
    >
      {children}
    </div>
  </section>
);

const ScorecardTile = ({
  label,
  tone = "neutral",
  value,
}: {
  label: string;
  tone?: "neutral" | "positive" | "negative";
  value: string;
}) => (
  <div className="border border-[#e1e6ee] bg-[#fbfcfe] px-3 py-3">
    <p className="text-xs font-semibold uppercase text-slate-400">{label}</p>
    <p
      className={cn(
        "mt-2 text-2xl font-semibold text-[#0a2259]",
        tone === "positive" && "text-emerald-700",
        tone === "negative" && "text-red-700",
      )}
    >
      {value}
    </p>
  </div>
);

const EmptyText = ({ children }: { children: ReactNode }) => (
  <p className="border border-dashed border-[#d9e0e8] px-3 py-6 text-center text-sm text-slate-400">
    {children}
  </p>
);

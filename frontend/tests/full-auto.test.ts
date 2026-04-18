import { describe, expect, it } from "vitest";

import { buildUnifiedLiveBook } from "@/lib/equity-live-book";
import { runAgent } from "@/lib/full-auto-agent-runtime";
import {
  FULL_AUTO_DEFAULT_UNIVERSE,
  getVisibleSources,
} from "@/lib/full-auto-historical-data";
import {
  createFullAutoRun,
  createPaperPositionFromRiskDecision,
  riskDecisionForThesis,
  runPriorWindowValidation,
  stepFullAutoRun,
} from "@/lib/full-auto-orchestrator";
import { normalizePerplexityResultsToSources } from "@/lib/full-auto-perplexity";
import type { HistoricalSource, ThesisRecord } from "@/types/full-auto";

const source = (
  ticker: string,
  knownAt: string,
  price: number,
): HistoricalSource => ({
  sourceId: `${ticker}-${knownAt}`,
  ticker,
  sourceType: "price",
  title: `${ticker} mark`,
  text: `${ticker} replay mark.`,
  publishedAt: knownAt,
  knownAt,
  asOfDate: knownAt.slice(0, 10),
  retrievedAt: knownAt,
  snapshotId: "test",
  price,
  metrics: { price },
});

const thesis = (
  overrides: Partial<ThesisRecord> = {},
): ThesisRecord => ({
  id: "thesis-1",
  ticker: "AAPL",
  companyName: "Apple Inc.",
  sector: "Technology Hardware",
  simulationTime: "2021-01-01T14:30:00.000Z",
  recommendation: "buy-long",
  conviction: 7.8,
  oneLineThesis: "AAPL source-backed thesis.",
  variantView: {
    marketBelieves: "hardware risk matters most",
    weBelieve: "services durability matters more",
    whyNow: "visible prior-window setup",
  },
  evidence: [],
  assumptions: [],
  catalysts: [],
  risks: [],
  invalidationTriggers: [],
  pmDecision: "approved",
  validation: null,
  riskDecision: "pending",
  paperPositionId: null,
  monitoringState: "not_started",
  sourceIds: [],
  ...overrides,
});

describe("Full Auto historical replay", () => {
  it("excludes future sources from visible source reads", () => {
    expect(FULL_AUTO_DEFAULT_UNIVERSE.length).toBeGreaterThanOrEqual(25);

    const sources = getVisibleSources({
      simulationTime: "2020-01-03T14:30:00.000Z",
      universe: [...FULL_AUTO_DEFAULT_UNIVERSE],
    });

    expect(sources.length).toBeGreaterThan(0);
    expect(
      sources.every(
        (source) =>
          new Date(source.knownAt).getTime() <=
          new Date("2020-01-03T14:30:00.000Z").getTime(),
      ),
    ).toBe(true);
    expect(sources.some((source) => source.knownAt.startsWith("2020-07"))).toBe(false);
  });

  it("normalizes Perplexity results into historical source snapshots", () => {
    const sources = normalizePerplexityResultsToSources({
      ticker: "AAPL",
      results: [
        {
          title: "Apple earnings context",
          url: "https://example.com/aapl",
          snippet: "Apple reported a source-backed update.",
          date: "2020-07-31",
        },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toEqual(
      expect.objectContaining({
        ticker: "AAPL",
        sourceType: "news",
        sourceUrl: "https://example.com/aapl",
        snapshotId: "perplexity-import",
      }),
    );
  });

  it("keeps agent inputs restricted to visible source ids", async () => {
    const simulationTime = "2020-03-18T14:30:00.000Z";
    const visibleSources = getVisibleSources({
      simulationTime,
      universe: ["AAPL"],
    });
    const output = await runAgent({
      role: "Morning Brief Agent",
      simulationTime,
      input: { universe: ["AAPL"] },
      visibleSources,
    });

    expect(output.event.visibleSourceIds).toEqual(
      visibleSources.map((source) => source.sourceId),
    );
  });

  it("runs prior-window validation without future leakage", () => {
    const validation = runPriorWindowValidation({
      thesis: thesis(),
      simulationTime: "2021-01-01T14:30:00.000Z",
      visibleSources: [
        source("AAPL", "2020-01-01T14:30:00.000Z", 100),
        source("AAPL", "2020-02-01T14:30:00.000Z", 104),
        source("AAPL", "2020-03-01T14:30:00.000Z", 108),
        source("AAPL", "2020-04-01T14:30:00.000Z", 112),
        source("AAPL", "2021-03-01T14:30:00.000Z", 999),
      ],
    });

    expect(validation.sourceIds).not.toContain("AAPL-2021-03-01T14:30:00.000Z");
    expect(validation.observationCount).toBeGreaterThanOrEqual(3);
    expect(validation.status).toBe("supportive");
  });

  it("marks validation insufficient when prior setup observations are sparse", () => {
    const validation = runPriorWindowValidation({
      thesis: thesis(),
      simulationTime: "2020-01-03T14:30:00.000Z",
      visibleSources: getVisibleSources({
        simulationTime: "2020-01-03T14:30:00.000Z",
        ticker: "AAPL",
      }),
    });

    expect(validation.status).toBe("insufficient");
    expect(validation.medianForwardReturn).toBeNull();
  });

  it("lets supportive longs through Risk Gate and blocks weak shorts", () => {
    expect(
      riskDecisionForThesis(
        thesis({
          validation: {
            status: "supportive",
            lookbackDays: 504,
            observationCount: 4,
            medianForwardReturn: 0.05,
            winRate: 0.75,
            maxDrawdown: -0.04,
            verdict: "Supportive.",
            sourceIds: [],
          },
        }),
      ),
    ).toBe("approved");

    expect(
      riskDecisionForThesis(
        thesis({
          recommendation: "sell-short",
          conviction: 8.3,
          validation: {
            status: "weak",
            lookbackDays: 504,
            observationCount: 4,
            medianForwardReturn: -0.03,
            winRate: 0.25,
            maxDrawdown: -0.2,
            verdict: "Weak.",
            sourceIds: [],
          },
        }),
      ),
    ).toBe("monitor_first");
  });

  it("starts a run, creates a ThesisRecord, and opens only risk-approved paper trades", async () => {
    const run = createFullAutoRun();
    const next = await stepFullAutoRun({ command: "start", run });

    expect(next.status).toBe("running");
    expect(next.currentBrief?.sourceCount).toBeGreaterThan(0);
    expect(next.thesisRecords.length).toBeGreaterThan(0);
    expect(next.thesisRecords[0]?.validation).toBeTruthy();
    expect(next.paperPositions.length).toBeGreaterThan(0);
    expect(next.thesisRecords[0]?.paperPositionId).toBe(next.paperPositions[0]?.id);
  });

  it("orders Validation Agent between PM Synth and Risk Gate", async () => {
    const run = await stepFullAutoRun({ command: "start", run: createFullAutoRun() });
    const roles = run.agentEvents.map((event) => event.role);
    const pmIndex = roles.indexOf("PM Synthesizer");
    const validationIndex = roles.indexOf("Validation Agent");
    const riskIndex = roles.indexOf("Risk Gate Agent");

    expect(pmIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeGreaterThan(pmIndex);
    expect(riskIndex).toBeGreaterThan(validationIndex);
  });

  it("does not open a paper trade before PM and Risk approval", () => {
    const pending = thesis({
      simulationTime: "2020-01-02T14:30:00.000Z",
      pmDecision: "pending",
      riskDecision: "pending",
    });

    expect(createPaperPositionFromRiskDecision(pending, createFullAutoRun())).toBeNull();
    expect(
      createPaperPositionFromRiskDecision(
        thesis({
          simulationTime: "2020-01-02T14:30:00.000Z",
          riskDecision: "approved",
          validation: null,
        }),
        createFullAutoRun(),
      ),
    ).toBeNull();
  });

  it("merges Full Auto positions into the unified Live Book", async () => {
    const run = await stepFullAutoRun({
      command: "start",
      run: createFullAutoRun(),
    });
    const book = buildUnifiedLiveBook({
      sessions: [],
      fullAutoRuns: [run],
    });

    expect(book.openPositions[0]?.sourceLabel).toBe("Full Auto");
    expect(book.thesisPipeline[0]?.sourceLabel).toBe("Full Auto");
    expect(book.totals.grossNotional).toBeGreaterThan(0);
  });

  it("walks forward as a persistent paper book with exposure limits and action history", async () => {
    let run = createFullAutoRun();
    run = await stepFullAutoRun({ command: "start", run });
    for (let index = 0; index < 16; index += 1) {
      run = await stepFullAutoRun({ command: "fast_forward", run });
    }

    expect(new Date(run.simulationTime).getFullYear()).toBeGreaterThanOrEqual(2023);
    expect(run.portfolio.equityCurve.length).toBeGreaterThan(1);
    expect(run.portfolio.openPositionCount).toBeLessThanOrEqual(
      run.riskLimits.maxOpenPositions,
    );
    expect(run.portfolio.grossExposurePct).toBeLessThanOrEqual(
      run.riskLimits.maxGrossExposurePct + 0.01,
    );
    expect(run.portfolio.equityCurve.at(-1)?.netExposure).toBeDefined();
    expect(
      Math.abs(run.portfolio.equityCurve.at(-1)?.netExposure ?? 0),
    ).toBeLessThanOrEqual(run.portfolio.equityCurve.at(-1)?.grossExposure ?? 0);
    expect(
      run.paperPositions.some((position) => position.history.length > 1),
    ).toBe(true);
  });

  it("prioritizes portfolio marks once target gross is deployed", async () => {
    const initial = createFullAutoRun();
    let run = {
      ...initial,
      riskLimits: {
        ...initial.riskLimits,
        targetGrossExposurePct: 18,
      },
    };
    run = await stepFullAutoRun({ command: "start", run });
    for (let index = 0; index < 5; index += 1) {
      run = await stepFullAutoRun({ command: "step_event", run });
    }

    expect(run.portfolio.grossExposurePct).toBeGreaterThanOrEqual(
      run.riskLimits.targetGrossExposurePct - 0.1,
    );

    const marked = await stepFullAutoRun({ command: "step_event", run });
    expect(new Date(marked.simulationTime).getTime()).toBeGreaterThan(
      new Date(run.simulationTime).getTime(),
    );
    expect(
      marked.paperPositions.some((position) => position.lastPriceKnownAt !== position.openedAt),
    ).toBe(true);
    expect(
      Math.abs(marked.portfolio.realizedPnl + marked.portfolio.unrealizedPnl),
    ).toBeGreaterThan(0);
  });
});

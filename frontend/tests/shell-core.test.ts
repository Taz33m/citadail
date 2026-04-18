import { describe, expect, it } from "vitest";

import { createAdkTools, runAdkTool } from "@/lib/adk-tools";
import {
  buildPortfolioPnlSeries,
  buildTickerPriceSeries,
} from "@/lib/equity-chart-data";
import { buildLiveBookSnapshot } from "@/lib/equity-live-book";
import { buildPmReviewPacket } from "@/lib/equity-pm-review";
import {
  buildRiskGatePacket,
  createPendingRiskGate,
} from "@/lib/equity-risk-gate";
import {
  buildTradeDeskTicket,
  openPaperPosition,
} from "@/lib/equity-trade-desk";
import { createShellSession } from "@/lib/session-repository";
import { buildWorkspaceTabs } from "@/lib/workspace-tabs";
import type { SessionArtifact, ShellSession } from "@/types/session";
import { buildReadyEquityProjectFixture } from "@/tests/utils/equity-project-fixture";

const makeSession = (artifacts: SessionArtifact[] = []): ShellSession => {
  const now = new Date("2026-01-01T00:00:00Z");
  return {
    id: "session-1",
    title: "Shell Session",
    summary: "Ready",
    status: "active",
    createdAt: now,
    updatedAt: now,
    endedAt: null,
    events: [],
    artifacts,
    snapshot: {
      activeTab: "morning-brief",
      activeArtifactId: null,
      selectedTicker: null,
      thesisDraft: null,
      equityProject: null,
      pmReview: null,
      riskGate: null,
      paperPosition: null,
      transcript: [],
    },
  };
};

describe("shell core", () => {
  it("builds morning brief, coverage desk, and artifact tabs", () => {
    const tabs = buildWorkspaceTabs({
      activeSession: makeSession([
        {
          id: "artifact-1",
          type: "text",
          title: "Memo",
          summary: "A memo",
          content: "Body",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
      ]),
    });

    expect(tabs).toEqual([
      { id: "morning-brief", label: "Morning News", kind: "morning-brief" },
      { id: "live-book", label: "Live Book", kind: "live-book" },
      { id: "coverage-desk", label: "Coverage Desk", kind: "coverage-desk" },
      {
        id: "artifact:artifact-1",
        label: "Memo",
        kind: "artifact",
        artifactId: "artifact-1",
      },
    ]);
  });

  it("adds the Thesis tab after a ticker is set", () => {
    const session = makeSession();
    const tabs = buildWorkspaceTabs({
      activeSession: {
        ...session,
        snapshot: {
          ...session.snapshot,
          selectedTicker: "AAPL",
          thesisDraft: {
            ticker: "AAPL",
            recommendation: null,
            rationale: "",
            submittedAt: null,
          },
        },
      },
    });

    expect(tabs.map((tab) => tab.id)).toEqual([
      "morning-brief",
      "live-book",
      "coverage-desk",
      "thesis",
    ]);
  });

  it("adds real file deliverable tabs after an equity project is ready", () => {
    const session = makeSession();
    const tabs = buildWorkspaceTabs({
      activeSession: {
        ...session,
        snapshot: {
          ...session.snapshot,
          selectedTicker: "AAPL",
          thesisDraft: {
            ticker: "AAPL",
            recommendation: "buy-long",
            rationale: "Services durability is underappreciated.",
            submittedAt: "2026-04-18T00:00:00.000Z",
          },
          equityProject: buildReadyEquityProjectFixture(),
        },
      },
    });

    expect(tabs.map((tab) => tab.id)).toEqual([
      "morning-brief",
      "live-book",
      "coverage-desk",
      "thesis",
      "project:memo_docx",
      "project:operating_model_xlsx",
      "project:pm_deck_pptx",
      "pm-review",
    ]);
    expect(tabs.find((tab) => tab.id === "project:memo_docx")?.iconSrc).toBe(
      "/analyst-icons/memo.png",
    );
    expect(
      tabs.find((tab) => tab.id === "project:operating_model_xlsx")?.iconSrc,
    ).toBe("/analyst-icons/model.png");
    expect(tabs.find((tab) => tab.id === "project:pm_deck_pptx")?.iconSrc).toBe(
      "/analyst-icons/deck.png",
    );
  });

  it("builds a compressed PM review packet from generated project work", () => {
    const packet = buildPmReviewPacket(buildReadyEquityProjectFixture());

    expect(packet?.ticker).toBe("AAPL");
    expect(packet?.recommendation).toBe("Buy");
    expect(packet?.conviction).toBeGreaterThanOrEqual(7);
    expect(packet?.killConditions).toHaveLength(3);
    expect(packet?.challengeQuestions).toContain(
      "What assumption is doing the most work?",
    );
  });

  it("adds Risk Gate after PM approval and builds sizing packet", () => {
    const session = makeSession();
    const project = buildReadyEquityProjectFixture();
    const pmReview = {
      projectId: project.id,
      decision: "approved_to_risk" as const,
      note: "Approved for risk sizing.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const tabs = buildWorkspaceTabs({
      activeSession: {
        ...session,
        snapshot: {
          ...session.snapshot,
          selectedTicker: "AAPL",
          equityProject: project,
          pmReview,
          riskGate: createPendingRiskGate(project.id),
        },
      },
    });
    const packet = buildRiskGatePacket(project, pmReview);

    expect(tabs.map((tab) => tab.id)).toContain("risk-gate");
    expect(packet?.ticker).toBe("AAPL");
    expect(packet?.suggestedSize).toBeTruthy();
    expect(packet?.invalidationTriggers).toHaveLength(3);
  });

  it("adds Trade Desk after risk approval and opens a paper position", () => {
    const session = makeSession();
    const project = buildReadyEquityProjectFixture();
    const pmReview = {
      projectId: project.id,
      decision: "approved_to_risk" as const,
      note: "Approved for risk sizing.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const riskGate = {
      projectId: project.id,
      decision: "approved_to_desk" as const,
      note: "Starter size approved.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const ticket = buildTradeDeskTicket(project, pmReview, riskGate);
    const position = ticket ? openPaperPosition(ticket, project.id) : null;
    const tabs = buildWorkspaceTabs({
      activeSession: {
        ...session,
        snapshot: {
          ...session.snapshot,
          selectedTicker: "AAPL",
          equityProject: project,
          pmReview,
          riskGate,
          paperPosition: position,
        },
      },
    });

    expect(tabs.map((tab) => tab.id)).toContain("trade-desk");
    expect(ticket?.ticker).toBe("AAPL");
    expect(position?.status).toBe("open");
    expect(position?.history[0]?.type).toBe("open");
  });

  it("builds Live Book from open paper positions across sessions", () => {
    const session = makeSession();
    const project = buildReadyEquityProjectFixture();
    const pmReview = {
      projectId: project.id,
      decision: "approved_to_risk" as const,
      note: "Approved for risk sizing.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const riskGate = {
      projectId: project.id,
      decision: "approved_to_desk" as const,
      note: "Starter size approved.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const ticket = buildTradeDeskTicket(project, pmReview, riskGate);
    const position = ticket ? openPaperPosition(ticket, project.id) : null;
    const book = buildLiveBookSnapshot([
      {
        ...session,
        snapshot: {
          ...session.snapshot,
          equityProject: project,
          pmReview,
          riskGate,
          paperPosition: position,
        },
      },
    ]);

    expect(book.openPositions).toHaveLength(1);
    expect(book.openPositions[0]?.ticker).toBe("AAPL");
    expect(book.thesisPipeline[0]?.stage).toBe("Trade Desk");
    expect(book.totals.grossNotional).toBeGreaterThan(0);
  });

  it("builds visual chart series for Desk and Live Book positions", () => {
    const project = buildReadyEquityProjectFixture();
    const pmReview = {
      projectId: project.id,
      decision: "approved_to_risk" as const,
      note: "Approved for risk sizing.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const riskGate = {
      projectId: project.id,
      decision: "approved_to_desk" as const,
      note: "Starter size approved.",
      decidedAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    };
    const ticket = buildTradeDeskTicket(project, pmReview, riskGate);
    const position = ticket ? openPaperPosition(ticket, project.id) : null;
    if (!position) throw new Error("Expected paper position.");
    const markedPosition = {
      ...position,
      openedAt: "2026-04-01T13:30:00.000Z",
      currentPrice: Number((position.entryPrice * 1.05).toFixed(2)),
    };
    const tickerSeries = buildTickerPriceSeries(markedPosition);
    const portfolioSeries = buildPortfolioPnlSeries([markedPosition]);

    expect(tickerSeries.points).toHaveLength(10);
    expect(tickerSeries.fromLabel).toContain("Apr 1");
    expect(tickerSeries.toLabel).toBeTruthy();
    expect(tickerSeries.points.at(-1)?.value).toBe(markedPosition.currentPrice);
    expect(portfolioSeries.points).toHaveLength(10);
    expect(portfolioSeries.points.at(-1)?.value).toBeGreaterThan(0);
  });

  it("defaults new sessions to the Morning News tab", () => {
    const session = createShellSession([], "Desk Session");

    expect(session.snapshot.activeTab).toBe("morning-brief");
    expect(session.snapshot.activeArtifactId).toBeNull();
    expect(session.snapshot.selectedTicker).toBeNull();
    expect(session.snapshot.thesisDraft).toBeNull();
    expect(session.snapshot.equityProject).toBeNull();
    expect(session.snapshot.pmReview).toBeNull();
    expect(session.snapshot.riskGate).toBeNull();
    expect(session.snapshot.paperPosition).toBeNull();
  });

  it("creates artifacts through the ADK registry", async () => {
    const artifacts: SessionArtifact[] = [];
    const tools = createAdkTools({
      createArtifact: (input) => {
        const artifact: SessionArtifact = {
          id: `artifact-${artifacts.length + 1}`,
          type: "text",
          title: input.title,
          summary: input.summary,
          content: input.content,
          metadata: input.metadata,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        };
        artifacts.push(artifact);
        return artifact;
      },
      getArtifacts: () => artifacts,
    });
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

    const output = await runAdkTool(toolMap, "create_text_artifact", {
      title: "Note",
      summary: "Neutral note",
      content: "Artifact body",
    });

    expect(output.success).toBe(true);
    expect(output.artifactId).toBe("artifact-1");
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.title).toBe("Note");
  });
});

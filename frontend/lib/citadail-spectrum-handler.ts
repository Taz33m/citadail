import { buildEquityExport } from "@/lib/equity-office-export";
import {
  formatDedalusRuntimeForPm,
  getDedalusRuntimeStatus,
} from "@/lib/dedalus-runtime";
import { createPaperPositionFromRiskDecision, recalcPortfolio, stepFullAutoRun } from "@/lib/full-auto-orchestrator";
import { runFullAutoStepWithRuntime } from "@/lib/full-auto-step-runtime";
import { getLatestPriceSnapshotAt } from "@/lib/full-auto-historical-data";
import { createEquityProjectFromThesisRecord } from "@/lib/full-auto-session-bridge";
import {
  buildBookEquityPng,
  buildPositionPng,
} from "@/lib/spectrum-desk-visuals";
import {
  loadSpectrumDeskState,
  saveSpectrumDeskState,
  setSpectrumProactiveSpace,
} from "@/lib/spectrum-desk-state";
import { fetchCurrentTickerNews } from "@/lib/ticker-news";
import type {
  FullAutoJournalEntry,
  FullAutoPaperPosition,
  FullAutoPaperTradeAction,
  FullAutoRun,
  ThesisRecord,
} from "@/types/full-auto";
import type {
  CitadailSpectrumCommand,
  CitadailSpectrumResponse,
} from "@/types/citadail-spectrum";
import type { EquityProjectArtifactType } from "@/types/session";

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fmtMoney = (value: number) =>
  value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  });

const fmtPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const fmtDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));

const paperOnlyLine = "Paper portfolio only. No live trading.";

const recLabel = (value: ThesisRecord["recommendation"]) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");

const localizeReplayCopy = (value: string) =>
  value
    .replace(/Replay mark:\s*/gi, "Visible update: ")
    .replace(/\breplay mark\b/gi, "visible mark")
    .replace(/\breplay tape\b/gi, "visible tape");

const compact = (value: string, max = 220) => {
  const clean = localizeReplayCopy(value).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
};

const helpText = [
  "Citadail command guide",
  "",
  "Start the room: Citadail start feed",
  "Check the desk: Citadail brief, book, positions, watch",
  "Check runtime: Citadail runtime, run machine step",
  "Open a name: Citadail thesis AAPL, news AAPL, chart AAPL, deck AAPL",
  "Act on paper: Citadail approve AAPL, open AAPL, trim AAPL, exit AAPL",
  "",
  paperOnlyLine,
].join("\n");

const createJournalEntry = ({
  body,
  relatedTicker,
  run,
  thesisId,
  title,
}: {
  title: string;
  body: string;
  run: FullAutoRun;
  relatedTicker?: string;
  thesisId?: string;
}): FullAutoJournalEntry => ({
  id: uid("spectrum-journal"),
  timestamp: new Date().toISOString(),
  simulationTime: run.simulationTime,
  title,
  body,
  relatedTicker,
  relatedThesisRecordId: thesisId,
  visibleSourceIds: [],
});

const createTradeAction = ({
  note,
  price,
  run,
  sizeDelta,
  type,
}: {
  type: FullAutoPaperTradeAction["type"];
  run: FullAutoRun;
  price: number;
  sizeDelta: number;
  note: string;
}): FullAutoPaperTradeAction => ({
  id: uid("spectrum-trade-action"),
  note,
  price,
  simulationTime: run.simulationTime,
  sizeDelta: Math.round(sizeDelta),
  timestamp: new Date().toISOString(),
  type,
});

const latestRecordFor = (run: FullAutoRun, ticker: string | null) => {
  if (!ticker) return null;
  return run.thesisRecords.find((record) => record.ticker === ticker) ?? null;
};

const openPositions = (run: FullAutoRun) =>
  run.paperPositions.filter((position) => position.status === "open");

const watchRecords = (run: FullAutoRun) =>
  run.thesisRecords
    .filter((record) => {
      const position = run.paperPositions.find(
        (item) => item.thesisRecordId === record.id,
      );
      return (
        record.recommendation === "hold-neutral" ||
        record.monitoringState !== "active" ||
        !position ||
        position.status !== "open" ||
        position.thesisStatus !== "active" ||
        position.nextAction !== "Hold"
      );
    })
    .slice(0, 5);

const summarizeBrief = async (run: FullAutoRun) => {
  const activeRun =
    run.status === "idle"
      ? await stepFullAutoRun({ command: "start", run })
      : run;
  const brief = activeRun.currentBrief;
  return {
    run: activeRun,
    text: [
      `Morning brief - ${fmtDate(activeRun.simulationTime)}`,
      "",
      brief?.headline ? compact(brief.headline, 180) : "No major catalyst yet.",
      brief?.summary
        ? `Why it matters: ${compact(brief.summary, 240)}`
        : "Why it matters: run a step to scan the replay pack.",
      `Read count: ${brief?.sourceCount ?? 0} market items.`,
      "",
      paperOnlyLine,
    ].join("\n"),
  };
};

const summarizeBook = (run: FullAutoRun) => {
  const positions = openPositions(run);
  const top = [...run.paperPositions]
    .sort((left, right) => Math.abs(right.pnl) - Math.abs(left.pnl))
    .slice(0, 3)
    .map(
      (position) =>
        `${position.ticker}: ${fmtMoney(position.pnl)} (${fmtPct(position.returnPct)})`,
    );
  return [
    `Book check - ${fmtDate(run.simulationTime)}`,
    "",
    `Equity: ${fmtMoney(run.portfolio.netLiquidationValue)}`,
    `Exposure: ${run.portfolio.grossExposurePct.toFixed(1)}% gross; ${fmtMoney(run.portfolio.cash)} cash`,
    `Positions: ${positions.length} open; ${run.portfolio.closedPositionCount} closed`,
    top.length ? `Top movers: ${top.join(" | ")}` : "Top movers: none yet.",
    "",
    paperOnlyLine,
  ].join("\n");
};

const summarizePositions = (run: FullAutoRun) => {
  const positions = openPositions(run).slice(0, 5);
  if (!positions.length) return "No open paper positions.";
  return [
    "Open paper positions",
    "",
    ...positions.map(
      (position) =>
        `${position.ticker}: ${position.side.toUpperCase()} | ${fmtMoney(position.pnl)} (${fmtPct(position.returnPct)}) | Desk call: ${position.nextAction}`,
    ),
    "",
    paperOnlyLine,
  ].join("\n");
};

const summarizeWatch = (run: FullAutoRun) => {
  const records = watchRecords(run);
  if (!records.length) return `Watch list is clear.\n\n${paperOnlyLine}`;
  return [
    "Watch list",
    "",
    "Names that need another look before the desk adds risk.",
    ...records.map(
      (record) =>
        `${record.ticker}: ${recLabel(record.recommendation)} | ${record.monitoringState} | ${compact(record.oneLineThesis, 110)}`,
    ),
    "",
    paperOnlyLine,
  ].join("\n");
};

const summarizeTickerNews = async (ticker: string | null) => {
  if (!ticker) {
    return `Ticker needed. Example: Citadail news AAPL\n\n${paperOnlyLine}`;
  }

  const items = await fetchCurrentTickerNews(ticker, 4);

  if (!items.length) {
    return [
      `${ticker} news`,
      "",
      "No current ticker headlines came back from the news providers.",
      "This command is separate from Full Auto replay and does not start or advance the paper desk.",
      "",
      paperOnlyLine,
    ].join("\n");
  }

  return [
    `${ticker} news`,
    "",
    ...items.map(
      (item) =>
        `${item.title}${item.publishedAt ? ` (${fmtDate(item.publishedAt)})` : ""}\n${compact(item.summary, 190)}\nSource: ${item.source}${item.url ? ` - ${item.url}` : ""}`,
    ),
    "",
    "Current ticker news. Separate from Full Auto replay.",
    paperOnlyLine,
  ].join("\n\n");
};

const summarizeThesis = (run: FullAutoRun, record: ThesisRecord) => {
  const position = run.paperPositions.find(
    (item) => item.thesisRecordId === record.id,
  );
  return [
    `${record.ticker} view - ${recLabel(record.recommendation)}`,
    "",
    `Conviction: ${record.conviction.toFixed(1)}/10`,
    `Thesis: ${compact(record.oneLineThesis, 220)}`,
    `Variant view: ${compact(record.variantView.weBelieve, 160)}`,
    `What breaks it: ${record.invalidationTriggers[0]}`,
    `Status: PM ${record.pmDecision}; Risk ${record.riskDecision}; Desk ${position?.nextAction ?? "no position"}.`,
    "",
    paperOnlyLine,
  ].join("\n");
};

const artifactTypeFor = (
  type: CitadailSpectrumCommand["type"],
): EquityProjectArtifactType | null => {
  if (type === "memo") return "memo_docx";
  if (type === "model") return "operating_model_xlsx";
  if (type === "deck") return "pm_deck_pptx";
  return null;
};

const latestPositionFor = (run: FullAutoRun, ticker: string | null) => {
  if (!ticker) return openPositions(run)[0] ?? run.paperPositions[0] ?? null;
  return (
    run.paperPositions.find(
      (position) => position.ticker === ticker && position.status === "open",
    ) ??
    run.paperPositions.find((position) => position.ticker === ticker) ??
    null
  );
};

const chartResponseFor = (
  run: FullAutoRun,
  ticker: string | null,
): CitadailSpectrumResponse => {
  const position = latestPositionFor(run, ticker);
  if (!position) {
    return {
      attachments: [
        {
          buffer: buildBookEquityPng(run),
          filename: `Citadail_Book_Equity_${run.simulationTime.slice(0, 10)}.png`,
          mimeType: "image/png",
        },
      ],
      kind: "artifact",
      text: `Book equity chart attached.\n\nShows the paper portfolio path through ${fmtDate(run.simulationTime)}.\n\n${paperOnlyLine}`,
    };
  }
  return {
    attachments: [
      {
        buffer: buildPositionPng(run, position),
        filename: `${position.ticker}_Trade_Chart_${run.simulationTime.slice(0, 10)}.png`,
        mimeType: "image/png",
      },
    ],
    kind: "artifact",
    relatedTicker: position.ticker,
    text: [
      `${position.ticker} trade chart attached.`,
      "",
      `Desk call: ${position.nextAction}`,
      `Thesis state: ${position.thesisStatus}`,
      "",
      paperOnlyLine,
    ].join("\n"),
  };
};

const updateRecord = (
  run: FullAutoRun,
  record: ThesisRecord,
  patch: Partial<ThesisRecord>,
) => ({
  ...run,
  thesisRecords: run.thesisRecords.map((item) =>
    item.id === record.id ? { ...item, ...patch } : item,
  ),
});

const withJournal = (
  run: FullAutoRun,
  command: CitadailSpectrumCommand,
  title: string,
  body: string,
  record?: ThesisRecord,
) => ({
  ...run,
  journal: [
    createJournalEntry({
      body,
      relatedTicker: record?.ticker,
      run,
      thesisId: record?.id,
      title,
    }),
    ...run.journal,
  ].slice(0, 80),
});

const recalcRun = (run: FullAutoRun) => ({
  ...run,
  portfolio: recalcPortfolio({
    positions: run.paperPositions,
    previousPortfolio: run.portfolio,
    simulationTime: run.simulationTime,
  }),
});

const handleDecisionCommand = (
  run: FullAutoRun,
  command: CitadailSpectrumCommand,
  record: ThesisRecord,
) => {
  const patch: Partial<ThesisRecord> = {};
  if (command.type === "approve") patch.pmDecision = "approved";
  if (command.type === "send_back") patch.pmDecision = "revise";
  if (command.type === "reject") patch.pmDecision = "rejected";
  if (command.type === "risk_approve") {
    patch.pmDecision = "approved";
    patch.riskDecision = "approved";
    patch.monitoringState = "active";
  }
  if (command.type === "reduce") {
    patch.pmDecision = "approved";
    patch.riskDecision = "reduced";
    patch.monitoringState = "active";
  }
  if (command.type === "monitor") {
    patch.riskDecision = "monitor_first";
    patch.monitoringState = "not_started";
  }

  const nextRun = withJournal(
    updateRecord(run, record, patch),
    command,
    `Spectrum ${command.type.replace("_", " ")} ${record.ticker}`,
    `iMessage PM group recorded ${command.type.replace("_", " ")} for ${record.ticker}. Paper-only workflow state updated.`,
    record,
  );

  return {
    run: nextRun,
    response: {
      auditText: `${command.type} ${record.ticker}`,
      kind: "action" as const,
      relatedTicker: record.ticker,
      text: [
        `${record.ticker}: decision recorded`,
        "",
        `Action: ${command.type.replace("_", " ")}`,
        `PM state: ${patch.pmDecision ?? record.pmDecision}`,
        `Risk state: ${patch.riskDecision ?? record.riskDecision}`,
        "",
        paperOnlyLine,
      ].join("\n"),
    },
  };
};

const handleDeskCommand = (
  run: FullAutoRun,
  command: CitadailSpectrumCommand,
  record: ThesisRecord,
) => {
  if (command.type === "open") {
    const alreadyOpen = run.paperPositions.find(
      (position) =>
        position.thesisRecordId === record.id && position.status === "open",
    );
    if (alreadyOpen) {
      return {
        run,
        response: {
          kind: "text" as const,
          relatedTicker: record.ticker,
          text: `${record.ticker} already has an open paper position.\n\n${paperOnlyLine}`,
        },
      };
    }
    const approvedRecord = {
      ...record,
      pmDecision: "approved" as const,
      riskDecision:
        record.riskDecision === "reduced" ? ("reduced" as const) : ("approved" as const),
      monitoringState: "active" as const,
      validation: record.validation ?? {
        lookbackDays: 0,
        maxDrawdown: null,
        medianForwardReturn: null,
        observationCount: 0,
        sourceIds: [],
        status: "insufficient" as const,
        verdict: "Opened by PM group command; validation not recomputed.",
        winRate: null,
      },
    };
    const position = createPaperPositionFromRiskDecision(approvedRecord, run);
    if (!position) {
      return {
        run,
        response: {
          kind: "error" as const,
          relatedTicker: record.ticker,
          text: [
            `${record.ticker}: paper open blocked`,
            "",
            "Reason: risk limits or price mark missing.",
            "Next: check the thesis or risk state before opening.",
            "",
            paperOnlyLine,
          ].join("\n"),
        },
      };
    }
    const nextRun = recalcRun(
      withJournal(
        {
          ...updateRecord(run, record, {
            monitoringState: "active",
            paperPositionId: position.id,
            pmDecision: approvedRecord.pmDecision,
            riskDecision: approvedRecord.riskDecision,
            validation: approvedRecord.validation,
          }),
          paperPositions: [position, ...run.paperPositions],
        },
        command,
        `Spectrum opened ${record.ticker}`,
        `Opened thesis-linked paper position from iMessage PM group. No live execution.`,
        record,
      ),
    );
    return {
      run: nextRun,
      response: {
        auditText: `open ${record.ticker}`,
        kind: "action" as const,
        relatedTicker: record.ticker,
        text: [
          `${record.ticker}: paper position opened`,
          "",
          `Side: ${position.side}`,
          `Entry: $${position.entryPrice.toFixed(2)}`,
          `Size: ${fmtMoney(position.size)}`,
          "",
          paperOnlyLine,
        ].join("\n"),
      },
    };
  }

  const position = run.paperPositions.find(
    (item) => item.thesisRecordId === record.id && item.status === "open",
  );
  if (!position) {
    return {
      run,
      response: {
        kind: "error" as const,
        relatedTicker: record.ticker,
        text: `${record.ticker}: no open paper position to ${command.type}.\n\n${paperOnlyLine}`,
      },
    };
  }
  const currentPrice =
    getLatestPriceSnapshotAt(record.ticker, run.simulationTime)?.price ??
    position.currentPrice;
  const trimSize = Math.round(position.size * 0.25);
  const nextPositions: FullAutoPaperPosition[] = run.paperPositions.map((item) => {
    if (item.id !== position.id) return item;
    if (command.type === "exit") {
      return {
        ...item,
        closedAt: run.simulationTime,
        currentPrice,
        history: [
          ...item.history,
          createTradeAction({
            note: "Exited from iMessage PM group command. Paper-only.",
            price: currentPrice,
            run,
            sizeDelta: -item.size,
            type: "exit",
          }),
        ],
        nextAction: "Exit",
        status: "closed",
      };
    }
    return {
      ...item,
      currentPrice,
      history: [
        ...item.history,
        createTradeAction({
          note: `${command.type} from iMessage PM group command. Paper-only.`,
          price: currentPrice,
          run,
          sizeDelta: command.type === "trim" ? -trimSize : 0,
          type: command.type === "trim" ? "trim" : "recheck",
        }),
      ],
      nextAction: command.type === "trim" ? "Trim" : "Revisit",
      size: command.type === "trim" ? Math.max(0, item.size - trimSize) : item.size,
    };
  });
  const nextRun = recalcRun(
    withJournal(
      {
        ...run,
        paperPositions: nextPositions,
      },
      command,
      `Spectrum ${command.type} ${record.ticker}`,
      `${command.type} recorded from iMessage PM group. Paper-only.`,
      record,
    ),
  );
  return {
    run: nextRun,
    response: {
      auditText: `${command.type} ${record.ticker}`,
      kind: "action" as const,
      relatedTicker: record.ticker,
      text: [
        `${record.ticker}: paper action recorded`,
        "",
        `Action: ${command.type}`,
        `Price mark: $${currentPrice.toFixed(2)}`,
        `Desk call: ${command.type === "trim" ? "Trim" : command.type === "exit" ? "Exit" : "Revisit"}`,
        "",
        paperOnlyLine,
      ].join("\n"),
    },
  };
};

export const runCitadailSpectrumCommand = async (
  command: CitadailSpectrumCommand,
): Promise<CitadailSpectrumResponse> => {
  const state = await loadSpectrumDeskState();
  let run = state.activeRun;
  let response: CitadailSpectrumResponse;

  if (command.type === "help" || command.type === "unknown") {
    response = { kind: "text", text: helpText };
  } else if (command.type === "start_feed") {
    await setSpectrumProactiveSpace({
      enabled: true,
      spaceId: command.spaceId,
    });
    response = {
      auditText: "start feed",
      kind: "action",
      text: [
        "Citadail feed is on.",
        "",
        "Autonomous cached replay is running for this chat.",
        "The desk will post brief, risk, chart, and PM updates as the paper run advances.",
        "You can interrupt anytime: Citadail book, news AAPL, positions, watch, or stop feed.",
        "",
        paperOnlyLine,
      ].join("\n"),
    };
  } else if (command.type === "stop_feed") {
    await setSpectrumProactiveSpace({
      enabled: false,
      spaceId: command.spaceId,
    });
    response = {
      auditText: "stop feed",
      kind: "action",
      text: "Citadail feed paused for this chat.",
    };
  } else if (command.type === "pulse") {
    const result = await runCitadailProactivePulse(command.spaceId);
    return {
      auditText: "pulse",
      kind: "action",
      text: result.length
        ? result.map((item) => item.text).join("\n\n")
        : "PM Agent: no material dispatch on this pulse.",
    };
  } else if (command.type === "runtime") {
    const status = await getDedalusRuntimeStatus();
    response = {
      auditText: "runtime",
      kind: "text",
      text: formatDedalusRuntimeForPm(status),
    };
  } else if (command.type === "run_machine_step") {
    try {
      const result = await runFullAutoStepWithRuntime({
        command: run.status === "idle" ? "start" : "step_event",
        mode: "dedalus_openclaw",
        run,
      });
      run = result.run;
      response = {
        auditText: "run machine step",
        kind: "action",
        text: [
          result.proof?.summaryLine ??
            `OpenClaw on Dedalus advanced the paper replay to ${fmtDate(run.simulationTime)}.`,
          "",
          summarizeBook(run),
        ].join("\n"),
      };
    } catch (error) {
      response = {
        auditText: "run machine step failed",
        kind: "error",
        text: [
          "Machine-backed step did not complete.",
          error instanceof Error ? error.message : "OpenClaw runtime unavailable.",
          "",
          paperOnlyLine,
        ].join("\n"),
      };
    }
  } else if (command.type === "brief") {
    const result = await summarizeBrief(run);
    run = result.run;
    response = { kind: "text", text: result.text };
  } else if (command.type === "step" || command.type === "fast_forward") {
    run = await stepFullAutoRun({
      command: command.type === "step" ? "step_event" : "fast_forward",
      run,
    });
    response = {
      auditText: command.type,
      kind: "action",
      text: `Replay advanced to ${fmtDate(run.simulationTime)}.\n\n${summarizeBook(run)}`,
    };
  } else if (command.type === "book") {
    response = { kind: "text", text: summarizeBook(run) };
  } else if (command.type === "positions") {
    response = { kind: "text", text: summarizePositions(run) };
  } else if (command.type === "watch") {
    response = { kind: "text", text: summarizeWatch(run) };
  } else if (command.type === "chart") {
    response = chartResponseFor(run, command.ticker);
  } else if (command.type === "news") {
    response = {
      auditText: `news ${command.ticker ?? ""}`.trim(),
      kind: "text",
      relatedTicker: command.ticker ?? undefined,
      text: await summarizeTickerNews(command.ticker),
    };
  } else {
    const record = latestRecordFor(run, command.ticker);
    if (!record) {
      response = {
        kind: "error",
        text: command.ticker
          ? `${command.ticker}: no thesis found yet.\n\nNext: send Citadail step to underwrite more names.`
          : "Ticker needed. Example: Citadail thesis AAPL",
      };
    } else if (command.type === "thesis") {
      response = {
        kind: "text",
        relatedTicker: record.ticker,
        text: summarizeThesis(run, record),
      };
    } else if (artifactTypeFor(command.type)) {
      const artifactType = artifactTypeFor(command.type);
      if (!artifactType) throw new Error("Unsupported artifact command.");
      const project = createEquityProjectFromThesisRecord(record);
      const artifact = await buildEquityExport({ artifactType, project });
      response = {
        attachments: [
          {
            buffer: artifact.buffer,
            filename: artifact.filename,
            mimeType: artifact.mimeType,
          },
        ],
        auditText: `${command.type} ${record.ticker}`,
        kind: "artifact",
        relatedTicker: record.ticker,
        text: [
          `${record.ticker}: ${project.artifacts[artifactType].title} attached.`,
          "",
          "Use it as the working research package for the paper desk.",
          "",
          paperOnlyLine,
        ].join("\n"),
      };
    } else if (
      ["approve", "send_back", "reject", "risk_approve", "reduce", "monitor"].includes(
        command.type,
      )
    ) {
      const result = handleDecisionCommand(run, command, record);
      run = result.run;
      response = result.response;
    } else if (["open", "trim", "exit"].includes(command.type)) {
      const result = handleDeskCommand(run, command, record);
      run = result.run;
      response = result.response;
    } else {
      response = { kind: "text", text: helpText };
    }
  }

  const latestState = await loadSpectrumDeskState();
  await saveSpectrumDeskState({
    ...latestState,
    activeRun: run,
  });

  return response;
};

const proactiveAgents = [
  "Morning Brief Agent",
  "Desk Agent",
  "Risk Agent",
  "Chart Agent",
  "PM Agent",
] as const;

const latestMaterialJournal = (run: FullAutoRun) =>
  run.journal.find((entry) => /Desk|PM|Risk|Validation|Morning Brief/i.test(entry.title)) ??
  run.journal[0] ??
  null;

const buildAgentDispatch = ({
  agent,
  previousRun,
  run,
}: {
  agent: (typeof proactiveAgents)[number];
  previousRun: FullAutoRun;
  run: FullAutoRun;
}): CitadailSpectrumResponse => {
  if (agent === "Morning Brief Agent") {
    return {
      kind: "text",
      text: [
        `Morning brief - ${fmtDate(run.simulationTime)}`,
        "Cached replay dispatch.",
        "",
        compact(run.currentBrief?.headline ?? "No major catalyst.", 160),
        `Why it matters: ${compact(run.currentBrief?.summary ?? "No company-specific update visible.", 220)}`,
        "",
        "Ask: Citadail news TICKER for source detail.",
      ].join("\n"),
    };
  }

  if (agent === "Desk Agent") {
    const latest = latestMaterialJournal(run);
    const open = openPositions(run).slice(0, 3);
    return {
      kind: "text",
      text: [
        "Desk update",
        "",
        latest
          ? `${latest.title}: ${compact(latest.body, 180)}`
          : "No desk action on this pulse.",
        open.length
          ? `Open positions: ${open.map((position) => `${position.ticker} ${position.nextAction}`).join(" | ")}`
          : "Open positions: none.",
        "",
        paperOnlyLine,
      ].join("\n"),
    };
  }

  if (agent === "Risk Agent") {
    const watch = watchRecords(run).slice(0, 3);
    return {
      kind: "text",
      text: [
        "Risk check",
        "",
        watch.length
          ? watch
              .map(
                (record) =>
                  `${record.ticker}: ${record.monitoringState}; ${compact(record.invalidationTriggers[0], 110)}`,
              )
              .join("\n")
          : "No watch/revisit breaks flagged.",
        `Exposure: ${run.portfolio.grossExposurePct.toFixed(1)}% gross vs 85% max.`,
      ].join("\n"),
    };
  }

  if (agent === "Chart Agent") {
    const position =
      [...run.paperPositions]
        .sort((left, right) => Math.abs(right.pnl) - Math.abs(left.pnl))[0] ??
      null;
    return position
      ? chartResponseFor(run, position.ticker)
      : chartResponseFor(run, null);
  }

  const previousEquity = previousRun.portfolio.netLiquidationValue;
  const currentEquity = run.portfolio.netLiquidationValue;
  return {
    kind: "text",
    text: [
      "PM summary",
      "",
      `Book equity: ${fmtMoney(currentEquity)} (${fmtMoney(currentEquity - previousEquity)} since last update)`,
      `State: ${openPositions(run).length} open; ${watchRecords(run).length} watch; ${run.portfolio.grossExposurePct.toFixed(1)}% gross`,
      "",
      "Next: Citadail thesis TICKER, deck TICKER, or stop feed.",
    ].join("\n"),
  };
};

export const runCitadailProactivePulse = async (
  spaceId: string,
): Promise<CitadailSpectrumResponse[]> => {
  const state = await loadSpectrumDeskState();
  const previousRun = state.activeRun;
  const cursor = state.proactiveCursors[spaceId] ?? {
    lastPulseAt: null,
    lastSimulationTime: null,
    nextAgentIndex: 0,
  };
  const run = await stepFullAutoRun({
    command: previousRun.status === "idle" ? "start" : "step_event",
    run: previousRun,
  });
  const agent = proactiveAgents[cursor.nextAgentIndex % proactiveAgents.length];
  const response = buildAgentDispatch({
    agent,
    previousRun,
    run,
  });

  await saveSpectrumDeskState({
    ...state,
    activeRun: run,
    proactiveCursors: {
      ...state.proactiveCursors,
      [spaceId]: {
        lastPulseAt: new Date().toISOString(),
        lastSimulationTime: run.simulationTime,
        nextAgentIndex: cursor.nextAgentIndex + 1,
      },
    },
  });

  return [response];
};

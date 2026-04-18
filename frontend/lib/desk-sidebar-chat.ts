import { GoogleGenAI } from "@google/genai";

export interface DeskSidebarChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface DeskSidebarToolCall {
  name: "screen_snapshot" | "workspace_search" | "web_search";
  message: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface DeskSidebarChatRequest {
  message: string;
  messages?: DeskSidebarChatMessage[];
  snapshot?: Record<string, unknown>;
}

export interface DeskSidebarChatResponse {
  reply: string;
  tools: DeskSidebarToolCall[];
  citations?: Array<{
    title: string;
    uri: string;
  }>;
}

interface GeminiGroundingChunk {
  web?: {
    title?: string;
    uri?: string;
  };
}

interface GeminiGroundingMetadata {
  groundingChunks?: GeminiGroundingChunk[];
}

interface GeminiCandidate {
  groundingMetadata?: GeminiGroundingMetadata;
}

interface GeminiGroundedResponse {
  text?: string;
  candidates?: GeminiCandidate[];
}

const SIDEBAR_CHAT_MODEL =
  process.env.GEMINI_SIDEBAR_CHAT_MODEL ??
  process.env.GEMINI_EQUITY_PROJECT_MODEL ??
  "gemini-2.5-flash";
const SIDEBAR_CHAT_TIMEOUT_MS = Number(
  process.env.GEMINI_SIDEBAR_CHAT_TIMEOUT_MS ?? 18_000,
);

const appContext = {
  code: [
    "Citadail is a Next.js App Router frontend.",
    "The main Assist workspace is SessionWorkspace.",
    "The right sidebar is the desk chat surface.",
    "The sidebar calls /api/desk/chat and passes a screen_snapshot plus workspace_search context.",
    "Gemini Live voice plumbing remains in the codebase, but the visible sidebar is text-first for the demo.",
  ],
  product:
    "Citadail is an AI-native equity research and paper-investing desk. Assist Mode is human-directed. Full Auto is a historical walk-forward paper desk. No live execution.",
  workflow:
    "Coverage Desk -> Thesis -> Memo / Financial Model / PM Deck -> PM Review -> Risk Gate -> Trade Desk -> Live Book.",
};

const tabContext: Record<string, { label: string; purpose: string; next: string }> = {
  "morning-brief": {
    label: "Morning News",
    next: "Use the market/news read to choose a name in Coverage Desk or ask for a ticker workup.",
    purpose:
      "Front-page market/news surface with sentiment, lead stories, screeners, gainers, losers, active names, and macro tape.",
  },
  "live-book": {
    label: "Live Book",
    next: "Open a position or thesis that needs attention, then inspect the linked desk workspace.",
    purpose:
      "Portfolio-level monitor for active paper positions, thesis states, book equity, and exposure.",
  },
  "coverage-desk": {
    label: "Coverage Desk",
    next: "Set a ticker, then move into Thesis to choose Buy / Long, Hold / Neutral, or Sell / Short.",
    purpose:
      "Ticker search, current coverage, watchlist, and flagged names. This starts Assist Mode underwriting.",
  },
  thesis: {
    label: "Thesis",
    next: "Pick the recommendation, enter rationale, and send it to generate the analyst package.",
    purpose:
      "Initial recommendation and rationale capture. This creates the source-backed analyst deliverables.",
  },
  "project:memo_docx": {
    label: "Memo",
    next: "Review the memo, then check Model and Deck before PM Review.",
    purpose:
      "Investment memo preview and DOCX export: thesis, why now, what changed, variant view, risks, and invalidation.",
  },
  "project:operating_model_xlsx": {
    label: "Financial Model",
    next: "Check whether model drivers support the thesis before PM Review.",
    purpose:
      "Operating model and XLSX export: assumptions, forecast, valuation, sensitivity, comps, and risk triggers.",
  },
  "project:pm_deck_pptx": {
    label: "PM Deck",
    next: "Use the deck as the compact PM-facing pitch, then move to PM Review.",
    purpose:
      "Pitch deck preview and PPTX export: thesis, variant perception, model read-through, comps, risks, and trade plan.",
  },
  "pm-review": {
    label: "PM Review",
    next: "Approve to Risk, send back, or reject.",
    purpose:
      "Decision screen asking whether the idea is good enough to deserve capital.",
  },
  "risk-gate": {
    label: "Risk Gate",
    next: "Approve to Desk, reduce size, monitor first, or reject.",
    purpose:
      "Risk approval screen asking how much of the idea the paper book can afford now.",
  },
  "trade-desk": {
    label: "Trade Desk",
    next: "Open, add, trim, exit, or re-check the thesis against the paper position.",
    purpose:
      "Single-position action layer linking the thesis to paper entry, P&L, catalyst timing, and desk actions.",
  },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const compact = (value: string, max = 360) => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
};

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Sidebar chat timed out."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const contextForTab = (activeTab: string) =>
  tabContext[activeTab] ??
  (activeTab.startsWith("artifact:")
    ? {
        label: "Text Artifact",
        next: "Use this saved note as durable context or return to the workflow tabs.",
        purpose: "User or agent-created durable workspace note.",
      }
    : {
        label: activeTab,
        next: "Use the current workspace state to choose the next desk action.",
        purpose: "Citadail workspace surface.",
      });

const workflowStageFor = (snapshot: Record<string, unknown>) => {
  const activeTab = asString(snapshot.activeTab) ?? "unknown";
  const project = asRecord(snapshot.equityProject);
  const pmReview = asRecord(snapshot.pmReview);
  const riskGate = asRecord(snapshot.riskGate);
  const paperPosition = asRecord(snapshot.paperPosition);
  const thesisDraft = asRecord(snapshot.thesisDraft);

  if (asString(paperPosition.status)) return "paper_position_management";
  if (riskGate.decision === "approved_to_desk") return "ready_for_trade_desk";
  if (pmReview.decision === "approved_to_risk") return "risk_gate";
  if (project.status === "ready") return "pm_review";
  if (project.status === "generating") return "package_generation";
  if (asString(thesisDraft.ticker)) return "thesis_draft";
  if (activeTab === "coverage-desk") return "ticker_selection";
  if (activeTab === "morning-brief") return "market_intake";
  return "workspace_review";
};

const enrichSnapshot = (
  snapshot: Record<string, unknown>,
): Record<string, unknown> => {
  const activeTab = asString(snapshot.activeTab) ?? "unknown";
  const context = contextForTab(activeTab);
  return {
    appContext,
    ...snapshot,
    activeTabLabel: context.label,
    currentScreenPurpose: context.purpose,
    suggestedNextAction: context.next,
    workflowStage: workflowStageFor(snapshot),
  };
};

const summarizeSnapshot = (snapshot: Record<string, unknown>) => {
  const activeTab = asString(snapshot.activeTab) ?? "unknown";
  const tabLabel = asString(snapshot.activeTabLabel);
  const purpose = asString(snapshot.currentScreenPurpose);
  const workflowStage = asString(snapshot.workflowStage);
  const selectedTicker = asString(snapshot.selectedTicker);
  const thesisDraft = asRecord(snapshot.thesisDraft);
  const project = asRecord(snapshot.equityProject);
  const pmReview = asRecord(snapshot.pmReview);
  const riskGate = asRecord(snapshot.riskGate);
  const paperPosition = asRecord(snapshot.paperPosition);

  const lines = [
    `Active screen: ${tabLabel ?? activeTab}`,
    purpose ? `Screen purpose: ${purpose}` : null,
    workflowStage ? `Workflow stage: ${workflowStage}` : null,
    selectedTicker ? `Selected ticker: ${selectedTicker}` : null,
    asString(thesisDraft.ticker)
      ? `Thesis draft: ${thesisDraft.ticker} / ${thesisDraft.recommendation ?? "undecided"}`
      : null,
    asString(project.ticker)
      ? `Project: ${project.ticker} / ${project.status ?? "unknown"}`
      : null,
    pmReview.decision ? `PM Review: ${String(pmReview.decision)}` : null,
    riskGate.decision ? `Risk Gate: ${String(riskGate.decision)}` : null,
    asString(paperPosition.ticker)
      ? `Paper position: ${paperPosition.ticker} / ${paperPosition.status ?? "unknown"} / ${paperPosition.nextAction ?? "unknown"}`
      : null,
  ].filter(Boolean);

  return lines.join("\n");
};

const snapshotSearch = ({
  message,
  snapshot,
}: {
  message: string;
  snapshot: Record<string, unknown>;
}) => {
  const haystack = JSON.stringify(snapshot, null, 2);
  const terms = message
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((term) => term.length >= 3)
    .slice(0, 8);
  const matches = terms.filter((term) => haystack.toLowerCase().includes(term));
  return {
    matchedTerms: matches,
    searchedFields: Object.keys(snapshot).slice(0, 12),
  };
};

const buildPrompt = ({
  message,
  messages,
  snapshot,
}: Required<DeskSidebarChatRequest>) => {
  const recent = messages
    .slice(-8)
    .map((entry) => `${entry.role}: ${entry.text}`)
    .join("\n");

  return `You are Citadail's right-sidebar desk agent. You are inside the app, not outside it.

Product context:
- ${appContext.product}
- Workflow: ${appContext.workflow}
- Code/app context: ${appContext.code.join(" ")}
- The current workspace has tabs such as Morning News, Coverage Desk, Thesis, Memo, Financial Model, PM Deck, PM Review, Risk Gate, Trade Desk, and Live Book.

Behavior:
- Answer the user's actual question directly.
- First use the current screen snapshot below. Say "On this screen" when the answer comes from it.
- You know the app/project context above. Do not say you lack app context if the answer is in this prompt or snapshot.
- If using general market knowledge or Google Search grounding, label it "Search-backed".
- Be concise, organized, and useful to an analyst or PM.
- If the user asks what to do next, recommend the next workflow action.
- If the evidence is not in the snapshot, say what is missing instead of inventing it.

Current screen snapshot:
${JSON.stringify(snapshot, null, 2)}

Recent sidebar conversation:
${recent || "None."}

User question:
${message}`;
};

const uniqueCitations = (chunks: GeminiGroundingChunk[] = []) => {
  const seen = new Set<string>();
  return chunks.flatMap((chunk) => {
    const uri = chunk.web?.uri;
    if (!uri || seen.has(uri)) return [];
    seen.add(uri);
    return [
      {
        title: chunk.web?.title ?? uri,
        uri,
      },
    ];
  });
};

const fallbackReply = ({
  message,
  snapshot,
}: {
  message: string;
  snapshot: Record<string, unknown>;
}) => {
  const activeTab = asString(snapshot.activeTab) ?? "the current screen";
  const activeTabLabel = asString(snapshot.activeTabLabel) ?? activeTab;
  const currentScreenPurpose = asString(snapshot.currentScreenPurpose);
  const suggestedNextAction = asString(snapshot.suggestedNextAction);
  const workflowStage = asString(snapshot.workflowStage);
  const selectedTicker =
    asString(snapshot.selectedTicker) ??
    asString(asRecord(snapshot.equityProject).ticker) ??
    asString(asRecord(snapshot.thesisDraft).ticker);
  const project = asRecord(snapshot.equityProject);
  const pmReview = asRecord(snapshot.pmReview);
  const riskGate = asRecord(snapshot.riskGate);
  const paperPosition = asRecord(snapshot.paperPosition);
  const lower = message.toLowerCase();

  if (
    lower.includes("project") ||
    lower.includes("app") ||
    lower.includes("code") ||
    lower.includes("context") ||
    lower.includes("what is this")
  ) {
    return [
      "This is Citadail.",
      appContext.product,
      `Workflow: ${appContext.workflow}`,
      "",
      `On this screen: ${activeTabLabel}.`,
      currentScreenPurpose ? `Purpose: ${currentScreenPurpose}` : null,
      workflowStage ? `Stage: ${workflowStage}.` : null,
      suggestedNextAction ? `Next: ${suggestedNextAction}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (lower.includes("where") || lower.includes("screen") || lower.includes("tab")) {
    return [
      `On this screen, you are in ${activeTabLabel}.`,
      currentScreenPurpose ? `Purpose: ${currentScreenPurpose}` : null,
      workflowStage ? `Stage: ${workflowStage}.` : null,
      selectedTicker ? `The active name is ${selectedTicker}.` : "No ticker is selected yet.",
      suggestedNextAction ? `Next: ${suggestedNextAction}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (lower.includes("next") || lower.includes("do")) {
    if (!selectedTicker) {
      return suggestedNextAction
        ? `Next: ${suggestedNextAction}`
        : "Next: pick a ticker in Coverage Desk, then create the Thesis.";
    }
    if (!project.status) {
      return `Next for ${selectedTicker}: finish the Thesis decision and rationale so Citadail can build the analyst package.`;
    }
    if (project.status === "generating") {
      return `Next for ${selectedTicker}: wait for Memo, Model, and Deck generation to finish.`;
    }
    if (project.status === "ready" && !pmReview.decision) {
      return `Next for ${selectedTicker}: go to PM Review and decide whether the idea deserves capital.`;
    }
    if (pmReview.decision === "approved_to_risk" && !riskGate.decision) {
      return `Next for ${selectedTicker}: run Risk Gate to decide size and whether it can move to the desk.`;
    }
    if (riskGate.decision === "approved_to_desk" && !paperPosition.status) {
      return `Next for ${selectedTicker}: open the paper trade in Trade Desk.`;
    }
    return `Next for ${selectedTicker}: monitor the thesis and paper position. Re-check if new evidence weakens the view.`;
  }

  return [
    `On this screen: ${summarizeSnapshot(snapshot) || "no detailed workspace state was provided."}`,
    "",
    "I can answer from the current tab, summarize the thesis package, explain PM/Risk/Desk state, or use search-backed context when you ask for market background.",
  ].join("\n");
};

export const runDeskSidebarChat = async ({
  message,
  messages = [],
  snapshot = {},
}: DeskSidebarChatRequest): Promise<DeskSidebarChatResponse> => {
  const cleanMessage = compact(message, 2000);
  if (!cleanMessage) {
    return {
      reply: "Ask me about the current screen, a ticker, the thesis package, or the next desk action.",
      tools: [],
    };
  }

  const normalizedSnapshot = asRecord(snapshot);
  const enrichedSnapshot = enrichSnapshot(normalizedSnapshot);
  const snapshotSummary = summarizeSnapshot(enrichedSnapshot);
  const workspaceResult = snapshotSearch({
    message: cleanMessage,
    snapshot: enrichedSnapshot,
  });
  const tools: DeskSidebarToolCall[] = [
    {
      input: { activeTab: enrichedSnapshot.activeTab },
      message: snapshotSummary || "Captured current workspace state.",
      name: "screen_snapshot",
      output: { summary: snapshotSummary },
    },
    {
      input: { query: cleanMessage },
      message: workspaceResult.matchedTerms.length
        ? `Matched ${workspaceResult.matchedTerms.length} workspace terms.`
        : "Searched the workspace snapshot.",
      name: "workspace_search",
      output: workspaceResult,
    },
  ];

  const lower = cleanMessage.toLowerCase();
  const shouldAnswerFromSnapshot =
    /\b(where|screen|tab|next|what should|what do|what is this|project|app|code|context)\b/i.test(
      lower,
    );

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || shouldAnswerFromSnapshot) {
    return {
      reply: fallbackReply({ message: cleanMessage, snapshot: enrichedSnapshot }),
      tools,
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = (await withTimeout(
      ai.models.generateContent({
        config: {
          temperature: 0.2,
          tools: [{ googleSearch: {} }],
        },
        contents: [{ text: buildPrompt({ message: cleanMessage, messages, snapshot: enrichedSnapshot }) }],
        model: SIDEBAR_CHAT_MODEL,
      }),
      SIDEBAR_CHAT_TIMEOUT_MS,
    )) as GeminiGroundedResponse;

    const citations = uniqueCitations(
      response.candidates?.[0]?.groundingMetadata?.groundingChunks,
    );
    if (citations.length) {
      tools.push({
        input: { query: cleanMessage },
        message: `Checked ${citations.length} search-backed source${citations.length === 1 ? "" : "s"}.`,
        name: "web_search",
        output: { citations: citations.slice(0, 5) },
      });
    }

    return {
      citations: citations.slice(0, 5),
      reply:
        response.text?.trim() ||
        fallbackReply({ message: cleanMessage, snapshot: enrichedSnapshot }),
      tools,
    };
  } catch (error) {
    tools.push({
      input: { model: SIDEBAR_CHAT_MODEL },
      message:
        error instanceof Error
          ? `Model unavailable: ${error.message}`
          : "Model unavailable; used local workspace context.",
      name: "web_search",
      output: { fallback: true },
    });

    return {
      reply: fallbackReply({ message: cleanMessage, snapshot: enrichedSnapshot }),
      tools,
    };
  }
};

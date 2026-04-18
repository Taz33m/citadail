import { GoogleGenAI, Type } from "@google/genai";

import {
  completeEquityProject,
  createPendingEquityProject,
  formatThesisRecommendation,
  normalizeAnalystRationale,
  normalizeGeneratedContent,
  sanitizeTicker,
  type EquityCompanyContext,
} from "@/lib/equity-project";
import {
  fetchEquityResearchContext,
  type EquityResearchContext,
} from "@/lib/equity-research-data";
import { coverageDeskItems } from "@/lib/coverage-desk-data";
import type {
  EquityProject,
  EquityProjectGeneratedContent,
  ThesisRecommendation,
} from "@/types/session";

const GEMINI_EQUITY_PROJECT_MODEL =
  process.env.GEMINI_EQUITY_PROJECT_MODEL ?? "gemini-2.5-flash";
const GEMINI_EQUITY_PROJECT_TIMEOUT_MS = Number(
  process.env.GEMINI_EQUITY_PROJECT_TIMEOUT_MS ?? 20_000,
);
const USE_GEMINI_FOR_CACHED_RESEARCH =
  process.env.EQUITY_USE_GEMINI_FOR_CACHED_RESEARCH?.toLowerCase() === "true";

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const stringSchema = (description: string) => ({
  type: Type.STRING,
  description,
});

const numberSchema = (description: string) => ({
  type: Type.NUMBER,
  description,
});

const GENERATED_CONTENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    companyOverview: stringSchema("Company overview grounded in source documents."),
    recommendationSummary: stringSchema("One-paragraph recommendation summary."),
    whyNow: stringSchema("Why this thesis matters now, using filing/news/profile evidence."),
    whatChanged: stringSchema("Recent change from filings, news, guidance, or reported fundamentals."),
    marketMissing: stringSchema("What consensus likely believes or over-focuses on."),
    variantPerception: stringSchema("What we believe instead and why, tied to evidence."),
    bullCase: stringSchema("Bull case."),
    baseCase: stringSchema("Base case."),
    bearCase: stringSchema("Bear case."),
    catalysts: {
      type: Type.ARRAY,
      items: stringSchema("Catalyst."),
    },
    risks: {
      type: Type.ARRAY,
      items: stringSchema("Risk."),
    },
    invalidationConditions: {
      type: Type.ARRAY,
      items: stringSchema("Specific invalidation condition."),
    },
    memoSections: {
      type: Type.ARRAY,
      description:
        "At least nine memo sections: What the Company Is, Recommendation / Bias, Why Now, What Changed, Variant Perception / Edge, Bull / Base / Bear, Catalysts, Risks, Invalidation Conditions.",
      items: {
        type: Type.OBJECT,
        properties: {
          heading: stringSchema("Memo section heading."),
          body: stringSchema("Memo section body."),
        },
        required: ["heading", "body"],
      },
    },
    evidence: {
      type: Type.ARRAY,
      description:
        "Narrative and numeric evidence rows. Use source labels/doc IDs from the research context. At least five rows when source data is available.",
      items: {
        type: Type.OBJECT,
        properties: {
          label: stringSchema("Evidence label."),
          value: stringSchema("Evidence value."),
          source: stringSchema("Source label from research context."),
          implication: stringSchema("Why this fact matters for the thesis."),
        },
        required: ["label", "value", "source", "implication"],
      },
    },
    modelAssumptions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: stringSchema("Model input label."),
          value: stringSchema("Model input value."),
          source: stringSchema("Source label, forward estimate label, or user rationale."),
        },
        required: ["label", "value", "source"],
      },
    },
    forecast: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          year: stringSchema("Year label."),
          revenue: numberSchema("Revenue in $mm."),
          revenueGrowth: numberSchema("Revenue growth as decimal or percent."),
          grossMargin: numberSchema("Gross margin as decimal or percent."),
          operatingMargin: numberSchema("Operating margin as decimal or percent."),
          freeCashFlowMargin: numberSchema("FCF margin as decimal or percent."),
        },
        required: [
          "year",
          "revenue",
          "revenueGrowth",
          "grossMargin",
          "operatingMargin",
          "freeCashFlowMargin",
        ],
      },
    },
    valuation: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          metric: stringSchema("Valuation metric."),
          value: stringSchema("Valuation output."),
          source: stringSchema("Source or forward estimate label."),
        },
        required: ["metric", "value", "source"],
      },
    },
    sensitivity: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          case: stringSchema("Case label."),
          revenueGrowth: numberSchema("Revenue growth as decimal or percent."),
          operatingMargin: numberSchema("Operating margin as decimal or percent."),
          impliedValue: numberSchema("Implied value."),
        },
        required: ["case", "revenueGrowth", "operatingMargin", "impliedValue"],
      },
    },
    comps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ticker: stringSchema("Peer ticker."),
          company: stringSchema("Peer company."),
          evRevenue: numberSchema("EV/revenue multiple."),
          evEbitda: numberSchema("EV/EBITDA multiple."),
          pe: numberSchema("P/E multiple."),
          rationale: stringSchema("Why peer is included or excluded framing."),
        },
        required: ["ticker", "company", "evRevenue", "evEbitda", "pe", "rationale"],
      },
    },
    riskTriggers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          trigger: stringSchema("Risk trigger."),
          threshold: stringSchema("Threshold to watch."),
          action: stringSchema("Action if triggered."),
        },
        required: ["trigger", "threshold", "action"],
      },
    },
    tradeProposal: {
      type: Type.OBJECT,
      properties: {
        bias: stringSchema("Long, short, or hold bias."),
        entryZone: stringSchema("Entry zone."),
        positionSize: stringSchema("Position sizing suggestion."),
        timeHorizon: stringSchema("Time horizon."),
        addTrimExit: stringSchema("Add, trim, or exit logic."),
      },
      required: ["bias", "entryZone", "positionSize", "timeHorizon", "addTrimExit"],
    },
    deckSlides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: stringSchema("Slide title."),
          bullets: {
            type: Type.ARRAY,
            items: stringSchema("Slide bullet."),
          },
          speakerNotes: stringSchema("Speaker notes."),
        },
        required: ["title", "bullets", "speakerNotes"],
      },
    },
  },
  required: [
    "companyOverview",
    "recommendationSummary",
    "whyNow",
    "whatChanged",
    "marketMissing",
    "variantPerception",
    "bullCase",
    "baseCase",
    "bearCase",
    "catalysts",
    "risks",
    "invalidationConditions",
    "memoSections",
    "evidence",
    "modelAssumptions",
    "forecast",
    "valuation",
    "sensitivity",
    "comps",
    "riskTriggers",
    "tradeProposal",
    "deckSlides",
  ],
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatMoneyMm = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}tn`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}mm`;
};

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;

const recommendationGrowthTilt: Record<ThesisRecommendation, number> = {
  "buy-long": 0.0125,
  "hold-neutral": 0,
  "sell-short": -0.0125,
};

const recommendationMarginTilt: Record<ThesisRecommendation, number> = {
  "buy-long": 0.005,
  "hold-neutral": 0,
  "sell-short": -0.01,
};

const peerSets: Record<
  string,
  Array<{
    ticker: string;
    company: string;
    evRevenue: number;
    evEbitda: number;
    pe: number;
    rationale: string;
  }>
> = {
  AAPL: [
    {
      ticker: "MSFT",
      company: "Microsoft",
      evRevenue: 12.2,
      evEbitda: 24.5,
      pe: 31.1,
      rationale: "Peer screen: mega-cap quality growth platform with durable margins.",
    },
    {
      ticker: "GOOGL",
      company: "Alphabet",
      evRevenue: 5.9,
      evEbitda: 15.2,
      pe: 21.4,
      rationale: "Peer screen: mega-cap platform business with regulatory and AI debate.",
    },
    {
      ticker: "META",
      company: "Meta Platforms",
      evRevenue: 7.4,
      evEbitda: 14.1,
      pe: 22.6,
      rationale: "Peer screen: consumer technology platform with high-margin cash generation.",
    },
  ],
};

const defaultPeerSet = [
  {
    ticker: "MSFT",
    company: "Microsoft",
    evRevenue: 12.2,
    evEbitda: 24.5,
    pe: 31.1,
    rationale: "Peer screen: large-cap quality growth comparison.",
  },
  {
    ticker: "GOOGL",
    company: "Alphabet",
    evRevenue: 5.9,
    evEbitda: 15.2,
    pe: 21.4,
    rationale: "Peer screen: large-cap platform comparison.",
  },
  {
    ticker: "META",
    company: "Meta Platforms",
    evRevenue: 7.4,
    evEbitda: 14.1,
    pe: 22.6,
    rationale: "Peer screen: high-margin consumer technology comparison.",
  },
];

export interface GenerateEquityProjectInput {
  ticker: string;
  recommendation: ThesisRecommendation;
  rationale: string;
  companyContext?: EquityCompanyContext | null;
  researchContext?: EquityResearchContext | null;
}

export const resolveCompanyContext = (
  ticker: string,
  inputContext?: EquityCompanyContext | null,
): EquityCompanyContext => {
  const normalizedTicker = sanitizeTicker(ticker);
  const coverageItem = coverageDeskItems.find(
    (item) => item.ticker === normalizedTicker,
  );

  return {
    companyName: inputContext?.companyName ?? coverageItem?.companyName,
    sector: inputContext?.sector ?? coverageItem?.sector,
    summary: inputContext?.summary ?? coverageItem?.summary,
    lastCheck: inputContext?.lastCheck ?? coverageItem?.lastCheck,
    status: inputContext?.status ?? coverageItem?.status,
  };
};

export const buildEquityProjectPrompt = ({
  companyContext,
  rationale,
  recommendation,
  researchContext,
  ticker,
}: GenerateEquityProjectInput) => {
  const context = resolveCompanyContext(ticker, companyContext);

  return `You are Citadail, an internal equity research and desk agent.

Task: build a senior analyst / PM deliverables package for an equity thesis. Return only valid JSON matching the schema.

Ticker: ${sanitizeTicker(ticker)}
Company: ${context.companyName ?? "Unknown"}
Sector: ${context.sector ?? "Unknown"}
Initial recommendation: ${recommendation}
User rationale: ${rationale}
Existing coverage note: ${context.summary ?? "None"}
Last coverage check: ${context.lastCheck ?? "Unknown"}

${researchContext?.promptBlock ?? "Research source status: unavailable."}

Rules:
- Be institutional, concise, skeptical.
- Fundamentals means the evidence-backed company story: guidance, filings, news, business mix, competitive position, regulation, management discussion, market debate, and what changed. The financial rows support that story; they are not the whole story.
- Quantify before narrating, but lead with the narrative evidence that explains why the numbers matter.
- Every material claim must include a source label/doc ID from the research context, "User rationale:", or "Forward estimate:".
- Do not prefix source-backed filing/news/profile facts with "Assumption:".
- Use "Forward estimate:" for modeled future scenarios that are not reported facts.
- Do not invent live market data or filings.
- If source-backed documents are unavailable, do not fabricate them.
- Falsification first: include clear thesis-break triggers and thresholds.
- Build real deliverable content for a DOCX memo, XLSX operating model, and PPTX PM pitch deck.
- memoSections must contain at least nine complete sections: What the Company Is, Recommendation / Bias, Why Now, What Changed, Variant Perception / Edge, Bull / Base / Bear, Catalysts, Risks, and Invalidation Conditions.
- evidence must cite the research context and explain why each narrative or numeric source supports or weakens the thesis.
- whatChanged and whyNow should prefer filing-change, recent news, management discussion, and market-debate evidence over generic valuation prose.
- modelAssumptions should translate narrative evidence into drivers before listing numeric reported baselines.
- FY0 in forecast must use the reported financial baseline from the research context when available.
- FY1-FY4 forecast rows may be forward estimates, but the source should be labeled "Forward estimate from user rationale and reported baseline."
- Forecast rows must contain at least FY0 through FY4.
- Comps should include at least three plausible peers; use source labels for peer rationale and forward-estimate labels for unavailable live multiples.
- Deck slides should include thesis, edge, model output, comps, risks, and trade plan.`;
};

const mergeResearchIntoGeneratedContent = (
  content: EquityProjectGeneratedContent,
  researchContext: EquityResearchContext,
): EquityProjectGeneratedContent => {
  if (researchContext.sourceStatus === "unavailable") return content;

  const evidence = [
    ...researchContext.evidence,
    ...content.evidence.filter(
      (row) =>
        !researchContext.evidence.some(
          (sourceRow) =>
            sourceRow.label.toLowerCase() === row.label.toLowerCase(),
        ),
    ),
  ];
  const modelAssumptions = [
    ...researchContext.modelAssumptions,
    ...content.modelAssumptions.filter(
      (row) =>
        !researchContext.modelAssumptions.some(
          (sourceRow) =>
            sourceRow.label.toLowerCase() === row.label.toLowerCase(),
        ),
    ),
  ];
  const forecast =
    researchContext.forecastBaseline && content.forecast.length
      ? [researchContext.forecastBaseline, ...content.forecast.slice(1)]
      : content.forecast;

  return {
    ...content,
    evidence,
    modelAssumptions,
    forecast,
  };
};

const buildForecastFromResearch = (
  recommendation: ThesisRecommendation,
  researchContext: EquityResearchContext,
) => {
  const latest = researchContext.forecastBaseline;
  const latestFinancial = researchContext.annualFinancials.at(-1);
  const baseline = latest ?? {
    year: latestFinancial?.year ?? "FY0",
    revenue: latestFinancial?.revenue ?? 1_000,
    revenueGrowth: 0,
    grossMargin:
      latestFinancial?.grossProfit && latestFinancial.revenue
        ? latestFinancial.grossProfit / latestFinancial.revenue
        : 0.4,
    operatingMargin:
      latestFinancial?.operatingIncome && latestFinancial.revenue
        ? latestFinancial.operatingIncome / latestFinancial.revenue
        : 0.2,
    freeCashFlowMargin:
      latestFinancial?.freeCashFlow && latestFinancial.revenue
        ? latestFinancial.freeCashFlow / latestFinancial.revenue
        : 0.15,
  };
  const baseGrowth = clamp(
    Math.abs(baseline.revenueGrowth) > 0.001 ? baseline.revenueGrowth : 0.025,
    -0.08,
    0.12,
  );
  const growthTilt = recommendationGrowthTilt[recommendation];
  const marginTilt = recommendationMarginTilt[recommendation];
  const forecast = [baseline];

  for (let index = 1; index <= 4; index += 1) {
    const previous = forecast[index - 1];
    const revenueGrowth = clamp(baseGrowth + growthTilt + index * 0.0025, -0.08, 0.14);
    forecast.push({
      year: `FY${index}`,
      revenue: Math.round(previous.revenue * (1 + revenueGrowth)),
      revenueGrowth,
      grossMargin: clamp(baseline.grossMargin + marginTilt + index * 0.001, 0.05, 0.85),
      operatingMargin: clamp(
        baseline.operatingMargin + marginTilt + index * 0.001,
        -0.1,
        0.65,
      ),
      freeCashFlowMargin: clamp(
        baseline.freeCashFlowMargin + marginTilt / 2 + index * 0.0005,
        -0.1,
        0.55,
      ),
    });
  }

  return forecast;
};

const estimateBaseValue = (
  forecast: ReturnType<typeof buildForecastFromResearch>,
  researchContext: EquityResearchContext,
) => {
  const latest = researchContext.annualFinancials.at(-1);
  const fcf =
    latest?.freeCashFlow ??
    forecast[0].revenue * forecast[0].freeCashFlowMargin;
  const raw = Math.max(15, fcf / 500);
  return Math.round(raw / 5) * 5;
};

const buildSourceBackedProjectContent = (
  input: GenerateEquityProjectInput,
  researchContext: EquityResearchContext,
): EquityProjectGeneratedContent => {
  const ticker = sanitizeTicker(input.ticker);
  const context = resolveCompanyContext(ticker, input.companyContext);
  const companyName = researchContext.companyName ?? context.companyName ?? ticker;
  const evidenceSeed =
    researchContext.evidence.length >= 3
      ? researchContext.evidence
      : [
          ...researchContext.evidence,
          ...researchContext.modelAssumptions.map((row) => ({
            label: row.label,
            value: row.value,
            source: row.source,
            implication: "Supports the model baseline and underwriting setup.",
          })),
        ].slice(0, 5);
  const evidence = [...evidenceSeed];
  while (evidence.length < 3) {
    evidence.push({
      label: `Source document ${evidence.length + 1}`,
      value:
        researchContext.sourceDocuments[evidence.length]?.text ??
        "Source-backed research context available.",
      source:
        researchContext.sourceDocuments[evidence.length]?.source ??
        researchContext.sources[0] ??
        "source-backed research context",
      implication: "Supports the operating model baseline and thesis review.",
    });
  }
  const primaryEvidence = evidence[0];
  const changeEvidence =
    evidence.find((row) => /change|growth|margin|guidance|earnings/i.test(row.label)) ??
    primaryEvidence;
  const debateEvidence =
    evidence.find((row) => /debate|risk|regulat|demand|mix/i.test(row.label)) ??
    evidence[1] ??
    primaryEvidence;
  const forecast = buildForecastFromResearch(input.recommendation, researchContext);
  const baseValue = estimateBaseValue(forecast, researchContext);
  const baseGrowth = forecast.at(-1)?.revenueGrowth ?? 0.025;
  const baseMargin = forecast.at(-1)?.operatingMargin ?? 0.2;
  const bullValue = Math.round((baseValue * 1.2) / 5) * 5;
  const bearValue = Math.round((baseValue * 0.75) / 5) * 5;
  const recommendationLabel = formatThesisRecommendation(input.recommendation);
  const latest = researchContext.annualFinancials.at(-1);
  const latestRevenue = latest?.revenue ? formatMoneyMm(latest.revenue) : "reported revenue base";
  const latestFcf = latest?.freeCashFlow ? formatMoneyMm(latest.freeCashFlow) : "reported cash flow base";
  const sourceLabel = primaryEvidence?.source ?? researchContext.sources[0] ?? "source-backed research context";
  const analystRationale = normalizeAnalystRationale(input.rationale);
  const thesisDriver =
    analystRationale ??
    `${sourceLabel}: ${
      primaryEvidence?.implication ??
      "source-backed evidence drives the current underwriting view"
    }`;

  const recommendationSummary = `${recommendationLabel}. ${thesisDriver} Source-backed support comes from ${sourceLabel}; the model translates the evidence pack into revenue growth, margin, FCF, valuation, and falsification triggers.`;
  const whyNow = changeEvidence
    ? `${changeEvidence.source}: ${changeEvidence.implication}`
    : `${sourceLabel}: current source pack supports a fresh underwriting pass.`;
  const whatChanged = changeEvidence
    ? `${changeEvidence.source}: ${changeEvidence.value}`
    : `${sourceLabel}: latest reported data updates the model baseline.`;
  const marketMissing = debateEvidence
    ? `Consensus may underweight ${debateEvidence.label.toLowerCase()}: ${debateEvidence.implication}`
    : `Consensus may underweight the durability implied by the reported baseline and thesis driver.`;
  const variantPerception = `${thesisDriver} The variant view is only valid if the driver model keeps revenue growth near ${formatPct(baseGrowth)} and operating margin near ${formatPct(baseMargin)}.`;

  const modelAssumptions = [
    ...researchContext.modelAssumptions,
    {
      label: analystRationale ? "User thesis driver" : "Source-backed thesis driver",
      value: thesisDriver,
      source: analystRationale ? "User rationale" : sourceLabel,
    },
  ];
  while (modelAssumptions.length < 4) {
    const row = evidence[modelAssumptions.length % evidence.length];
    modelAssumptions.push({
      label: row.label,
      value: row.value,
      source: row.source,
    });
  }

  const content = {
    companyOverview: `${companyName} is underwritten from the current source pack, with ${latestRevenue} revenue and ${latestFcf} FCF anchoring the operating model where reported data is available.`,
    recommendationSummary,
    whyNow,
    whatChanged,
    marketMissing,
    variantPerception,
    bullCase: `Forward estimate: revenue growth moves above ${formatPct(baseGrowth + 0.02)} with operating margin near ${formatPct(baseMargin + 0.025)}, supporting roughly $${bullValue}/share.`,
    baseCase: `Forward estimate: revenue growth holds near ${formatPct(baseGrowth)} with operating margin near ${formatPct(baseMargin)}, supporting roughly $${baseValue}/share.`,
    bearCase: `Forward estimate: growth slips toward ${formatPct(Math.max(baseGrowth - 0.025, -0.05))} and margin compresses, supporting roughly $${bearValue}/share.`,
    catalysts: [
      "Forward estimate: next earnings print confirms or challenges the modeled revenue growth path.",
      "Forward estimate: management guidance clarifies margin durability and demand quality.",
      `${sourceLabel}: monitor the main evidence driver in the source pack for confirmation.`,
    ],
    risks: [
      "Forward estimate: revenue growth misses the modeled base-case path.",
      "Forward estimate: operating margin compresses enough to impair valuation support.",
      "Forward estimate: source-backed debate worsens before catalysts can validate the view.",
    ],
    invalidationConditions: [
      `Revenue growth falls below ${formatPct(Math.max(baseGrowth - 0.03, -0.05))}.`,
      `Operating margin falls below ${formatPct(Math.max(baseMargin - 0.03, -0.05))}.`,
      "Management commentary or filings directly contradict the user rationale.",
    ],
    memoSections: [
      {
        heading: "What the Company Is",
        body: `${companyName} is modeled from source-backed operating and narrative evidence, with reported financials setting the FY0 baseline.`,
      },
      {
        heading: "Recommendation / Bias",
        body: recommendationSummary,
      },
      { heading: "Why Now", body: whyNow },
      { heading: "What Changed", body: whatChanged },
      {
        heading: "Variant Perception / Edge",
        body: `${variantPerception}\n\nConsensus likely believes: ${marketMissing}`,
      },
      {
        heading: "Bull / Base / Bear",
        body: `Bull: revenue growth and margins beat the base case.\nBase: modeled drivers hold near current source-backed baseline.\nBear: growth slows and margin compression breaks valuation support.`,
      },
      {
        heading: "Catalysts",
        body: "Earnings, guidance, management commentary, segment mix, and margin disclosure.",
      },
      {
        heading: "Risks",
        body: "Demand softness, margin compression, adverse source updates, and failed catalyst confirmation.",
      },
      {
        heading: "Invalidation Conditions",
        body: "Break the thesis if growth, margin, or management commentary violates the model thresholds.",
      },
    ],
    evidence: evidence.slice(0, 8),
    modelAssumptions,
    forecast,
    valuation: [
      {
        metric: "Bear Case Value",
        value: `$${bearValue}/share`,
        source: "Forward estimate from source-backed model baseline",
      },
      {
        metric: "Base Case Value",
        value: `$${baseValue}/share`,
        source: "Forward estimate from source-backed model baseline",
      },
      {
        metric: "Bull Case Value",
        value: `$${bullValue}/share`,
        source: "Forward estimate from source-backed model baseline",
      },
    ],
    sensitivity: [
      {
        case: "Bear",
        revenueGrowth: clamp(baseGrowth - 0.025, -0.08, 0.12),
        operatingMargin: clamp(baseMargin - 0.03, -0.1, 0.65),
        impliedValue: bearValue,
      },
      {
        case: "Base",
        revenueGrowth: baseGrowth,
        operatingMargin: baseMargin,
        impliedValue: baseValue,
      },
      {
        case: "Bull",
        revenueGrowth: clamp(baseGrowth + 0.02, -0.08, 0.14),
        operatingMargin: clamp(baseMargin + 0.025, -0.1, 0.65),
        impliedValue: bullValue,
      },
    ],
    comps: peerSets[ticker] ?? defaultPeerSet,
    riskTriggers: [
      {
        trigger: "Growth break",
        threshold: `Revenue growth below ${formatPct(Math.max(baseGrowth - 0.03, -0.05))}`,
        action: "Re-underwrite and consider trim/exit.",
      },
      {
        trigger: "Margin break",
        threshold: `Operating margin below ${formatPct(Math.max(baseMargin - 0.03, -0.05))}`,
        action: "Mark thesis weakened and revisit position sizing.",
      },
      {
        trigger: "Narrative break",
        threshold: "New filing/news/guidance contradicts the core rationale",
        action: "Escalate to PM review before adding exposure.",
      },
    ],
    tradeProposal: {
      bias: recommendationLabel,
      entryZone: "Stage entry around confirmed catalyst windows rather than chasing gaps.",
      positionSize:
        input.recommendation === "buy-long"
          ? "Starter 2%; add only after driver confirmation."
          : input.recommendation === "sell-short"
            ? "Starter short 1%; add only after invalidation evidence."
            : "No add until evidence resolves.",
      timeHorizon: "Multi-week to multi-month.",
      addTrimExit:
        "Add on confirmation, trim on threshold breach, exit if invalidation trigger is hit.",
    },
    deckSlides: [
      {
        title: "Recommendation",
        bullets: [recommendationSummary, `Base value: $${baseValue}/share`],
        speakerNotes: "Open with recommendation and valuation frame.",
      },
      {
        title: "Why Now",
        bullets: [whyNow, whatChanged],
        speakerNotes: "Tie timing to source-backed evidence.",
      },
      {
        title: "Variant Perception",
        bullets: [variantPerception, marketMissing],
        speakerNotes: "Clarify consensus versus house view.",
      },
      {
        title: "Model Output",
        bullets: [
          `Revenue growth: ${formatPct(baseGrowth)}`,
          `Operating margin: ${formatPct(baseMargin)}`,
          `Base value: $${baseValue}/share`,
        ],
        speakerNotes: "Point PM to the workbook.",
      },
      {
        title: "Comps / Valuation",
        bullets: [
          `Bear/Base/Bull: $${bearValue}/$${baseValue}/$${bullValue}`,
          "Peer context shown in the comps sheet.",
        ],
        speakerNotes: "Anchor relative valuation.",
      },
      {
        title: "Risks / Trade Plan",
        bullets: [
          `Growth trigger: below ${formatPct(Math.max(baseGrowth - 0.03, -0.05))}`,
          `Margin trigger: below ${formatPct(Math.max(baseMargin - 0.03, -0.05))}`,
          "Add, trim, or exit according to threshold confirmation.",
        ],
        speakerNotes: "End with falsification and desk action.",
      },
    ],
  };

  return normalizeGeneratedContent(content);
};

export const generateEquityProjectContent = async (
  input: GenerateEquityProjectInput,
): Promise<EquityProjectGeneratedContent> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const researchContext =
    input.researchContext ??
    (await fetchEquityResearchContext({
      ticker: input.ticker,
      companyContext: input.companyContext,
    }));

  if (researchContext.sourceStatus === "unavailable") {
    throw new Error(
      "Could not load a source-backed company research pack for this ticker.",
    );
  }

  if (
    researchContext.sourceStatus === "cached" &&
    !USE_GEMINI_FOR_CACHED_RESEARCH
  ) {
    return buildSourceBackedProjectContent(input, researchContext);
  }

  let responseText: string | undefined;
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_EQUITY_PROJECT_MODEL,
        contents: [{ text: buildEquityProjectPrompt({ ...input, researchContext }) }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: GENERATED_CONTENT_SCHEMA,
          temperature: 0.25,
        },
      }),
      GEMINI_EQUITY_PROJECT_TIMEOUT_MS,
      "Project generation",
    );
    responseText = response.text;
  } catch (error) {
    if (error instanceof Error && /timed out/i.test(error.message)) {
      return buildSourceBackedProjectContent(input, researchContext);
    }
    throw error;
  }

  if (!responseText) {
    return buildSourceBackedProjectContent(input, researchContext);
  }

  const content = normalizeGeneratedContent(JSON.parse(responseText));
  return mergeResearchIntoGeneratedContent(content, researchContext);
};

export const generateEquityProject = async (
  input: GenerateEquityProjectInput,
): Promise<EquityProject> => {
  const project = createPendingEquityProject({
    ticker: input.ticker,
    recommendation: input.recommendation,
    rationale: input.rationale,
    submittedAt: new Date().toISOString(),
  });
  const content = await generateEquityProjectContent(input);
  return completeEquityProject({ project, content });
};

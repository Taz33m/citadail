import {
  completeEquityProject,
  createPendingEquityProject,
} from "@/lib/equity-project";
import type { EquityProjectGeneratedContent } from "@/types/session";

export const generatedEquityContentFixture: EquityProjectGeneratedContent = {
  companyOverview:
    "Source: Apple FY2024 Form 10-K. Apple is a premium consumer hardware and services platform with a large recurring services layer.",
  recommendationSummary:
    "User rationale: initial bias is constructive, supported by reported gross margin expansion and durable free cash flow generation.",
  whyNow:
    "Source: Apple FY2024 Form 10-K. Revenue returned to modest growth in FY2024 while gross margin expanded, making the next revision cycle important.",
  whatChanged:
    "Source: Apple FY2024 Form 10-K. FY2024 revenue increased versus FY2023 and gross profit expanded faster than revenue.",
  marketMissing:
    "User rationale: consensus may underweight services resilience against uneven device demand.",
  variantPerception:
    "Source: Apple FY2024 Form 10-K plus user rationale. Gross margin and FCF durability can support earnings even if hardware units stay muted.",
  bullCase:
    "Forward estimate: services growth accelerates and gross margin remains above the recent range.",
  baseCase:
    "Forward estimate: low-single-digit revenue growth and stable margins support a neutral-to-positive setup.",
  bearCase:
    "Forward estimate: device replacement cycles elongate and services growth decelerates.",
  catalysts: [
    "Forward estimate: earnings revision inflection.",
    "Forward estimate: product cycle update.",
    "Source: Apple FY2024 Form 10-K; monitor services margin disclosure and mix.",
  ],
  risks: [
    "Forward estimate: iPhone demand weakens.",
    "Forward estimate: regulatory pressure on app-store economics.",
    "Forward estimate: AI capex rises without revenue proof.",
  ],
  invalidationConditions: [
    "Services growth falls below mid-single digits.",
    "Gross margin compresses by more than 150 bps.",
    "Management guides to sustained hardware decline.",
  ],
  memoSections: [
    {
      heading: "What the Company Is",
      body: "Source: Apple FY2024 Form 10-K. Apple is a global device ecosystem with a high-margin services layer.",
    },
    {
      heading: "Recommendation",
      body: "User rationale: Buy / Long, supported by reported margin and cash generation.",
    },
    {
      heading: "Why Now",
      body: "Source: Apple FY2024 Form 10-K. Expectations can move around earnings, guidance, and product cycle data after reported FY2024 margin expansion.",
    },
    {
      heading: "What Changed",
      body: "Source: Apple FY2024 Form 10-K. Investor debate shifted from installed base size to growth quality and margin durability.",
    },
    {
      heading: "Risks and Falsification",
      body: "Forward estimate: the case breaks if services growth slows and margins compress together.",
    },
  ],
  evidence: [
    {
      label: "FY2024 revenue",
      value: "$391.0bn",
      source: "Apple FY2024 Form 10-K",
      implication:
        "Reported revenue growth resets the underwriting base after FY2023 pressure.",
    },
    {
      label: "FY2024 gross margin",
      value: "46.2%",
      source: "Apple FY2024 Form 10-K",
      implication:
        "Gross margin expansion supports the services mix and pricing discipline argument.",
    },
    {
      label: "FY2024 operating margin",
      value: "31.5%",
      source: "Apple FY2024 Form 10-K",
      implication:
        "Operating margin anchors the earnings durability case.",
    },
    {
      label: "FY2024 free cash flow",
      value: "$108.8bn",
      source: "Apple FY2024 Form 10-K",
      implication:
        "High FCF supports capital return and downside resilience.",
    },
    {
      label: "FY2024 net margin",
      value: "24.0%",
      source: "Apple FY2024 Form 10-K",
      implication:
        "Net margin converts the operating story into earnings power.",
    },
  ],
  modelAssumptions: [
    { label: "Reported Revenue Base", value: "$391.0bn", source: "Apple FY2024 Form 10-K" },
    { label: "Reported Gross Margin", value: "46.2%", source: "Apple FY2024 Form 10-K" },
    { label: "Reported Operating Margin", value: "31.5%", source: "Apple FY2024 Form 10-K" },
    { label: "Reported FCF Margin", value: "27.8%", source: "Apple FY2024 Form 10-K" },
  ],
  forecast: [
    {
      year: "FY2024",
      revenue: 391035,
      revenueGrowth: 0.0202,
      grossMargin: 0.4621,
      operatingMargin: 0.3151,
      freeCashFlowMargin: 0.2782,
    },
    {
      year: "FY1",
      revenue: 401700,
      revenueGrowth: 0.03,
      grossMargin: 0.452,
      operatingMargin: 0.312,
      freeCashFlowMargin: 0.272,
    },
    {
      year: "FY2",
      revenue: 415760,
      revenueGrowth: 0.035,
      grossMargin: 0.454,
      operatingMargin: 0.314,
      freeCashFlowMargin: 0.274,
    },
    {
      year: "FY3",
      revenue: 432390,
      revenueGrowth: 0.04,
      grossMargin: 0.456,
      operatingMargin: 0.316,
      freeCashFlowMargin: 0.276,
    },
    {
      year: "FY4",
      revenue: 449685,
      revenueGrowth: 0.04,
      grossMargin: 0.456,
      operatingMargin: 0.317,
      freeCashFlowMargin: 0.277,
    },
  ],
  valuation: [
    { metric: "Base Case Value", value: "$220/share", source: "Forward estimate from reported baseline" },
    { metric: "Bull Case Value", value: "$260/share", source: "Forward estimate from reported baseline" },
    { metric: "Bear Case Value", value: "$170/share", source: "Forward estimate from reported baseline" },
  ],
  sensitivity: [
    {
      case: "Bear",
      revenueGrowth: 0.01,
      operatingMargin: 0.28,
      impliedValue: 170,
    },
    {
      case: "Base",
      revenueGrowth: 0.035,
      operatingMargin: 0.315,
      impliedValue: 220,
    },
    {
      case: "Bull",
      revenueGrowth: 0.055,
      operatingMargin: 0.34,
      impliedValue: 260,
    },
  ],
  comps: [
    {
      ticker: "MSFT",
      company: "Microsoft",
      evRevenue: 12.2,
      evEbitda: 24.5,
      pe: 31.1,
      rationale: "Source: peer classification; mega-cap quality growth peer.",
    },
    {
      ticker: "GOOGL",
      company: "Alphabet",
      evRevenue: 5.9,
      evEbitda: 15.2,
      pe: 21.4,
      rationale: "Source: peer classification; mega-cap platform peer.",
    },
    {
      ticker: "META",
      company: "Meta Platforms",
      evRevenue: 7.4,
      evEbitda: 14.1,
      pe: 22.6,
      rationale: "Source: peer classification; mega-cap consumer technology peer.",
    },
  ],
  riskTriggers: [
    {
      trigger: "Services slowdown",
      threshold: "Growth below mid-single digits",
      action: "Re-underwrite thesis.",
    },
    {
      trigger: "Margin compression",
      threshold: "Gross margin down more than 150 bps",
      action: "Trim or exit paper position.",
    },
    {
      trigger: "Hardware guide-down",
      threshold: "Sustained device revenue decline",
      action: "Mark thesis weakened.",
    },
  ],
  tradeProposal: {
    bias: "Long bias",
    entryZone: "Build on weakness near prior support; do not chase gaps.",
    positionSize: "Starter 2%; add only after margin confirmation.",
    timeHorizon: "Multi-week to multi-month.",
    addTrimExit: "Add on services confirmation, trim on guide-down, exit on margin break.",
  },
  deckSlides: [
    {
      title: "Thesis Summary",
      bullets: ["User rationale supports long bias.", "Source: FY2024 Form 10-K supports margin durability focus."],
      speakerNotes: "Frame the recommendation and the evidence still needed.",
    },
    {
      title: "Variant Perception",
      bullets: ["Consensus watches units.", "We watch services mix and margin durability."],
      speakerNotes: "Explain the edge.",
    },
    {
      title: "Model Output",
      bullets: ["Base case value: $220/share.", "Forward estimate: operating margin expands modestly."],
      speakerNotes: "Tie numbers back to the story.",
    },
    {
      title: "Comps / Valuation",
      bullets: ["Premium must be justified by quality.", "Peer set is framed by source-labeled classification."],
      speakerNotes: "Anchor valuation.",
    },
    {
      title: "Risks and Falsification",
      bullets: ["Services slowdown breaks the thesis.", "Margin compression forces action."],
      speakerNotes: "Start with what can go wrong.",
    },
    {
      title: "Trade Plan",
      bullets: ["Starter sizing only.", "Add after confirmation; exit on invalidation."],
      speakerNotes: "Bridge research to desk action.",
    },
  ],
};

export const buildReadyEquityProjectFixture = () =>
  completeEquityProject({
    project: createPendingEquityProject({
      ticker: "AAPL",
      recommendation: "buy-long",
      rationale: "Services durability is underappreciated.",
      submittedAt: "2026-04-18T00:00:00.000Z",
    }),
    content: generatedEquityContentFixture,
  });

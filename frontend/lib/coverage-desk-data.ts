export type CoverageDeskState = "covered" | "watchlist" | "flagged";

export type CoverageRecommendation = "BUY" | "HOLD" | "SELL" | "UNRATED";

export type CoverageStatus = "intact" | "watching" | "flagged" | "stale";

export interface CoverageDeskItem {
  ticker: string;
  companyName: string;
  sector: string;
  state: CoverageDeskState;
  recommendation: CoverageRecommendation;
  conviction: string;
  lastCheck: string;
  status: CoverageStatus;
  summary: string;
  flagReason?: string;
}

export const coverageDeskItems: CoverageDeskItem[] = [
  {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    sector: "Consumer Hardware",
    state: "covered",
    recommendation: "HOLD",
    conviction: "Medium",
    lastCheck: "Post-Q1 earnings",
    status: "intact",
    summary: "Services resilience offsets iPhone unit pressure; thesis needs margin discipline.",
  },
  {
    ticker: "MSFT",
    companyName: "Microsoft Corporation",
    sector: "Software",
    state: "covered",
    recommendation: "BUY",
    conviction: "High",
    lastCheck: "Azure update",
    status: "intact",
    summary: "Cloud and AI infrastructure demand remain the primary underwriting drivers.",
  },
  {
    ticker: "NVDA",
    companyName: "NVIDIA Corporation",
    sector: "Semiconductors",
    state: "covered",
    recommendation: "BUY",
    conviction: "Medium",
    lastCheck: "Supply chain review",
    status: "watching",
    summary: "Data center demand is intact, but expectations leave less room for execution errors.",
  },
  {
    ticker: "AMZN",
    companyName: "Amazon.com, Inc.",
    sector: "Internet Retail",
    state: "watchlist",
    recommendation: "UNRATED",
    conviction: "Pending",
    lastCheck: "Watchlist add",
    status: "watching",
    summary: "Awaiting clearer AWS acceleration and retail margin durability before coverage.",
  },
  {
    ticker: "GOOGL",
    companyName: "Alphabet Inc.",
    sector: "Internet Services",
    state: "watchlist",
    recommendation: "UNRATED",
    conviction: "Pending",
    lastCheck: "Regulatory scan",
    status: "watching",
    summary: "AI search disruption and regulatory remedies need tighter scenario framing.",
  },
  {
    ticker: "TSLA",
    companyName: "Tesla, Inc.",
    sector: "Autos",
    state: "flagged",
    recommendation: "HOLD",
    conviction: "Low",
    lastCheck: "Delivery update",
    status: "flagged",
    summary: "Volume growth no longer offsets pricing pressure without margin confirmation.",
    flagReason: "Margin pressure",
  },
  {
    ticker: "DIS",
    companyName: "The Walt Disney Company",
    sector: "Media",
    state: "flagged",
    recommendation: "HOLD",
    conviction: "Medium",
    lastCheck: "Segment review",
    status: "flagged",
    summary: "Parks normalization and streaming profitability need a fresh catalyst check.",
    flagReason: "Catalyst drift",
  },
  {
    ticker: "ADBE",
    companyName: "Adobe Inc.",
    sector: "Software",
    state: "flagged",
    recommendation: "SELL",
    conviction: "Medium",
    lastCheck: "Product cycle review",
    status: "flagged",
    summary: "Generative AI monetization assumptions remain ahead of observed seat expansion.",
    flagReason: "Assumption risk",
  },
];

export const normalizeCoverageDeskQuery = (query: string) =>
  query.trim().toLowerCase();

export const filterCoverageDeskItems = (
  items: CoverageDeskItem[],
  query: string,
) => {
  const normalizedQuery = normalizeCoverageDeskQuery(query);
  if (!normalizedQuery) return [];

  return items.filter((item) => {
    const fields = [item.ticker, item.companyName, item.sector];
    return fields.some((field) => field.toLowerCase().includes(normalizedQuery));
  });
};

export const getCoverageDeskSectionItems = (
  items: CoverageDeskItem[],
  state: CoverageDeskState,
) => items.filter((item) => item.state === state);

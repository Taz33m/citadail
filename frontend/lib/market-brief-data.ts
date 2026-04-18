export type MarketBriefTone = "positive" | "neutral" | "negative";

export interface MarketBriefIndex {
  symbol: string;
  label: string;
  price: number | null;
  changePercent: number | null;
}

export interface MarketBriefNewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url?: string;
  publishedAt?: string;
}

export interface MarketBriefScreenerItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  relativeVolume: number | null;
}

export interface MarketBriefMacroItem {
  symbol: string;
  name: string;
  value: number | null;
  unit: string;
  previous: number | null;
}

export interface MarketBriefSentiment {
  tone: MarketBriefTone;
  label: string;
  summary: string;
}

export interface MarketBriefPayload {
  asOf: string;
  sourceStatus: "internal" | "partial" | "seed";
  sentiment: MarketBriefSentiment;
  leadStory: MarketBriefNewsItem;
  news: MarketBriefNewsItem[];
  indices: MarketBriefIndex[];
  macro: MarketBriefMacroItem[];
  screeners: {
    gainers: MarketBriefScreenerItem[];
    losers: MarketBriefScreenerItem[];
    active: MarketBriefScreenerItem[];
  };
}

interface BuildMarketBriefInput {
  asOf?: string;
  news?: unknown;
  screener?: unknown;
  indices?: Record<string, unknown>;
  macro?: unknown;
}

const indexLabels: Record<string, string> = {
  SPY: "S&P",
  QQQ: "Nasdaq",
  DIA: "Dow",
};

const fallbackNews: MarketBriefNewsItem[] = [
  {
    id: "seed-lead",
    headline: "Market tone is mixed as investors wait for the next catalyst.",
    summary:
      "Index moves are narrow, leadership remains selective, and desk attention is on earnings revisions, rates, and high-volume single-name moves.",
    source: "Seed brief",
  },
  {
    id: "seed-news-1",
    headline: "Mega-cap technology remains the main swing factor for risk.",
    summary:
      "The tape is still sensitive to AI capex commentary, cloud demand, and margin durability.",
    source: "Seed brief",
  },
  {
    id: "seed-news-2",
    headline: "Rate expectations keep valuation discipline in focus.",
    summary:
      "Long-duration growth names need earnings support if yields stay firm.",
    source: "Seed brief",
  },
  {
    id: "seed-news-3",
    headline: "Single-name dispersion is elevated across the coverage list.",
    summary:
      "Gainers and decliners are being driven more by company-specific catalysts than broad beta.",
    source: "Seed brief",
  },
];

const fallbackScreeners = {
  gainers: [
    {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      price: 881.86,
      change: 32.1,
      changePercent: 3.78,
      volume: 54200000,
      relativeVolume: 1.4,
    },
    {
      symbol: "ADBE",
      name: "Adobe Inc.",
      price: 533.2,
      change: 13.8,
      changePercent: 2.66,
      volume: 6200000,
      relativeVolume: 1.2,
    },
    {
      symbol: "MSFT",
      name: "Microsoft Corporation",
      price: 421.44,
      change: 7.9,
      changePercent: 1.91,
      volume: 24300000,
      relativeVolume: 1.1,
    },
  ],
  losers: [
    {
      symbol: "TSLA",
      name: "Tesla, Inc.",
      price: 171.11,
      change: -7.6,
      changePercent: -4.25,
      volume: 81200000,
      relativeVolume: 1.7,
    },
    {
      symbol: "NFLX",
      name: "Netflix, Inc.",
      price: 609.58,
      change: -18.4,
      changePercent: -2.93,
      volume: 9500000,
      relativeVolume: 1.3,
    },
    {
      symbol: "DIS",
      name: "The Walt Disney Company",
      price: 112.74,
      change: -2.2,
      changePercent: -1.91,
      volume: 13700000,
      relativeVolume: 1.1,
    },
  ],
  active: [
    {
      symbol: "TSLA",
      name: "Tesla, Inc.",
      price: 171.11,
      change: -7.6,
      changePercent: -4.25,
      volume: 81200000,
      relativeVolume: 1.7,
    },
    {
      symbol: "NVDA",
      name: "NVIDIA Corporation",
      price: 881.86,
      change: 32.1,
      changePercent: 3.78,
      volume: 54200000,
      relativeVolume: 1.4,
    },
    {
      symbol: "AAPL",
      name: "Apple Inc.",
      price: 189.98,
      change: 0.8,
      changePercent: 0.42,
      volume: 49800000,
      relativeVolume: 0.9,
    },
  ],
};

export const seedMarketBrief: MarketBriefPayload = {
  asOf: "2026-04-18T09:00:00-04:00",
  sourceStatus: "seed",
  sentiment: {
    tone: "neutral",
    label: "Market tone is mixed.",
    summary:
      "Leadership remains selective while market data refreshes.",
  },
  leadStory: fallbackNews[0],
  news: fallbackNews,
  indices: [
    { symbol: "SPY", label: "S&P", price: 522.1, changePercent: 0.18 },
    { symbol: "QQQ", label: "Nasdaq", price: 446.35, changePercent: 0.31 },
    { symbol: "DIA", label: "Dow", price: 384.92, changePercent: -0.05 },
  ],
  macro: [
    {
      symbol: "TNX",
      name: "10-Year Treasury Yield",
      value: 4.34,
      unit: "%",
      previous: 4.29,
    },
  ],
  screeners: fallbackScreeners,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,%]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeNewsSource = (source: unknown) => {
  if (isRecord(source)) {
    return asString(source.name) ?? asString(source.id) ?? "Market News";
  }
  return asString(source) ?? "Market News";
};

export const normalizeNewsArticles = (raw: unknown): MarketBriefNewsItem[] => {
  const sourceItems = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.articles)
      ? raw.articles
      : isRecord(raw) && Array.isArray(raw.news)
        ? raw.news
        : [];

  return sourceItems
    .flatMap((item, index) => {
      if (!isRecord(item)) return [];
      const headline =
        asString(item.headline) ??
        asString(item.title) ??
        asString(item.name) ??
        null;
      if (!headline) return [];

      const rawDatetime = asNumber(item.datetime);
      const publishedAt =
        asString(item.publishedAt) ??
        asString(item.published_at) ??
        (rawDatetime ? new Date(rawDatetime * 1000).toISOString() : undefined);

      return [
        {
          id: asString(item.id) ?? `news-${index}`,
          headline,
          summary:
            asString(item.summary) ??
            asString(item.description) ??
            asString(item.snippet) ??
            "No summary provided.",
          source: normalizeNewsSource(item.source ?? item.publisher),
          url: asString(item.url) ?? asString(item.link) ?? undefined,
          publishedAt,
        },
      ];
    })
    .slice(0, 8);
};

const normalizeScreenerRow = (
  item: unknown,
): MarketBriefScreenerItem | null => {
  if (!isRecord(item)) return null;
  const symbol = asString(item.symbol) ?? asString(item.ticker);
  if (!symbol) return null;

  return {
    symbol,
    name:
      asString(item.name) ??
      asString(item.companyName) ??
      asString(item.company_name) ??
      symbol,
    price:
      asNumber(item.price) ??
      asNumber(item.currentPrice) ??
      asNumber(item.current_price),
    change:
      asNumber(item.change) ??
      asNumber(item.day_change) ??
      asNumber(item.changeAmount),
    changePercent:
      asNumber(item.percent_change) ??
      asNumber(item.changePercent) ??
      asNumber(item.change_percent),
    volume: asNumber(item.volume),
    relativeVolume:
      asNumber(item.relative_volume_20d) ?? asNumber(item.relativeVolume),
  };
};

const normalizeScreenerRows = (raw: unknown): MarketBriefScreenerItem[] =>
  (Array.isArray(raw) ? raw : [])
    .flatMap((item) => {
      const normalized = normalizeScreenerRow(item);
      return normalized ? [normalized] : [];
    })
    .slice(0, 5);

export const normalizeScreenerPayload = (raw: unknown) => {
  if (!isRecord(raw)) return seedMarketBrief.screeners;

  const gainers = normalizeScreenerRows(raw.gainers);
  const losers = normalizeScreenerRows(raw.losers);
  const active = normalizeScreenerRows(raw.active);

  return {
    gainers: gainers.length ? gainers : seedMarketBrief.screeners.gainers,
    losers: losers.length ? losers : seedMarketBrief.screeners.losers,
    active: active.length ? active : seedMarketBrief.screeners.active,
  };
};

export const normalizeIndexPayloads = (
  raw: Record<string, unknown> | undefined,
): MarketBriefIndex[] =>
  Object.entries(indexLabels).map(([symbol, label]) => {
    const item = raw?.[symbol];
    const record = isRecord(item) ? item : {};
    return {
      symbol,
      label,
      price:
        asNumber(record.price) ??
        asNumber(record.currentPrice) ??
        asNumber(record.regularMarketPrice),
      changePercent:
        asNumber(record.changePercent) ??
        asNumber(record.change_percent) ??
        asNumber(record.percent_change),
    };
  });

export const normalizeMacroPayload = (raw: unknown): MarketBriefMacroItem[] =>
  (Array.isArray(raw) ? raw : [])
    .flatMap((item) => {
      if (!isRecord(item)) return [];
      const symbol = asString(item.symbol);
      const name = asString(item.name);
      if (!symbol || !name) return [];
      return [
        {
          symbol,
          name,
          value: asNumber(item.value),
          unit: asString(item.unit) ?? "",
          previous: asNumber(item.prev) ?? asNumber(item.previous),
        },
      ];
    })
    .slice(0, 4);

const buildSentiment = (
  indices: MarketBriefIndex[],
  macro: MarketBriefMacroItem[],
): MarketBriefSentiment => {
  const changes = indices
    .map((item) => item.changePercent)
    .filter((value): value is number => value !== null);

  const average =
    changes.length > 0
      ? changes.reduce((total, value) => total + value, 0) / changes.length
      : 0;
  const strongestIndex = [...indices]
    .filter((item) => item.changePercent !== null)
    .sort((left, right) => Math.abs(right.changePercent ?? 0) - Math.abs(left.changePercent ?? 0))[0];
  const tenYear = macro.find((item) => item.symbol === "TNX");

  if (average >= 0.35) {
    return {
      tone: "positive",
      label: "Risk appetite is constructive.",
      summary: `${strongestIndex?.label ?? "Major indices"} lead the tape, while ${tenYear?.name ?? "rates"} remain part of the valuation check.`,
    };
  }

  if (average <= -0.35) {
    return {
      tone: "negative",
      label: "Risk appetite is defensive.",
      summary: `${strongestIndex?.label ?? "Major indices"} are pressuring the open, with leadership narrowing and downside moves concentrated in high-beta names.`,
    };
  }

  return {
    tone: "neutral",
    label: "Market tone is mixed.",
    summary: `${strongestIndex?.label ?? "Major indices"} is the cleanest signal, but the broader tape is not giving a one-way read.`,
  };
};

export const buildMarketBriefFromSources = ({
  asOf = new Date().toISOString(),
  news,
  screener,
  indices,
  macro,
}: BuildMarketBriefInput): MarketBriefPayload => {
  const normalizedNews = normalizeNewsArticles(news);
  const normalizedScreeners = normalizeScreenerPayload(screener);
  const normalizedIndices = normalizeIndexPayloads(indices);
  const normalizedMacro = normalizeMacroPayload(macro);
  const hasLiveData =
    normalizedNews.length > 0 ||
    normalizedIndices.some((item) => item.changePercent !== null) ||
    normalizedMacro.length > 0;

  const resolvedNews = normalizedNews.length ? normalizedNews : fallbackNews;
  const resolvedIndices = normalizedIndices.some(
    (item) => item.price !== null || item.changePercent !== null,
  )
    ? normalizedIndices
    : seedMarketBrief.indices;
  const resolvedMacro = normalizedMacro.length ? normalizedMacro : seedMarketBrief.macro;

  return {
    asOf,
    sourceStatus: hasLiveData ? "internal" : "seed",
    sentiment: buildSentiment(resolvedIndices, resolvedMacro),
    leadStory: resolvedNews[0],
    news: resolvedNews,
    indices: resolvedIndices,
    macro: resolvedMacro,
    screeners: normalizedScreeners,
  };
};

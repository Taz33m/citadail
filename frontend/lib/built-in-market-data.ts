import type {
  MarketBriefIndex,
  MarketBriefMacroItem,
  MarketBriefNewsItem,
  MarketBriefScreenerItem,
} from "@/lib/market-brief-data";

const INDEX_SYMBOLS = ["SPY", "QQQ", "DIA"] as const;
const MACRO_SYMBOLS = ["^TNX", "^VIX"] as const;
const SCREENER_SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AMD",
  "AVGO",
  "NFLX",
  "ADBE",
  "JPM",
  "XOM",
  "LLY",
  "UNH",
  "DIS",
] as const;

interface YahooQuote {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  regularMarketPreviousClose?: number;
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: YahooQuote[];
  };
}

interface YahooNewsItem {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
}

interface YahooSearchResponse {
  news?: YahooNewsItem[];
}

interface FinnhubNewsItem {
  id?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  datetime?: number;
}

export interface BuiltInMarketSources {
  news?: MarketBriefNewsItem[];
  screener?: {
    gainers: MarketBriefScreenerItem[];
    losers: MarketBriefScreenerItem[];
    active: MarketBriefScreenerItem[];
  };
  macro?: MarketBriefMacroItem[];
  indices?: Record<string, MarketBriefIndex>;
  successCount: number;
  failedCount: number;
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "Citadail/1.0",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const fetchYahooQuotes = async (symbols: readonly string[]) => {
  const encodedSymbols = encodeURIComponent(symbols.join(","));
  const payload = await fetchJson<YahooQuoteResponse>(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodedSymbols}`,
  );

  return payload.quoteResponse?.result ?? [];
};

const quoteName = (quote: YahooQuote) =>
  quote.longName ?? quote.shortName ?? quote.symbol ?? "Unknown";

const toScreenerItem = (quote: YahooQuote): MarketBriefScreenerItem | null => {
  if (!quote.symbol) return null;

  return {
    symbol: quote.symbol,
    name: quoteName(quote),
    price: finiteNumber(quote.regularMarketPrice),
    change: finiteNumber(quote.regularMarketChange),
    changePercent: finiteNumber(quote.regularMarketChangePercent),
    volume: finiteNumber(quote.regularMarketVolume),
    relativeVolume: null,
  };
};

const buildScreeners = (quotes: YahooQuote[]) => {
  const rows = quotes
    .flatMap((quote) => {
      const row = toScreenerItem(quote);
      return row ? [row] : [];
    })
    .filter((row) => !INDEX_SYMBOLS.some((symbol) => symbol === row.symbol));

  return {
    gainers: [...rows]
      .filter((row) => (row.changePercent ?? 0) > 0)
      .sort((left, right) => (right.changePercent ?? 0) - (left.changePercent ?? 0))
      .slice(0, 5),
    losers: [...rows]
      .filter((row) => (row.changePercent ?? 0) < 0)
      .sort((left, right) => (left.changePercent ?? 0) - (right.changePercent ?? 0))
      .slice(0, 5),
    active: [...rows]
      .sort((left, right) => (right.volume ?? 0) - (left.volume ?? 0))
      .slice(0, 5),
  };
};

const buildIndices = (quotes: YahooQuote[]): Record<string, MarketBriefIndex> =>
  Object.fromEntries(
    INDEX_SYMBOLS.map((symbol) => {
      const quote = quotes.find((item) => item.symbol === symbol);
      return [
        symbol,
        {
          symbol,
          label: symbol === "SPY" ? "S&P" : symbol === "QQQ" ? "Nasdaq" : "Dow",
          price: finiteNumber(quote?.regularMarketPrice),
          changePercent: finiteNumber(quote?.regularMarketChangePercent),
        },
      ];
    }),
  );

const buildMacro = (quotes: YahooQuote[]): MarketBriefMacroItem[] =>
  MACRO_SYMBOLS.flatMap((symbol) => {
    const quote = quotes.find((item) => item.symbol === symbol);
    const value = finiteNumber(quote?.regularMarketPrice);
    if (value === null) return [];

    return [
      {
        symbol: symbol === "^TNX" ? "TNX" : "VIX",
        name:
          symbol === "^TNX"
            ? "10-Year Treasury Yield"
            : "CBOE Volatility Index",
        value,
        unit: symbol === "^TNX" ? "%" : "",
        previous: finiteNumber(quote?.regularMarketPreviousClose),
      },
    ];
  });

const fetchFinnhubNews = async (): Promise<MarketBriefNewsItem[]> => {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return [];

  const payload = await fetchJson<FinnhubNewsItem[]>(
    `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`,
  );

  return payload.slice(0, 8).flatMap((item, index) => {
    if (!item.headline) return [];
    return [
      {
        id: item.id ? String(item.id) : `finnhub-${index}`,
        headline: item.headline,
        summary: item.summary || "No summary provided.",
        source: item.source || "Finnhub",
        url: item.url,
        publishedAt: item.datetime
          ? new Date(item.datetime * 1000).toISOString()
          : undefined,
      },
    ];
  });
};

const fetchYahooNews = async (): Promise<MarketBriefNewsItem[]> => {
  const payload = await fetchJson<YahooSearchResponse>(
    "https://query1.finance.yahoo.com/v1/finance/search?q=stock%20market%20earnings%20rates&quotesCount=0&newsCount=8",
  );

  return (payload.news ?? []).slice(0, 8).flatMap((item, index) => {
    if (!item.title) return [];
    return [
      {
        id: item.uuid ?? `yahoo-news-${index}`,
        headline: item.title,
        summary: "Market news item.",
        source: item.publisher ?? "Yahoo Finance",
        url: item.link,
        publishedAt: item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : undefined,
      },
    ];
  });
};

const fetchBuiltInNews = async () => {
  const finnhubNews = await fetchFinnhubNews().catch(() => []);
  if (finnhubNews.length) return finnhubNews;
  return fetchYahooNews();
};

export const fetchBuiltInMarketSources =
  async (): Promise<BuiltInMarketSources> => {
    const quoteSymbols = [
      ...INDEX_SYMBOLS,
      ...MACRO_SYMBOLS,
      ...SCREENER_SYMBOLS,
    ];
    const [quoteResult, newsResult] = await Promise.allSettled([
      fetchYahooQuotes(quoteSymbols),
      fetchBuiltInNews(),
    ]);

    const quotes = quoteResult.status === "fulfilled" ? quoteResult.value : [];
    const news = newsResult.status === "fulfilled" ? newsResult.value : [];
    const successCount = [
      quotes.length > 0,
      news.length > 0,
    ].filter(Boolean).length;

    return {
      news: news.length ? news : undefined,
      screener: quotes.length ? buildScreeners(quotes) : undefined,
      macro: quotes.length ? buildMacro(quotes) : undefined,
      indices: quotes.length ? buildIndices(quotes) : undefined,
      successCount,
      failedCount: 2 - successCount,
    };
  };

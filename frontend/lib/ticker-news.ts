export interface TickerNewsItem {
  title: string;
  summary: string;
  source: string;
  url?: string;
  publishedAt?: string;
}

interface YahooNewsItem {
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  summary?: string;
}

interface YahooSearchResponse {
  news?: YahooNewsItem[];
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": "Citadail/1.0",
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/rss+xml,text/xml,text/plain",
      "user-agent": "Citadail/1.0",
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return response.text();
};

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const tagValue = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]
    ? decodeXmlEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim())
    : "";
};

const normalizeTicker = (ticker: string) =>
  ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);

const normalizeDate = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim() : parsed.toISOString();
};

const uniqueByTitle = (items: TickerNewsItem[]) => {
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const key = item.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return [];
    seen.add(key);
    return [item];
  });
};

const fetchYahooTickerNews = async (ticker: string): Promise<TickerNewsItem[]> => {
  const payload = await fetchJson<YahooSearchResponse>(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(`${ticker} stock news earnings guidance`)}&quotesCount=0&newsCount=8`,
  );

  return (payload.news ?? []).flatMap((item) => {
    if (!item.title) return [];
    return [
      {
        title: item.title,
        summary: item.summary || "Recent market headline.",
        source: item.publisher || "Yahoo Finance",
        ...(item.link ? { url: item.link } : {}),
        ...(normalizeDate(item.providerPublishTime)
          ? { publishedAt: normalizeDate(item.providerPublishTime) }
          : {}),
      },
    ];
  });
};

const fetchGoogleTickerNews = async (ticker: string): Promise<TickerNewsItem[]> => {
  const rssUrl = new URL("https://news.google.com/rss/search");
  rssUrl.searchParams.set("q", `${ticker} stock earnings guidance investor`);
  rssUrl.searchParams.set("hl", "en-US");
  rssUrl.searchParams.set("gl", "US");
  rssUrl.searchParams.set("ceid", "US:en");

  const xml = await fetchText(rssUrl.toString());
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .slice(0, 8)
    .flatMap((match) => {
      const block = match[1] ?? "";
      const title = tagValue(block, "title");
      const link = tagValue(block, "link");
      const source = tagValue(block, "source") || "Google News";
      const publishedAt = normalizeDate(tagValue(block, "pubDate"));
      if (!title) return [];
      return [
        {
          title,
          summary: "Recent market headline.",
          source,
          ...(link ? { url: link } : {}),
          ...(publishedAt ? { publishedAt } : {}),
        },
      ];
    });
};

const fetchPerplexityTickerNews = async (ticker: string): Promise<TickerNewsItem[]> => {
  if (!process.env.PERPLEXITY_API_KEY) return [];

  const { searchPerplexitySources } = await import("@/lib/full-auto-perplexity");
  const sources = await searchPerplexitySources({
    maxResults: 5,
    query: `${ticker} stock latest news earnings guidance investor debate`,
    ticker,
  });

  return sources.map((source) => ({
    title: source.title,
    summary: source.text,
    source: source.sourceUrl ? "Perplexity source" : "Perplexity",
    ...(source.sourceUrl ? { url: source.sourceUrl } : {}),
    publishedAt: source.publishedAt,
  }));
};

const staticTestNews = (ticker: string): TickerNewsItem[] => [
  {
    title: `${ticker} investor headlines update`,
    summary:
      "Current-news test fixture for the Spectrum ticker news command.",
    source: "Citadail test fixture",
    publishedAt: "2026-04-18T12:00:00.000Z",
  },
];

export const fetchCurrentTickerNews = async (
  ticker: string,
  maxItems = 5,
): Promise<TickerNewsItem[]> => {
  const normalizedTicker = normalizeTicker(ticker);
  if (!normalizedTicker) return [];

  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") {
    return staticTestNews(normalizedTicker).slice(0, maxItems);
  }

  const results = await Promise.allSettled([
    fetchPerplexityTickerNews(normalizedTicker),
    fetchYahooTickerNews(normalizedTicker),
    fetchGoogleTickerNews(normalizedTicker),
  ]);

  return uniqueByTitle(
    results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
  ).slice(0, maxItems);
};

import type { HistoricalSource } from "@/types/full-auto";

interface PerplexitySearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  date?: string;
  last_updated?: string;
}

interface PerplexitySearchResponse {
  results?: PerplexitySearchResult[];
}

export interface SearchPerplexitySourcesInput {
  query: string;
  ticker: string;
  searchAfterDate?: string;
  searchBeforeDate?: string;
  maxResults?: number;
}

const endpoint = "https://api.perplexity.ai/search";

const toFilterDate = (value: string | undefined) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`;
};

export const normalizePerplexityResultsToSources = ({
  results,
  ticker,
}: {
  results: PerplexitySearchResult[];
  ticker: string;
}): HistoricalSource[] =>
  results.flatMap((result, index) => {
    const title = result.title?.trim();
    const text = result.snippet?.replace(/\s+/g, " ").trim();
    const url = result.url?.trim();
    const publishedAt = result.date ?? result.last_updated;
    if (!title || !text || !publishedAt) return [];
    const knownAt = new Date(publishedAt).toISOString();
    return [
      {
        sourceId: `${ticker.toUpperCase()}-${publishedAt}-perplexity-${index}`,
        ticker: ticker.toUpperCase(),
        sourceType: "news",
        title,
        text,
        ...(url ? { sourceUrl: url } : {}),
        publishedAt: knownAt,
        knownAt,
        asOfDate: knownAt.slice(0, 10),
        retrievedAt: new Date().toISOString(),
        snapshotId: "perplexity-import",
      },
    ];
  });

export const searchPerplexitySources = async ({
  maxResults = 8,
  query,
  searchAfterDate,
  searchBeforeDate,
  ticker,
}: SearchPerplexitySourcesInput): Promise<HistoricalSource[]> => {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not configured.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      country: "US",
      max_results: Math.min(Math.max(maxResults, 1), 20),
      max_tokens_per_page: 1024,
      ...(searchAfterDate
        ? { search_after_date_filter: toFilterDate(searchAfterDate) }
        : {}),
      ...(searchBeforeDate
        ? { search_before_date_filter: toFilterDate(searchBeforeDate) }
        : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`Perplexity Search failed with ${response.status}.`);
  }

  const payload = (await response.json()) as PerplexitySearchResponse;
  return normalizePerplexityResultsToSources({
    results: payload.results ?? [],
    ticker,
  });
};


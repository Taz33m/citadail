import { GoogleGenAI } from "@google/genai";

import type { EquityCompanyContext } from "@/lib/equity-project";
import type {
  EquityEvidenceItem,
  EquityForecastRow,
  EquityModelAssumption,
} from "@/types/session";

interface SecCompanyTickerRow {
  cik_str?: number;
  ticker?: string;
  title?: string;
}

interface SecFactUnit {
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  end?: string;
  val?: number;
}

interface SecCompanyFacts {
  cik?: number;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        label?: string;
        units?: Record<string, SecFactUnit[]>;
      }
    >;
  };
}

interface SecSubmissions {
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      form?: string[];
      primaryDocument?: string[];
      primaryDocDescription?: string[];
    };
  };
}

interface YahooQuoteResponse {
  quoteResponse?: {
    result?: Array<Record<string, unknown>>;
  };
}

interface YahooSearchResponse {
  news?: Array<Record<string, unknown>>;
}

export interface EquityReportedFinancial {
  year: string;
  fiscalYear: number;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  assets: number | null;
  liabilities: number | null;
  equity: number | null;
  filed: string | null;
  source: string;
}

export type EquitySourceDocumentType =
  | "company_profile"
  | "filing_change"
  | "market_data"
  | "news"
  | "reported_financials"
  | "sec_section";

export interface EquitySourceDocument {
  id: string;
  docType: EquitySourceDocumentType;
  title: string;
  source: string;
  sourceUrl?: string;
  publishedAt?: string;
  sectionKey?: string;
  text: string;
}

export interface EquityResearchContext {
  ticker: string;
  companyName?: string;
  asOf: string;
  sourceStatus: "source-backed" | "cached" | "unavailable";
  sources: string[];
  evidence: EquityEvidenceItem[];
  annualFinancials: EquityReportedFinancial[];
  modelAssumptions: EquityModelAssumption[];
  forecastBaseline: EquityForecastRow | null;
  sourceDocuments: EquitySourceDocument[];
  promptBlock: string;
}

interface CachedResearchSeed {
  ticker: string;
  companyName: string;
  asOf: string;
  sourceStatus: "cached";
  sources: string[];
  annualFinancials: EquityReportedFinancial[];
  sourceDocuments: EquitySourceDocument[];
}

interface FilingRow {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocument: string;
  description?: string;
  url: string;
}

const MILLION = 1_000_000;
const MAX_SOURCE_DOCS_FOR_PROMPT = 12;
const MAX_DOC_TEXT_FOR_PROMPT = 850;
const GEMINI_SEARCH_MODEL =
  process.env.GEMINI_EQUITY_SEARCH_MODEL ??
  process.env.GEMINI_EQUITY_PROJECT_MODEL ??
  "gemini-2.5-flash";
const ENABLE_GEMINI_SEARCH =
  process.env.EQUITY_ENABLE_GEMINI_SEARCH?.toLowerCase() !== "false";
const GEMINI_SEARCH_TIMEOUT_MS = Number(
  process.env.GEMINI_SEARCH_TIMEOUT_MS ?? 10_000,
);
const PREFER_CACHED_RESEARCH =
  process.env.EQUITY_PREFER_CACHED_RESEARCH?.toLowerCase() !== "false";
const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? "Citadail research contact@example.com";

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timed out.")), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const secTagGroups = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss"],
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities",
    "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
  ],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  assets: ["Assets"],
  liabilities: ["Liabilities"],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
} as const;

type SecMetricKey = keyof typeof secTagGroups;

const cachedResearch: Record<string, CachedResearchSeed> = {
  AAPL: {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    asOf: "FY2024 Form 10-K cached source pack",
    sourceStatus: "cached",
    sources: [
      "Apple FY2024 Form 10-K; cached SEC snapshot",
      "Apple FY2024 segment disclosure; cached SEC snapshot",
    ],
    annualFinancials: [
      {
        year: "FY2022",
        fiscalYear: 2022,
        revenue: 394_328,
        grossProfit: 170_782,
        operatingIncome: 119_437,
        netIncome: 99_803,
        operatingCashFlow: 122_151,
        capex: 10_708,
        freeCashFlow: 111_443,
        assets: 352_755,
        liabilities: 302_083,
        equity: 50_672,
        filed: "2022-10-28",
        source: "Apple FY2022 Form 10-K; cached SEC snapshot",
      },
      {
        year: "FY2023",
        fiscalYear: 2023,
        revenue: 383_285,
        grossProfit: 169_148,
        operatingIncome: 114_301,
        netIncome: 96_995,
        operatingCashFlow: 110_543,
        capex: 10_959,
        freeCashFlow: 99_584,
        assets: 352_583,
        liabilities: 290_437,
        equity: 62_146,
        filed: "2023-11-03",
        source: "Apple FY2023 Form 10-K; cached SEC snapshot",
      },
      {
        year: "FY2024",
        fiscalYear: 2024,
        revenue: 391_035,
        grossProfit: 180_683,
        operatingIncome: 123_216,
        netIncome: 93_736,
        operatingCashFlow: 118_254,
        capex: 9_447,
        freeCashFlow: 108_807,
        assets: 364_980,
        liabilities: 308_030,
        equity: 56_950,
        filed: "2024-11-01",
        source: "Apple FY2024 Form 10-K; cached SEC snapshot",
      },
    ],
    sourceDocuments: [
      {
        id: "aapl-fy2024-services-mix",
        docType: "sec_section",
        title: "Apple FY2024 segment mix",
        source: "Apple FY2024 Form 10-K; cached SEC snapshot",
        publishedAt: "2024-11-01",
        sectionKey: "business",
        text:
          "Apple reported FY2024 net sales of $391.0B. Products revenue was $294.9B and Services revenue was $96.2B. Services gross margin was about 74% versus Products gross margin of about 37%, making mix a central margin driver.",
      },
      {
        id: "aapl-fy2024-what-changed",
        docType: "filing_change",
        title: "Apple FY2024 revenue and margin reset",
        source: "Apple FY2024 Form 10-K; cached SEC snapshot",
        publishedAt: "2024-11-01",
        sectionKey: "managementDiscussion",
        text:
          "FY2024 revenue returned to modest growth after FY2023 contraction. Gross profit expanded faster than revenue and free cash flow recovered to $108.8B, shifting the debate from pure hardware unit growth to margin quality and cash durability.",
      },
      {
        id: "aapl-fy2024-risk-factors",
        docType: "sec_section",
        title: "Apple FY2024 risk factors",
        source: "Apple FY2024 Form 10-K; cached SEC snapshot",
        publishedAt: "2024-11-01",
        sectionKey: "riskFactors",
        text:
          "Apple's risk disclosures emphasize competitive pressure, supply concentration, geopolitical and trade restrictions, dependence on third-party developers and distribution, and regulatory scrutiny of platform economics.",
      },
      {
        id: "aapl-fy2024-capital-return",
        docType: "sec_section",
        title: "Apple capital return and cash generation",
        source: "Apple FY2024 Form 10-K; cached SEC snapshot",
        publishedAt: "2024-11-01",
        sectionKey: "managementDiscussion",
        text:
          "Apple generated $118.3B of operating cash flow and $108.8B of free cash flow in FY2024. The cash engine supports downside resilience and gives management capacity for buybacks, dividends, and strategic investment.",
      },
      {
        id: "aapl-market-debate",
        docType: "company_profile",
        title: "Apple coverage debate",
        source: "Citadail cached coverage seed",
        text:
          "The core debate is whether a large installed base, services mix, and product ecosystem can defend earnings power while hardware replacement cycles remain uneven and regulators scrutinize platform monetization.",
      },
    ],
  },
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "user-agent": SEC_USER_AGENT,
    },
    signal: AbortSignal.timeout(6500),
  });

  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json() as Promise<T>;
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml,text/plain",
      "user-agent": SEC_USER_AGENT,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
};

const asNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const formatMoney = (value: number | null) => {
  if (value === null) return "n/a";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}tn`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}bn`;
  return `$${value.toFixed(0)}mm`;
};

const formatPercent = (value: number | null) =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

const margin = (numerator: number | null, denominator: number | null) =>
  numerator !== null && denominator && denominator !== 0
    ? numerator / denominator
    : null;

const growth = (current: number | null, previous: number | null) =>
  current !== null && previous && previous !== 0 ? current / previous - 1 : null;

const truncate = (text: string, max = 900) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1).trim()}...` : normalized;
};

const decodeXmlEntities = (input: string) =>
  input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripHtmlToText = (html: string) =>
  decodeXmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<ix:nonNumeric[\s\S]*?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " "),
  ).replace(/\s+/g, " ").trim();

const latestAnnualFacts = (
  facts: SecCompanyFacts,
  tagCandidates: readonly string[],
) => {
  const gaapFacts = facts.facts?.["us-gaap"] ?? {};
  for (const tag of tagCandidates) {
    const units = gaapFacts[tag]?.units ?? {};
    const rows = [...(units.USD ?? []), ...(units.shares ?? [])]
      .filter(
        (row) =>
          row.form === "10-K" &&
          row.fp === "FY" &&
          typeof row.fy === "number" &&
          typeof row.val === "number",
      )
      .sort((left, right) => {
        const fyDelta = (right.fy ?? 0) - (left.fy ?? 0);
        if (fyDelta) return fyDelta;
        return String(right.filed ?? "").localeCompare(String(left.filed ?? ""));
      });

    if (rows.length) return { tag, rows };
  }
  return { tag: tagCandidates[0], rows: [] };
};

const findCikForTicker = async (ticker: string) => {
  const payload = await fetchJson<Record<string, SecCompanyTickerRow>>(
    "https://www.sec.gov/files/company_tickers.json",
  );
  const match = Object.values(payload).find(
    (row) => row.ticker?.toUpperCase() === ticker.toUpperCase(),
  );
  return match?.cik_str ? String(match.cik_str).padStart(10, "0") : null;
};

const buildAnnualFinancialsFromSec = (
  ticker: string,
  facts: SecCompanyFacts,
): EquityReportedFinancial[] => {
  const metricRows = Object.fromEntries(
    (Object.keys(secTagGroups) as SecMetricKey[]).map((metric) => [
      metric,
      latestAnnualFacts(facts, secTagGroups[metric]),
    ]),
  ) as Record<SecMetricKey, { tag: string; rows: SecFactUnit[] }>;

  const fiscalYears = Array.from(
    new Set(
      Object.values(metricRows).flatMap((metric) =>
        metric.rows.flatMap((row) =>
          typeof row.fy === "number" ? [row.fy] : [],
        ),
      ),
    ),
  )
    .sort((left, right) => right - left)
    .slice(0, 3)
    .sort((left, right) => left - right);

  const valueFor = (metric: SecMetricKey, fy: number) =>
    metricRows[metric].rows.find((row) => row.fy === fy) ?? null;

  return fiscalYears.map((fy) => {
    const revenue = asNumber(valueFor("revenue", fy)?.val);
    const grossProfit = asNumber(valueFor("grossProfit", fy)?.val);
    const operatingIncome = asNumber(valueFor("operatingIncome", fy)?.val);
    const netIncome = asNumber(valueFor("netIncome", fy)?.val);
    const operatingCashFlow = asNumber(valueFor("operatingCashFlow", fy)?.val);
    const capex = asNumber(valueFor("capex", fy)?.val);
    const filed =
      valueFor("revenue", fy)?.filed ?? valueFor("netIncome", fy)?.filed ?? null;
    const source = `SEC Company Facts ${ticker}: FY${fy} 10-K`;

    return {
      year: `FY${fy}`,
      fiscalYear: fy,
      revenue: revenue === null ? null : revenue / MILLION,
      grossProfit: grossProfit === null ? null : grossProfit / MILLION,
      operatingIncome:
        operatingIncome === null ? null : operatingIncome / MILLION,
      netIncome: netIncome === null ? null : netIncome / MILLION,
      operatingCashFlow:
        operatingCashFlow === null ? null : operatingCashFlow / MILLION,
      capex: capex === null ? null : Math.abs(capex) / MILLION,
      freeCashFlow:
        operatingCashFlow === null || capex === null
          ? null
          : (operatingCashFlow - Math.abs(capex)) / MILLION,
      assets:
        asNumber(valueFor("assets", fy)?.val) === null
          ? null
          : Number(valueFor("assets", fy)?.val) / MILLION,
      liabilities:
        asNumber(valueFor("liabilities", fy)?.val) === null
          ? null
          : Number(valueFor("liabilities", fy)?.val) / MILLION,
      equity:
        asNumber(valueFor("equity", fy)?.val) === null
          ? null
          : Number(valueFor("equity", fy)?.val) / MILLION,
      filed,
      source,
    };
  });
};

const fetchSecFinancials = async (ticker: string, cik: string | null) => {
  if (!cik) return null;
  const facts = await fetchJson<SecCompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
  );
  const annualFinancials = buildAnnualFinancialsFromSec(ticker, facts);
  return annualFinancials.length
    ? {
        companyName: facts.entityName,
        annualFinancials,
      }
    : null;
};

const fetchYahooQuote = async (ticker: string) => {
  const payload = await fetchJson<YahooQuoteResponse>(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`,
  );
  return payload.quoteResponse?.result?.[0] ?? null;
};

const normalizePublishedAt = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
};

const fetchYahooNews = async (ticker: string): Promise<EquitySourceDocument[]> => {
  const payload = await fetchJson<YahooSearchResponse>(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(`${ticker} stock`)}&quotesCount=0&newsCount=10`,
  );
  return (payload.news ?? []).flatMap((item, index) => {
    const title = asString(item.title);
    if (!title) return [];
    const publisher = asString(item.publisher) ?? "Yahoo Finance";
    const summary = asString(item.summary) ?? asString(item.title) ?? "";
    return [
      {
        id: `news-yahoo-${index}`,
        docType: "news" as const,
        title,
        source: publisher,
        sourceUrl: asString(item.link) ?? undefined,
        publishedAt: normalizePublishedAt(item.providerPublishTime),
        text: summary,
      },
    ];
  });
};

const tagValue = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]
    ? decodeXmlEntities(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim())
    : "";
};

const fetchGoogleNews = async (ticker: string): Promise<EquitySourceDocument[]> => {
  const rssUrl = new URL("https://news.google.com/rss/search");
  rssUrl.searchParams.set("q", `${ticker} stock earnings guidance`);
  rssUrl.searchParams.set("hl", "en-US");
  rssUrl.searchParams.set("gl", "US");
  rssUrl.searchParams.set("ceid", "US:en");
  const xml = await fetchText(rssUrl.toString());
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 8).flatMap((match, index) => {
    const block = match[1];
    const title = tagValue(block, "title");
    const link = tagValue(block, "link");
    const pubDate = tagValue(block, "pubDate");
    const source = tagValue(block, "source") || "Google News";
    if (!title) return [];
    return [
      {
        id: `news-google-${index}`,
        docType: "news" as const,
        title,
        source,
        sourceUrl: link || undefined,
        publishedAt: pubDate || undefined,
        text: title,
      },
    ];
  });
};

interface GroundedSearchItem {
  title?: string;
  summary?: string;
  category?: string;
  sourceTitle?: string;
  url?: string;
  publishedAt?: string;
}

interface GroundedSearchPayload {
  items?: GroundedSearchItem[];
}

interface GeminiGroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

interface GeminiGroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GeminiGroundingChunk[];
}

interface GeminiCandidate {
  groundingMetadata?: GeminiGroundingMetadata;
}

interface GeminiGroundedResponse {
  text?: string;
  candidates?: GeminiCandidate[];
}

const parseGroundedSearchJson = (text: string): GroundedSearchPayload => {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as GroundedSearchPayload;
  } catch {
    return {};
  }
};

const uniqueGroundingChunks = (chunks: GeminiGroundingChunk[] = []) => {
  const seen = new Set<string>();
  return chunks.flatMap((chunk) => {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title;
    if (!uri || seen.has(uri)) return [];
    seen.add(uri);
    return [{ uri, title }];
  });
};

const buildGroundedSearchPrompt = (
  ticker: string,
  companyName?: string,
) => `Research ${companyName ?? ticker} (${ticker}) using Google Search.

Focus only on current investor-relevant narrative fundamentals:
- latest earnings or guidance
- management commentary
- what changed recently
- analyst or market debate
- competitive/regulatory/policy pressure
- segment mix, margin, demand, capital allocation, or risk events

Return only JSON:
{
  "items": [
    {
      "title": "concise source/event title",
      "summary": "one or two evidence-heavy sentences with numbers/dates where available",
      "category": "guidance|earnings|market_debate|regulatory|competitive|risk|capital_allocation|other",
      "sourceTitle": "publisher or source",
      "url": "source url if available",
      "publishedAt": "date if available"
    }
  ]
}

Use 4-7 items. Do not include generic company description. Do not invent sources.`;

const fetchGeminiGroundedSearchDocuments = async ({
  companyName,
  ticker,
}: {
  ticker: string;
  companyName?: string;
}): Promise<EquitySourceDocument[]> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !ENABLE_GEMINI_SEARCH) return [];

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = (await withTimeout(
      ai.models.generateContent({
        model: GEMINI_SEARCH_MODEL,
        contents: buildGroundedSearchPrompt(ticker, companyName),
        config: {
          temperature: 0.15,
          tools: [{ googleSearch: {} }],
        },
      }),
      GEMINI_SEARCH_TIMEOUT_MS,
    )) as GeminiGroundedResponse;

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const chunks = uniqueGroundingChunks(groundingMetadata?.groundingChunks);
    const payload = parseGroundedSearchJson(response.text ?? "");
    const usedUris = new Set<string>();
    const docs = (payload.items ?? []).slice(0, 7).flatMap((item, index) => {
      const title = asString(item.title) ?? asString(item.category);
      const summary = asString(item.summary);
      if (!title || !summary) return [];
      const matchedChunk =
        chunks.find((chunk) => {
          if (usedUris.has(chunk.uri)) return false;
          const sourceTitle = item.sourceTitle?.toLowerCase() ?? "";
          return sourceTitle && chunk.title?.toLowerCase().includes(sourceTitle);
        }) ??
        chunks.find((chunk) => !usedUris.has(chunk.uri));
      if (matchedChunk) usedUris.add(matchedChunk.uri);
      const sourceUrl = asString(item.url) ?? matchedChunk?.uri;
      return [
        {
          id: `gemini-search-${index}`,
          docType: "news" as const,
          title,
          source:
            asString(item.sourceTitle) ??
            matchedChunk?.title ??
            "Gemini Google Search grounding",
          ...(sourceUrl ? { sourceUrl } : {}),
          ...(asString(item.publishedAt) ? { publishedAt: asString(item.publishedAt) ?? undefined } : {}),
          text: summary,
        },
      ];
    });

    if (docs.length) return docs;

    return chunks.slice(0, 5).flatMap((chunk, index) => {
      const title = chunk.title ?? `Grounded search source ${index + 1}`;
      return [
        {
          id: `gemini-search-source-${index}`,
          docType: "news" as const,
          title,
          source: "Gemini Google Search grounding",
          sourceUrl: chunk.uri,
          text: `Google Search grounding source for ${ticker}: ${title}.`,
        },
      ];
    });
  } catch {
    return [];
  }
};

const fetchRecentNewsDocuments = async (ticker: string) => {
  try {
    const yahooNews = await fetchYahooNews(ticker);
    if (yahooNews.length) return yahooNews;
  } catch {
    // Fall through to RSS.
  }

  try {
    return await fetchGoogleNews(ticker);
  } catch {
    return [];
  }
};

const filingUrl = (cik: string, accessionNumber: string, primaryDocument: string) => {
  const cikPath = String(Number(cik));
  const accessionPath = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}/${primaryDocument}`;
};

const fetchRecentFilingRows = async (cik: string): Promise<FilingRow[]> => {
  const submissions = await fetchJson<SecSubmissions>(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
  );
  const recent = submissions.filings?.recent;
  const forms = recent?.form ?? [];
  return forms
    .flatMap((form, index): FilingRow[] => {
      const accessionNumber = recent?.accessionNumber?.[index] ?? "";
      const primaryDocument = recent?.primaryDocument?.[index] ?? "";
      if (!accessionNumber || !primaryDocument) return [];
      const description = recent?.primaryDocDescription?.[index];
      const row: FilingRow = {
        accessionNumber,
        filingDate: recent?.filingDate?.[index] ?? "",
        form,
        primaryDocument,
        url: filingUrl(cik, accessionNumber, primaryDocument),
      };
      if (description) row.description = description;
      return [row];
    })
    .filter((row) => ["10-K", "10-Q", "8-K"].includes(row.form))
    .slice(0, 16);
};

const sectionSpecsFor = (form: string) => {
  if (form === "10-K") {
    return [
      {
        key: "business",
        title: "Business",
        start: /item\s+1\.?\s+business\b/gi,
        end: /item\s+1a\.?\s+risk\s+factors\b/gi,
      },
      {
        key: "riskFactors",
        title: "Risk Factors",
        start: /item\s+1a\.?\s+risk\s+factors\b/gi,
        end: /item\s+1b\.?|item\s+2\.?/gi,
      },
      {
        key: "managementDiscussion",
        title: "Management Discussion and Analysis",
        start: /item\s+7\.?\s+management'?s\s+discussion/gi,
        end: /item\s+7a\.?|item\s+8\.?/gi,
      },
    ];
  }

  if (form === "10-Q") {
    return [
      {
        key: "managementDiscussion",
        title: "Management Discussion and Analysis",
        start: /item\s+2\.?\s+management'?s\s+discussion/gi,
        end: /item\s+3\.?|item\s+4\.?/gi,
      },
      {
        key: "riskFactors",
        title: "Risk Factors",
        start: /item\s+1a\.?\s+risk\s+factors\b/gi,
        end: /item\s+2\.?|item\s+3\.?/gi,
      },
    ];
  }

  return [];
};

const findSection = (
  text: string,
  spec: ReturnType<typeof sectionSpecsFor>[number],
) => {
  const starts = [...text.matchAll(spec.start)].map((match) => match.index ?? 0);
  for (const start of starts.reverse()) {
    spec.end.lastIndex = start + 20;
    const endMatch = spec.end.exec(text);
    const end = endMatch?.index ?? Math.min(text.length, start + 4500);
    const excerpt = text.slice(start, end).trim();
    if (excerpt.length > 350) return truncate(excerpt, 2600);
  }
  return null;
};

const buildSecSectionDocuments = async (
  ticker: string,
  filing: FilingRow,
): Promise<EquitySourceDocument[]> => {
  const raw = await fetchText(filing.url);
  const text = stripHtmlToText(raw);
  if (!text) return [];

  if (filing.form === "8-K") {
    return [
      {
        id: `sec-${filing.accessionNumber}-event`,
        docType: "sec_section",
        title: `${ticker} ${filing.form} event filing`,
        source: `SEC EDGAR ${ticker} ${filing.form}`,
        sourceUrl: filing.url,
        publishedAt: filing.filingDate,
        sectionKey: "eventFiling",
        text: truncate(text, 1800),
      },
    ];
  }

  return sectionSpecsFor(filing.form).flatMap((spec) => {
    const sectionText = findSection(text, spec);
    if (!sectionText) return [];
    return [
      {
        id: `sec-${filing.accessionNumber}-${spec.key}`,
        docType: "sec_section" as const,
        title: `${ticker} ${filing.form} ${spec.title}`,
        source: `SEC EDGAR ${ticker} ${filing.form}`,
        sourceUrl: filing.url,
        publishedAt: filing.filingDate,
        sectionKey: spec.key,
        text: sectionText,
      },
    ];
  });
};

const buildFilingChangeDocuments = (
  ticker: string,
  currentDocs: EquitySourceDocument[],
  previousDocs: EquitySourceDocument[],
) => {
  const previousByKey = new Map(
    previousDocs
      .filter((doc) => doc.sectionKey)
      .map((doc) => [doc.sectionKey, doc]),
  );
  return currentDocs.flatMap((current) => {
    if (!current.sectionKey) return [];
    const previous = previousByKey.get(current.sectionKey);
    if (!previous) return [];
    return [
      {
        id: `change-${current.id}`,
        docType: "filing_change" as const,
        title: `${ticker} filing change: ${current.title}`,
        source: `${current.source} versus prior ${previous.source}`,
        sourceUrl: current.sourceUrl,
        publishedAt: current.publishedAt,
        sectionKey: current.sectionKey,
        text: `Current excerpt: ${truncate(current.text, 520)} Previous excerpt: ${truncate(previous.text, 360)}`,
      },
    ];
  });
};

const fetchSecSourceDocuments = async (
  ticker: string,
  cik: string | null,
): Promise<EquitySourceDocument[]> => {
  if (!cik) return [];
  try {
    const rows = await fetchRecentFilingRows(cik);
    const latestAnnualOrQuarterly = rows.find((row) => row.form === "10-Q") ?? rows.find((row) => row.form === "10-K");
    const priorSameForm = latestAnnualOrQuarterly
      ? rows.find(
          (row) =>
            row.form === latestAnnualOrQuarterly.form &&
            row.accessionNumber !== latestAnnualOrQuarterly.accessionNumber,
        )
      : null;
    const latestEvent = rows.find((row) => row.form === "8-K");
    const [currentDocs, previousDocs, eventDocs] = await Promise.all([
      latestAnnualOrQuarterly
        ? buildSecSectionDocuments(ticker, latestAnnualOrQuarterly)
        : Promise.resolve([]),
      priorSameForm
        ? buildSecSectionDocuments(ticker, priorSameForm)
        : Promise.resolve([]),
      latestEvent ? buildSecSectionDocuments(ticker, latestEvent) : Promise.resolve([]),
    ]);

    return [
      ...currentDocs,
      ...buildFilingChangeDocuments(ticker, currentDocs, previousDocs),
      ...eventDocs,
    ];
  } catch {
    return [];
  }
};

const buildCompanyProfileDocument = (
  ticker: string,
  companyName: string | undefined,
  quote: Record<string, unknown> | null,
  companyContext?: EquityCompanyContext | null,
): EquitySourceDocument[] => {
  const summary =
    asString(quote?.longBusinessSummary) ??
    companyContext?.summary ??
    null;
  const sector = asString(quote?.sector) ?? companyContext?.sector;
  const industry = asString(quote?.industry);
  if (!summary && !sector && !industry) return [];
  return [
    {
      id: "company-profile",
      docType: "company_profile",
      title: `${companyName ?? ticker} company profile`,
      source: quote ? `Yahoo Finance profile for ${ticker}` : "Citadail coverage desk",
      text: [
        sector ? `Sector: ${sector}.` : null,
        industry ? `Industry: ${industry}.` : null,
        summary,
      ]
        .flatMap((item) => (item ? [item] : []))
        .join(" "),
    },
  ];
};

const buildFinancialDocuments = (
  ticker: string,
  annualFinancials: EquityReportedFinancial[],
  quote: Record<string, unknown> | null,
): EquitySourceDocument[] => {
  const latest = annualFinancials.at(-1);
  if (!latest) return [];
  const previous = annualFinancials.at(-2);
  const revenueGrowth = growth(latest.revenue, previous?.revenue ?? null);
  const grossMargin = margin(latest.grossProfit, latest.revenue);
  const operatingMargin = margin(latest.operatingIncome, latest.revenue);
  const fcfMargin = margin(latest.freeCashFlow, latest.revenue);
  const price = asNumber(quote?.regularMarketPrice);
  const marketCap = asNumber(quote?.marketCap);
  const trailingPe = asNumber(quote?.trailingPE);
  const forwardPe = asNumber(quote?.forwardPE);
  return [
    {
      id: "reported-financials",
      docType: "reported_financials",
      title: `${ticker} reported financial baseline`,
      source: latest.source,
      publishedAt: latest.filed ?? undefined,
      text: [
        `${latest.year} revenue ${formatMoney(latest.revenue)}${revenueGrowth === null ? "" : `, revenue growth ${formatPercent(revenueGrowth)}`}.`,
        `Gross margin ${formatPercent(grossMargin)}, operating margin ${formatPercent(operatingMargin)}, free cash flow ${formatMoney(latest.freeCashFlow)}, FCF margin ${formatPercent(fcfMargin)}.`,
      ].join(" "),
    },
    ...(price !== null || marketCap !== null || trailingPe !== null || forwardPe !== null
      ? [
          {
            id: "market-data",
            docType: "market_data" as const,
            title: `${ticker} market snapshot`,
            source: `Yahoo Finance quote for ${ticker}`,
            text: [
              price !== null ? `Latest quoted price $${price.toFixed(2)}.` : null,
              marketCap !== null ? `Market capitalization ${formatMoney(marketCap / MILLION)}.` : null,
              trailingPe !== null ? `Trailing P/E ${trailingPe.toFixed(1)}x.` : null,
              forwardPe !== null ? `Forward P/E ${forwardPe.toFixed(1)}x.` : null,
            ]
              .flatMap((item) => (item ? [item] : []))
              .join(" "),
          },
        ]
      : []),
  ];
};

const queryTokens = (query: string) =>
  query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const scoreDocument = (
  doc: EquitySourceDocument,
  query: string,
  preferredDocTypes: EquitySourceDocumentType[],
) => {
  const haystack = `${doc.title} ${doc.sectionKey ?? ""} ${doc.text}`.toLowerCase();
  const tokens = queryTokens(query);
  const matchScore = tokens.reduce(
    (score, token) => score + (haystack.includes(token) ? 1 : 0),
    0,
  );
  const typeBoost = preferredDocTypes.includes(doc.docType) ? 2 : 0;
  const sectionBoost =
    doc.sectionKey && query.toLowerCase().includes(doc.sectionKey.toLowerCase())
      ? 1
      : 0;
  return matchScore + typeBoost + sectionBoost;
};

const bestDocumentFor = (
  docs: EquitySourceDocument[],
  usedIds: Set<string>,
  query: string,
  preferredDocTypes: EquitySourceDocumentType[],
) =>
  docs
    .filter((doc) => !usedIds.has(doc.id))
    .map((doc) => ({
      doc,
      score: scoreDocument(doc, query, preferredDocTypes),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.doc ?? null;

const sentenceOne = (text: string) => {
  const sentence = text.match(/.*?[.!?](?:\s|$)/)?.[0] ?? text;
  return truncate(sentence, 240);
};

const sourceLabel = (doc: EquitySourceDocument) =>
  `${doc.source}${doc.publishedAt ? ` (${doc.publishedAt.slice(0, 10)})` : ""}`;

const buildNarrativeEvidence = (
  sourceDocuments: EquitySourceDocument[],
): EquityEvidenceItem[] => {
  const usedIds = new Set<string>();
  const specs: Array<{
    label: string;
    query: string;
    preferredDocTypes: EquitySourceDocumentType[];
    implication: string;
  }> = [
    {
      label: "What changed",
      query: "what changed recent filing change guidance earnings revenue margin",
      preferredDocTypes: ["filing_change", "news", "sec_section"],
      implication:
        "Defines why now and whether the thesis is reacting to a real change rather than a stale narrative.",
    },
    {
      label: "Management / filing narrative",
      query: "management discussion outlook business strategy demand growth margin",
      preferredDocTypes: ["sec_section", "filing_change"],
      implication:
        "Connects the thesis to company-disclosed operating context instead of only market price action.",
    },
    {
      label: "Risk / falsification",
      query: "risk factors competition regulation supply chain demand downside break thesis",
      preferredDocTypes: ["sec_section", "filing_change", "news"],
      implication:
        "Supplies explicit conditions that can weaken or break the thesis.",
    },
    {
      label: "Market debate",
      query: "market debate consensus analyst investors stock news underappreciated",
      preferredDocTypes: ["news", "market_data", "company_profile"],
      implication:
        "Frames what the market is likely focused on versus what the thesis needs to prove.",
    },
    {
      label: "Business quality driver",
      query: "services mix margin moat ecosystem competitive position installed base cash flow",
      preferredDocTypes: ["sec_section", "company_profile", "reported_financials"],
      implication:
        "Identifies the qualitative driver that must translate into durable model assumptions.",
    },
  ];

  return specs.flatMap((spec) => {
    const doc = bestDocumentFor(
      sourceDocuments,
      usedIds,
      spec.query,
      spec.preferredDocTypes,
    );
    if (!doc) return [];
    usedIds.add(doc.id);
    return [
      {
        label: spec.label,
        value: sentenceOne(doc.text),
        source: sourceLabel(doc),
        implication: spec.implication,
      },
    ];
  });
};

const buildFinancialEvidence = (
  ticker: string,
  annualFinancials: EquityReportedFinancial[],
  quote: Record<string, unknown> | null,
): EquityEvidenceItem[] => {
  const latest = annualFinancials.at(-1);
  const previous = annualFinancials.at(-2);
  if (!latest) return [];

  const revenueGrowth = growth(latest.revenue, previous?.revenue ?? null);
  const operatingMargin = margin(latest.operatingIncome, latest.revenue);
  const grossMargin = margin(latest.grossProfit, latest.revenue);
  const fcfMargin = margin(latest.freeCashFlow, latest.revenue);
  const source = `${latest.source}${latest.filed ? ` filed ${latest.filed}` : ""}`;
  const evidence: EquityEvidenceItem[] = [
    {
      label: `${latest.year} revenue base`,
      value: revenueGrowth === null
        ? formatMoney(latest.revenue)
        : `${formatMoney(latest.revenue)} / ${formatPercent(revenueGrowth)} YoY`,
      source,
      implication:
        "Sets the growth bar the narrative must beat or defend.",
    },
    {
      label: `${latest.year} margin structure`,
      value: `Gross ${formatPercent(grossMargin)} / operating ${formatPercent(operatingMargin)}`,
      source,
      implication:
        "Shows whether the qualitative story has already appeared in reported economics.",
    },
    {
      label: `${latest.year} free cash flow`,
      value: `${formatMoney(latest.freeCashFlow)} / ${formatPercent(fcfMargin)} margin`,
      source,
      implication:
        "Tests whether the company can fund reinvestment, buybacks, and downside resilience.",
    },
  ];

  const marketCap = asNumber(quote?.marketCap);
  const trailingPe = asNumber(quote?.trailingPE);
  const forwardPe = asNumber(quote?.forwardPE);
  if (marketCap !== null || trailingPe !== null || forwardPe !== null) {
    evidence.push({
      label: "Market valuation frame",
      value: [
        marketCap !== null ? `Market cap ${formatMoney(marketCap / MILLION)}` : null,
        trailingPe !== null ? `trailing P/E ${trailingPe.toFixed(1)}x` : null,
        forwardPe !== null ? `forward P/E ${forwardPe.toFixed(1)}x` : null,
      ]
        .flatMap((item) => (item ? [item] : []))
        .join(" / "),
      source: `Yahoo Finance quote for ${ticker}`,
      implication:
        "Gives the PM a starting point for whether the narrative is already priced.",
    });
  }

  return evidence;
};

const buildEvidence = (
  ticker: string,
  annualFinancials: EquityReportedFinancial[],
  quote: Record<string, unknown> | null,
  sourceDocuments: EquitySourceDocument[],
): EquityEvidenceItem[] => {
  const narrative = buildNarrativeEvidence(sourceDocuments);
  const financial = buildFinancialEvidence(ticker, annualFinancials, quote);
  const rows = [...narrative, ...financial];
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.label}:${row.source}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildModelAssumptions = (
  annualFinancials: EquityReportedFinancial[],
  evidence: EquityEvidenceItem[],
): EquityModelAssumption[] => {
  const latest = annualFinancials.at(-1);
  const narrativeAssumptions = evidence.slice(0, 2).map((row) => ({
    label: `Narrative driver: ${row.label}`,
    value: row.value,
    source: row.source,
  }));

  if (!latest) return evidence.slice(0, 5).map((row) => ({
    label: row.label,
    value: row.value,
    source: row.source,
  }));

  return [
    ...narrativeAssumptions,
    {
      label: "Reported Revenue Base",
      value: formatMoney(latest.revenue),
      source: latest.source,
    },
    {
      label: "Reported Gross Margin",
      value: formatPercent(margin(latest.grossProfit, latest.revenue)),
      source: latest.source,
    },
    {
      label: "Reported Operating Margin",
      value: formatPercent(margin(latest.operatingIncome, latest.revenue)),
      source: latest.source,
    },
    {
      label: "Reported FCF Margin",
      value: formatPercent(margin(latest.freeCashFlow, latest.revenue)),
      source: latest.source,
    },
  ];
};

const buildForecastBaseline = (
  annualFinancials: EquityReportedFinancial[],
): EquityForecastRow | null => {
  const latest = annualFinancials.at(-1);
  const previous = annualFinancials.at(-2);
  if (!latest?.revenue) return null;

  return {
    year: latest.year,
    revenue: latest.revenue,
    revenueGrowth: growth(latest.revenue, previous?.revenue ?? null) ?? 0,
    grossMargin: margin(latest.grossProfit, latest.revenue) ?? 0,
    operatingMargin: margin(latest.operatingIncome, latest.revenue) ?? 0,
    freeCashFlowMargin: margin(latest.freeCashFlow, latest.revenue) ?? 0,
  };
};

const buildPromptBlock = (context: {
  asOf: string;
  sourceStatus: EquityResearchContext["sourceStatus"];
  sources: string[];
  evidence: EquityEvidenceItem[];
  annualFinancials: EquityReportedFinancial[];
  sourceDocuments: EquitySourceDocument[];
}) =>
  [
    `Research source status: ${context.sourceStatus}`,
    `Research as-of: ${context.asOf}`,
    `Sources: ${context.sources.join("; ") || "none"}`,
    "",
    "Narrative source documents:",
    ...context.sourceDocuments.slice(0, MAX_SOURCE_DOCS_FOR_PROMPT).map(
      (doc) =>
        `- [${doc.id}] ${doc.docType}${doc.sectionKey ? `/${doc.sectionKey}` : ""}: ${doc.title}. Source: ${sourceLabel(doc)}. Excerpt: ${truncate(doc.text, MAX_DOC_TEXT_FOR_PROMPT)}`,
    ),
    "",
    "Narrative fundamentals / evidence pack:",
    ...context.evidence.map(
      (item) =>
        `- ${item.label}: ${item.value}. Source: ${item.source}. Implication: ${item.implication}`,
    ),
    "",
    "Reported financial baseline:",
    ...context.annualFinancials.map(
      (row) =>
        `- ${row.year}: revenue ${formatMoney(row.revenue)}, gross margin ${formatPercent(margin(row.grossProfit, row.revenue))}, operating margin ${formatPercent(margin(row.operatingIncome, row.revenue))}, FCF ${formatMoney(row.freeCashFlow)}. Source: ${row.source}.`,
    ),
    "",
    "Source discipline:",
    "- Source-backed filings/news/profile items are not assumptions.",
    "- Forward model rows, valuation, trade plan, and future catalysts are estimates unless directly supported above.",
    "- Build the memo around what changed, what the market may miss, and what breaks the thesis.",
  ].join("\n");

const finalizeResearchContext = (
  context: Omit<
    EquityResearchContext,
    "evidence" | "modelAssumptions" | "forecastBaseline" | "promptBlock"
  > & {
    quote: Record<string, unknown> | null;
  },
): EquityResearchContext => {
  const sourceDocuments = context.sourceDocuments;
  const evidence = buildEvidence(
    context.ticker,
    context.annualFinancials,
    context.quote,
    sourceDocuments,
  );
  const modelAssumptions = buildModelAssumptions(
    context.annualFinancials,
    evidence,
  );
  const forecastBaseline = buildForecastBaseline(context.annualFinancials);
  const promptBlock = buildPromptBlock({
    asOf: context.asOf,
    sourceStatus: context.sourceStatus,
    sources: context.sources,
    evidence,
    annualFinancials: context.annualFinancials,
    sourceDocuments,
  });

  return {
    ticker: context.ticker,
    companyName: context.companyName,
    asOf: context.asOf,
    sourceStatus: context.sourceStatus,
    sources: context.sources,
    annualFinancials: context.annualFinancials,
    evidence,
    modelAssumptions,
    forecastBaseline,
    sourceDocuments,
    promptBlock,
  };
};

const cachedContextFor = (
  ticker: string,
  companyContext?: EquityCompanyContext | null,
) => {
  const cached = cachedResearch[ticker];
  if (!cached) return null;
  return finalizeResearchContext({
    ...cached,
    companyName: companyContext?.companyName ?? cached.companyName,
    quote: null,
  });
};

export const fetchEquityResearchContext = async ({
  companyContext,
  ticker,
}: {
  ticker: string;
  companyContext?: EquityCompanyContext | null;
}): Promise<EquityResearchContext> => {
  const normalizedTicker = ticker.trim().toUpperCase();
  const skipNetwork =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true";
  const cached = cachedContextFor(normalizedTicker, companyContext);

  if (cached && (skipNetwork || PREFER_CACHED_RESEARCH)) {
    return cached;
  }

  if (!skipNetwork) {
    try {
      const cik = await findCikForTicker(normalizedTicker);
      const [secResult, quoteResult, secDocsResult, newsDocsResult] =
        await Promise.allSettled([
          fetchSecFinancials(normalizedTicker, cik),
          fetchYahooQuote(normalizedTicker),
          fetchSecSourceDocuments(normalizedTicker, cik),
          fetchRecentNewsDocuments(normalizedTicker),
        ]);
      const sec = secResult.status === "fulfilled" ? secResult.value : null;
      const quote =
        quoteResult.status === "fulfilled" ? quoteResult.value : null;
      const secDocs =
        secDocsResult.status === "fulfilled" ? secDocsResult.value : [];
      const newsDocs =
        newsDocsResult.status === "fulfilled" ? newsDocsResult.value : [];
      const annualFinancials = sec?.annualFinancials ?? [];
      const companyName =
        companyContext?.companyName ??
        sec?.companyName ??
        asString(quote?.longName) ??
        asString(quote?.shortName) ??
        normalizedTicker;
      const groundedSearchDocs = await fetchGeminiGroundedSearchDocuments({
        ticker: normalizedTicker,
        companyName,
      });
      const sourceDocuments = [
        ...secDocs,
        ...groundedSearchDocs,
        ...newsDocs,
        ...buildCompanyProfileDocument(
          normalizedTicker,
          companyName,
          quote,
          companyContext,
        ),
        ...buildFinancialDocuments(normalizedTicker, annualFinancials, quote),
      ];

      if (annualFinancials.length || sourceDocuments.length) {
        return finalizeResearchContext({
          ticker: normalizedTicker,
          companyName,
          asOf: new Date().toISOString(),
          sourceStatus: "source-backed",
          sources: Array.from(
            new Set([
              ...(annualFinancials.length ? ["SEC Company Facts API"] : []),
              ...(secDocs.length ? ["SEC EDGAR filings"] : []),
              ...(groundedSearchDocs.length
                ? ["Gemini Google Search grounding"]
                : []),
              ...(newsDocs.length ? ["Yahoo/Google News"] : []),
              ...(quote ? ["Yahoo Finance quote/profile API"] : []),
            ]),
          ),
          annualFinancials,
          quote,
          sourceDocuments,
        });
      }
    } catch {
      // Fall back below. The UI should still be able to demo supported names.
    }
  }

  if (cached) return cached;

  return {
    ticker: normalizedTicker,
    companyName: companyContext?.companyName,
    asOf: new Date().toISOString(),
    sourceStatus: "unavailable",
    sources: [],
    evidence: [],
    annualFinancials: [],
    modelAssumptions: [],
    forecastBaseline: null,
    sourceDocuments: [],
    promptBlock:
      "Research source status: unavailable. Do not generate a fundamentals-backed package.",
  };
};

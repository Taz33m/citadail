import type { HistoricalSource } from "@/types/full-auto";

export interface FullAutoUniverseCompany {
  ticker: string;
  companyName: string;
  sector: string;
}

export const fullAutoUniverseCompanies: FullAutoUniverseCompany[] = [
  { ticker: "AAPL", companyName: "Apple Inc.", sector: "Technology Hardware" },
  { ticker: "MSFT", companyName: "Microsoft Corporation", sector: "Software" },
  { ticker: "NVDA", companyName: "NVIDIA Corporation", sector: "Semiconductors" },
  { ticker: "TSLA", companyName: "Tesla, Inc.", sector: "Automobiles" },
  { ticker: "AMD", companyName: "Advanced Micro Devices, Inc.", sector: "Semiconductors" },
  { ticker: "NFLX", companyName: "Netflix, Inc.", sector: "Media" },
  { ticker: "META", companyName: "Meta Platforms, Inc.", sector: "Internet" },
  { ticker: "GOOGL", companyName: "Alphabet Inc.", sector: "Internet" },
  { ticker: "AMZN", companyName: "Amazon.com, Inc.", sector: "Internet Retail" },
  { ticker: "AVGO", companyName: "Broadcom Inc.", sector: "Semiconductors" },
  { ticker: "ORCL", companyName: "Oracle Corporation", sector: "Software" },
  { ticker: "CRM", companyName: "Salesforce, Inc.", sector: "Software" },
  { ticker: "ADBE", companyName: "Adobe Inc.", sector: "Software" },
  { ticker: "NOW", companyName: "ServiceNow, Inc.", sector: "Software" },
  { ticker: "INTU", companyName: "Intuit Inc.", sector: "Software" },
  { ticker: "QCOM", companyName: "QUALCOMM Incorporated", sector: "Semiconductors" },
  { ticker: "TXN", companyName: "Texas Instruments Incorporated", sector: "Semiconductors" },
  { ticker: "AMAT", companyName: "Applied Materials, Inc.", sector: "Semiconductor Equipment" },
  { ticker: "LRCX", companyName: "Lam Research Corporation", sector: "Semiconductor Equipment" },
  { ticker: "JPM", companyName: "JPMorgan Chase & Co.", sector: "Financials" },
  { ticker: "V", companyName: "Visa Inc.", sector: "Payments" },
  { ticker: "MA", companyName: "Mastercard Incorporated", sector: "Payments" },
  { ticker: "COST", companyName: "Costco Wholesale Corporation", sector: "Retail" },
  { ticker: "WMT", companyName: "Walmart Inc.", sector: "Retail" },
  { ticker: "HD", companyName: "The Home Depot, Inc.", sector: "Retail" },
  { ticker: "UNH", companyName: "UnitedHealth Group Incorporated", sector: "Healthcare" },
  { ticker: "LLY", companyName: "Eli Lilly and Company", sector: "Healthcare" },
  { ticker: "MRK", companyName: "Merck & Co., Inc.", sector: "Healthcare" },
  { ticker: "XOM", companyName: "Exxon Mobil Corporation", sector: "Energy" },
  { ticker: "CVX", companyName: "Chevron Corporation", sector: "Energy" },
];

export const FULL_AUTO_DEFAULT_UNIVERSE = fullAutoUniverseCompanies.map(
  (company) => company.ticker,
);

const source = (
  ticker: string,
  sourceType: HistoricalSource["sourceType"],
  title: string,
  knownAt: string,
  text: string,
  extra: Partial<HistoricalSource> = {},
): HistoricalSource => ({
  sourceId: `${ticker}-${knownAt.slice(0, 10)}-${sourceType}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 38)}`,
  ticker,
  sourceType,
  title,
  text,
  publishedAt: extra.publishedAt ?? knownAt,
  knownAt,
  asOfDate: extra.asOfDate ?? knownAt.slice(0, 10),
  retrievedAt: extra.retrievedAt ?? knownAt,
  snapshotId: extra.snapshotId ?? "citadail-replay-2020-v1",
  ...(extra.sourceUrl ? { sourceUrl: extra.sourceUrl } : {}),
  ...(extra.price !== undefined ? { price: extra.price } : {}),
  ...(extra.metrics ? { metrics: extra.metrics } : {}),
});

const shockMultiplierFor = (ticker: string) => {
  if (["WMT", "COST", "UNH", "LLY", "MRK"].includes(ticker)) return 0.9;
  if (["XOM", "CVX"].includes(ticker)) return 0.55;
  if (["JPM", "V", "MA", "HD"].includes(ticker)) return 0.7;
  if (["AMAT", "LRCX", "QCOM", "TXN"].includes(ticker)) return 0.68;
  return 0.74;
};

const stabilizationMultiplierFor = (ticker: string) => {
  if (["WMT", "COST", "UNH", "LLY", "MRK"].includes(ticker)) return 1.02;
  if (["XOM", "CVX"].includes(ticker)) return 0.7;
  if (["JPM", "V", "MA", "HD"].includes(ticker)) return 0.82;
  if (["AMAT", "LRCX", "QCOM", "TXN"].includes(ticker)) return 0.85;
  return 0.88;
};

const expansionReplayPack = [
  {
    ticker: "GOOGL",
    date: "2020-01-30T14:30:00.000Z",
    title: "Search durability and cloud optionality",
    text: "Alphabet entered the replay with durable search cash flow, YouTube engagement, and cloud losses that could narrow as enterprise adoption improved.",
    price: 68,
    marks: [145, 88, 140, 175],
  },
  {
    ticker: "AMZN",
    date: "2020-01-31T14:30:00.000Z",
    title: "AWS profit pool and retail scale",
    text: "Amazon entered the replay with AWS margins funding retail logistics, while the market debated whether scale investment would translate into durable operating leverage.",
    price: 94,
    marks: [166, 84, 151, 185],
  },
  {
    ticker: "AVGO",
    date: "2020-02-03T14:30:00.000Z",
    title: "Infrastructure silicon and software cash flow",
    text: "Broadcom presented a durable infrastructure-semiconductor cash-flow setup with software mix helping margins and capital return.",
    price: 31,
    marks: [66, 56, 112, 220],
  },
  {
    ticker: "ORCL",
    date: "2020-02-04T14:30:00.000Z",
    title: "Database cash flow and cloud migration",
    text: "Oracle offered mature software cash flow with cloud migration as the variant upside if database retention translated into infrastructure demand.",
    price: 54,
    marks: [87, 82, 105, 145],
  },
  {
    ticker: "CRM",
    date: "2020-02-06T14:30:00.000Z",
    title: "Enterprise software demand durability",
    text: "Salesforce entered with subscription revenue durability, enterprise digital-transformation demand, and margin expansion as the key debate.",
    price: 170,
    marks: [254, 132, 263, 300],
  },
  {
    ticker: "ADBE",
    date: "2020-02-07T14:30:00.000Z",
    title: "Creative subscription quality",
    text: "Adobe had high-quality subscription revenue, strong creative category share, and a margin-rich model that could compound through enterprise demand cycles.",
    price: 335,
    marks: [567, 336, 596, 500],
  },
  {
    ticker: "NOW",
    date: "2020-02-10T14:30:00.000Z",
    title: "Workflow automation growth runway",
    text: "ServiceNow entered with enterprise workflow automation demand and high renewal visibility, making revenue durability the load-bearing assumption.",
    price: 330,
    marks: [649, 388, 706, 850],
  },
  {
    ticker: "INTU",
    date: "2020-02-11T14:30:00.000Z",
    title: "Tax and small-business software durability",
    text: "Intuit combined tax software resilience with small-business workflow expansion, creating a quality compounder setup if retention held.",
    price: 290,
    marks: [643, 389, 625, 700],
  },
  {
    ticker: "QCOM",
    date: "2020-02-12T14:30:00.000Z",
    title: "5G handset cycle and licensing leverage",
    text: "Qualcomm entered with 5G handset content growth and licensing leverage as the central thesis, offset by cyclical smartphone demand risk.",
    price: 89,
    marks: [183, 110, 144, 170],
  },
  {
    ticker: "TXN",
    date: "2020-02-13T14:30:00.000Z",
    title: "Analog margins and industrial cycle",
    text: "Texas Instruments offered analog semiconductor margins and free-cash-flow durability, with industrial recovery as the cyclical upside.",
    price: 127,
    marks: [189, 165, 171, 180],
  },
  {
    ticker: "AMAT",
    date: "2020-02-14T14:30:00.000Z",
    title: "Wafer equipment recovery",
    text: "Applied Materials entered with semiconductor capital equipment recovery potential as foundry and memory customers prepared for stronger demand.",
    price: 62,
    marks: [157, 97, 162, 200],
  },
  {
    ticker: "LRCX",
    date: "2020-02-18T14:30:00.000Z",
    title: "Memory equipment cycle leverage",
    text: "Lam Research offered memory and foundry equipment leverage, with high cyclicality but strong upside if wafer-fab spending recovered.",
    price: 292,
    marks: [717, 420, 783, 900],
  },
  {
    ticker: "JPM",
    date: "2020-02-19T14:30:00.000Z",
    title: "Bank quality and credit-cycle resilience",
    text: "JPMorgan entered with best-in-class bank profitability and capital, while the key risk was credit-cycle pressure during the macro shock.",
    price: 137,
    marks: [158, 134, 170, 210],
  },
  {
    ticker: "V",
    date: "2020-02-20T14:30:00.000Z",
    title: "Payments volume recovery and network quality",
    text: "Visa had network-quality economics and a travel-volume recovery path, with cross-border weakness as the visible near-term risk.",
    price: 188,
    marks: [216, 207, 260, 280],
  },
  {
    ticker: "MA",
    date: "2020-02-21T14:30:00.000Z",
    title: "Cross-border recovery setup",
    text: "Mastercard entered with strong payments network economics and sensitivity to travel normalization as the core recovery driver.",
    price: 300,
    marks: [359, 348, 426, 500],
  },
  {
    ticker: "COST",
    date: "2020-02-24T14:30:00.000Z",
    title: "Membership retail quality",
    text: "Costco entered with resilient membership economics, traffic durability, and pricing power that could defend margins in volatile retail conditions.",
    price: 295,
    marks: [567, 456, 660, 850],
  },
  {
    ticker: "WMT",
    date: "2020-02-25T14:30:00.000Z",
    title: "Defensive retail and omnichannel scale",
    text: "Walmart offered defensive grocery traffic and omnichannel scale, making it a lower-beta quality candidate during macro uncertainty.",
    price: 118,
    marks: [144, 142, 157, 175],
  },
  {
    ticker: "HD",
    date: "2020-02-26T14:30:00.000Z",
    title: "Home improvement demand durability",
    text: "Home Depot entered with housing-linked repair demand, high returns on capital, and the risk of cyclical consumer slowdown.",
    price: 222,
    marks: [415, 315, 346, 390],
  },
  {
    ticker: "UNH",
    date: "2020-02-27T14:30:00.000Z",
    title: "Managed care durability",
    text: "UnitedHealth had managed-care scale, Optum growth, and defensive healthcare demand, with policy risk as the main valuation overhang.",
    price: 292,
    marks: [502, 530, 526, 560],
  },
  {
    ticker: "LLY",
    date: "2020-02-28T14:30:00.000Z",
    title: "Pipeline optionality and diabetes franchise",
    text: "Eli Lilly entered with diabetes franchise durability and pipeline optionality that could become more important as new obesity data emerged.",
    price: 130,
    marks: [276, 366, 582, 760],
  },
  {
    ticker: "MRK",
    date: "2020-03-02T14:30:00.000Z",
    title: "Keytruda durability and pharma cash flow",
    text: "Merck offered oncology cash-flow durability through Keytruda, with patent-cycle and pipeline concentration as the key risks.",
    price: 84,
    marks: [77, 111, 109, 130],
  },
  {
    ticker: "XOM",
    date: "2020-03-03T14:30:00.000Z",
    title: "Energy cash flow recovery option",
    text: "Exxon Mobil entered the replay as a cyclical energy recovery candidate, with commodity price risk and capital discipline as the main swing factors.",
    price: 70,
    marks: [61, 110, 100, 120],
  },
  {
    ticker: "CVX",
    date: "2020-03-04T14:30:00.000Z",
    title: "Integrated energy balance-sheet quality",
    text: "Chevron offered higher-quality integrated energy exposure, balance-sheet strength, and dividend discipline through the commodity cycle.",
    price: 120,
    marks: [117, 179, 149, 170],
  },
].flatMap((item) => [
  source(item.ticker, "filing", item.title, item.date, item.text, {
    metrics: { price: item.price },
    price: item.price,
  }),
  source(
    item.ticker,
    "price",
    "COVID shock replay mark",
    "2020-03-16T13:30:00.000Z",
    `Replay mark: ${item.ticker} marked through the COVID liquidation tape. This is an event mark, not a live quote.`,
    {
      metrics: { price: Number((item.price * shockMultiplierFor(item.ticker)).toFixed(2)) },
      price: Number((item.price * shockMultiplierFor(item.ticker)).toFixed(2)),
    },
  ),
  source(
    item.ticker,
    "price",
    "Policy stabilization replay mark",
    "2020-04-09T13:30:00.000Z",
    `Replay mark: ${item.ticker} marked through the policy-stabilization rally after the initial COVID shock.`,
    {
      metrics: { price: Number((item.price * stabilizationMultiplierFor(item.ticker)).toFixed(2)) },
      price: Number((item.price * stabilizationMultiplierFor(item.ticker)).toFixed(2)),
    },
  ),
  source(
    item.ticker,
    "price",
    "2021 year-end replay mark",
    "2021-12-31T21:00:00.000Z",
    `Replay mark: ${item.ticker} thesis remained visible through the 2021 risk-on tape.`,
    { metrics: { price: item.marks[0] }, price: item.marks[0] },
  ),
  source(
    item.ticker,
    "price",
    "2022 drawdown replay mark",
    "2022-12-30T21:00:00.000Z",
    `Replay mark: ${item.ticker} was tested by the 2022 rate and earnings-reset regime.`,
    { metrics: { price: item.marks[1] }, price: item.marks[1] },
  ),
  source(
    item.ticker,
    "price",
    "2023 recovery replay mark",
    "2023-12-29T21:00:00.000Z",
    `Replay mark: ${item.ticker} recovered as company-specific fundamentals and market risk appetite improved.`,
    { metrics: { price: item.marks[2] }, price: item.marks[2] },
  ),
  source(
    item.ticker,
    "price",
    "Present replay mark",
    "2026-04-17T20:00:00.000Z",
    `Replay mark: Latest visible mark kept ${item.ticker} under review, with thesis health measured against the most recent catalyst and price evidence.`,
    { metrics: { price: item.marks[3] }, price: item.marks[3] },
  ),
]);

const coreReplaySources: HistoricalSource[] = [
  source(
    "AAPL",
    "filing",
    "FY2019 Form 10-K installed base and services mix",
    "2020-01-02T14:30:00.000Z",
    "Apple entered 2020 with an active installed base above 1.5 billion devices, services revenue growing faster than products, and gross margin supported by mix rather than only iPhone units.",
    { metrics: { revenueBn: 260.2, servicesRevenueBn: 46.3, grossMarginPct: 37.8, operatingMarginPct: 24.6, price: 75.09 }, price: 75.09 },
  ),
  source(
    "AAPL",
    "news",
    "COVID demand and supply uncertainty pressure hardware narrative",
    "2020-03-17T13:30:00.000Z",
    "Market debate shifted to store closures, supply constraints, and delayed consumer device replacement cycles. The services installed-base argument remained the key offset.",
    { metrics: { price: 63.22 }, price: 63.22 },
  ),
  source(
    "AAPL",
    "news",
    "Apple Silicon transition reframes Mac control and margin path",
    "2020-06-23T13:30:00.000Z",
    "Apple announced a transition of Mac computers to Apple-designed silicon. The event strengthened the ecosystem-control thesis and gave investors a new product-cycle catalyst beyond iPhone units.",
    { metrics: { price: 91.63 }, price: 91.63 },
  ),
  source(
    "AAPL",
    "fundamentals",
    "June quarter services and wearables resilience",
    "2020-07-31T13:30:00.000Z",
    "Apple reported resilient June-quarter demand with services and wearables supporting the view that ecosystem monetization could offset uneven hardware replacement.",
    { metrics: { price: 106.26, revenueGrowthPct: 10.9, operatingMarginPct: 24.4 }, price: 106.26 },
  ),
  source(
    "AAPL",
    "price",
    "2021 year-end replay mark",
    "2021-12-31T21:00:00.000Z",
    "Replay mark: Apple closed 2021 with the services and installed-base thesis still intact after strong hardware demand and continued capital return.",
    { metrics: { price: 177.57 }, price: 177.57 },
  ),
  source(
    "AAPL",
    "price",
    "2022 drawdown replay mark",
    "2022-12-30T21:00:00.000Z",
    "Replay mark: Apple derated with the broader market as rates rose and hardware demand normalized, testing but not automatically breaking the services-quality thesis.",
    { metrics: { price: 129.93 }, price: 129.93 },
  ),
  source(
    "AAPL",
    "price",
    "2023 recovery replay mark",
    "2023-12-29T21:00:00.000Z",
    "Replay mark: Apple recovered as cash generation and ecosystem durability remained central, while China and iPhone replacement concerns stayed live.",
    { metrics: { price: 192.53 }, price: 192.53 },
  ),
  source(
    "AAPL",
    "price",
    "2025 replay mark",
    "2025-12-31T21:00:00.000Z",
    "Replay mark: Apple remains a quality cash-flow thesis with AI-device optionality and regulatory scrutiny as the main push-pull.",
    { metrics: { price: 252.0 }, price: 252.0 },
  ),
  source(
    "AAPL",
    "price",
    "Present replay mark",
    "2026-04-17T20:00:00.000Z",
    "Replay mark: Latest visible mark kept Apple intact: services durability and cash generation still offset China risk and AI-device uncertainty.",
    { metrics: { price: 248.0 }, price: 248.0 },
  ),
  source(
    "MSFT",
    "filing",
    "FY2019 cloud transition baseline",
    "2020-01-02T14:30:00.000Z",
    "Microsoft entered 2020 with Azure and commercial cloud growth carrying the investment debate, while Office and Windows cash flows funded durable reinvestment.",
    { metrics: { price: 160.62, revenueBn: 125.8, operatingMarginPct: 34.1 }, price: 160.62 },
  ),
  source(
    "MSFT",
    "news",
    "Remote-work demand pulls forward Teams and cloud relevance",
    "2020-03-23T13:30:00.000Z",
    "The market began to treat Microsoft as a remote-work and cloud beneficiary as Teams usage and Azure demand became central to the COVID-era software debate.",
    { metrics: { price: 135.98 }, price: 135.98 },
  ),
  source(
    "MSFT",
    "fundamentals",
    "June quarter cloud durability",
    "2020-07-23T13:30:00.000Z",
    "Microsoft reported continued commercial cloud strength. Azure growth slowed from very high levels but remained the load-bearing variable for the long thesis.",
    { metrics: { price: 202.54, revenueGrowthPct: 12.8, operatingMarginPct: 37.0 }, price: 202.54 },
  ),
  source("MSFT", "price", "2021 year-end replay mark", "2021-12-31T21:00:00.000Z", "Replay mark: Microsoft cloud durability and Office cash flow kept the long thesis intact.", { metrics: { price: 336.32 }, price: 336.32 }),
  source("MSFT", "price", "2022 drawdown replay mark", "2022-12-30T21:00:00.000Z", "Replay mark: Microsoft derated with software multiples while Azure durability remained the key thesis check.", { metrics: { price: 239.82 }, price: 239.82 }),
  source("MSFT", "price", "2023 AI/cloud replay mark", "2023-12-29T21:00:00.000Z", "Replay mark: Microsoft benefited from AI and cloud platform positioning, strengthening the original cloud durability thesis.", { metrics: { price: 376.04 }, price: 376.04 }),
  source("MSFT", "price", "2025 replay mark", "2025-12-31T21:00:00.000Z", "Replay mark: Microsoft remains tied to cloud, AI monetization, and margin discipline.", { metrics: { price: 485.0 }, price: 485.0 }),
  source("MSFT", "price", "Present replay mark", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible mark kept Microsoft intact as cloud durability, AI monetization, and margin discipline remained load-bearing.", { metrics: { price: 500.0 }, price: 500.0 }),
  source(
    "NVDA",
    "filing",
    "FY2020 gaming and data center reset",
    "2020-02-21T14:30:00.000Z",
    "NVIDIA entered 2020 after a gaming inventory correction with data center growth and GPU acceleration as the main recovery debate.",
    { metrics: { price: 73.37, revenueBn: 10.9, grossMarginPct: 62.0 }, price: 73.37 },
  ),
  source(
    "NVDA",
    "news",
    "Data center demand offsets macro fear",
    "2020-05-22T13:30:00.000Z",
    "NVIDIA reported data center strength as hyperscale and AI workloads supported a sharper recovery thesis than the market had underwritten in March.",
    { metrics: { price: 90.26, revenueGrowthPct: 39.0 }, price: 90.26 },
  ),
  source(
    "NVDA",
    "news",
    "Ampere launch raises accelerator cycle expectations",
    "2020-05-14T13:30:00.000Z",
    "The Ampere data-center GPU launch strengthened the view that accelerator demand was becoming a structural compute budget line rather than a niche hardware cycle.",
    { metrics: { price: 81.50 }, price: 81.5 },
  ),
  source("NVDA", "price", "2021 year-end replay mark", "2021-12-31T21:00:00.000Z", "Replay mark: NVIDIA exited 2021 with gaming, data center, and accelerator demand supporting a high-conviction long thesis.", { metrics: { price: 294.11 }, price: 294.11 }),
  source("NVDA", "price", "2022 semiconductor drawdown replay mark", "2022-12-30T21:00:00.000Z", "Replay mark: NVIDIA sold off as gaming normalized and semis derated; thesis health depended on data center persistence.", { metrics: { price: 146.14 }, price: 146.14 }),
  source("NVDA", "news", "2023 AI accelerator demand inflection", "2023-05-25T13:30:00.000Z", "NVIDIA reported a major AI data-center demand inflection, validating the accelerator-cycle thesis and creating an add/hold rather than exit signal.", { metrics: { price: 379.8 }, price: 379.8 }),
  source("NVDA", "price", "2025 replay mark", "2025-12-31T21:00:00.000Z", "Replay mark: NVIDIA remains the main AI accelerator exposure; position management should trim large gains but keep thesis-linked exposure while intact.", { metrics: { price: 140.0 }, price: 140.0 }),
  source("NVDA", "price", "Present replay mark", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible mark kept NVIDIA active, but AI accelerator concentration risk still governed sizing discipline.", { metrics: { price: 155.0 }, price: 155.0 }),
  source(
    "TSLA",
    "news",
    "Delivery volatility and factory disruption dominate debate",
    "2020-03-20T13:30:00.000Z",
    "Tesla faced factory disruption and delivery uncertainty during the COVID shock. The debate turned on liquidity, production continuity, and whether demand would recover quickly.",
    { metrics: { price: 85.51 }, price: 85.51 },
  ),
  source(
    "TSLA",
    "fundamentals",
    "Second-quarter profitability despite shutdowns",
    "2020-07-23T13:30:00.000Z",
    "Tesla posted a surprise quarterly profit despite production disruptions. The result reduced near-term liquidity pressure but increased the burden on valuation and delivery execution.",
    { metrics: { price: 302.61, revenueGrowthPct: -4.9 }, price: 302.61 },
  ),
  source("TSLA", "price", "2021 year-end replay mark", "2021-12-31T21:00:00.000Z", "Replay mark: Tesla's execution and delivery momentum challenged the short thesis; risk rules should force a thesis re-check or exit.", { metrics: { price: 352.26 }, price: 352.26 }),
  source("TSLA", "news", "2022 demand and margin pressure", "2022-12-30T21:00:00.000Z", "Tesla derated as demand elasticity, price cuts, and margin pressure became central. The short thesis regained support only after execution risk became visible.", { metrics: { price: 123.18 }, price: 123.18 }),
  source("TSLA", "price", "2025 replay mark", "2025-12-31T21:00:00.000Z", "Replay mark: Tesla remains volatile with autonomy optionality, margin pressure, and delivery cadence driving thesis health.", { metrics: { price: 315.0 }, price: 315.0 }),
  source("TSLA", "price", "Present replay mark", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible mark kept Tesla in risk review as margin pressure, delivery cadence, and autonomy optionality challenged short-side control.", { metrics: { price: 300.0 }, price: 300.0 }),
  source(
    "AMD",
    "filing",
    "EPYC share-gain setup",
    "2020-02-05T14:30:00.000Z",
    "AMD entered 2020 with EPYC server share gains, Ryzen desktop strength, and a thesis dependent on gross margin expansion versus larger semiconductor peers.",
    { metrics: { price: 49.84, grossMarginPct: 43.0 }, price: 49.84 },
  ),
  source(
    "AMD",
    "fundamentals",
    "Data center and console cycle support demand",
    "2020-07-29T13:30:00.000Z",
    "AMD raised full-year revenue expectations as data center and semi-custom demand improved, supporting the share-gain thesis but increasing execution expectations.",
    { metrics: { price: 76.09, revenueGrowthPct: 26.0 }, price: 76.09 },
  ),
  source("AMD", "price", "2021 year-end replay mark", "2021-12-31T21:00:00.000Z", "Replay mark: AMD share-gain thesis continued as server and PC execution improved.", { metrics: { price: 143.9 }, price: 143.9 }),
  source("AMD", "price", "2022 drawdown replay mark", "2022-12-30T21:00:00.000Z", "Replay mark: AMD derated with PCs and semis, testing the share-gain thesis but not eliminating data center optionality.", { metrics: { price: 64.77 }, price: 64.77 }),
  source("AMD", "news", "2023 AI accelerator catch-up debate", "2023-12-29T21:00:00.000Z", "AMD rallied as the market began underwriting AI accelerator catch-up potential alongside the server CPU share thesis.", { metrics: { price: 147.41 }, price: 147.41 }),
  source("AMD", "price", "Present replay mark", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible mark kept AMD intact as server share gains and AI accelerator catch-up still supported thesis health.", { metrics: { price: 175.0 }, price: 175.0 }),
  source(
    "NFLX",
    "news",
    "Stay-at-home subscriber surge",
    "2020-04-22T13:30:00.000Z",
    "Netflix reported a major subscriber pull-forward as stay-at-home behavior accelerated streaming adoption. The debate shifted to durability after reopening.",
    { metrics: { price: 421.42, revenueGrowthPct: 27.6 }, price: 421.42 },
  ),
  source(
    "NFLX",
    "news",
    "Subscriber growth deceleration warning",
    "2020-07-17T13:30:00.000Z",
    "Netflix guided to slower subscriber additions after the first-half pull-forward. The event weakened the pure pandemic-beneficiary thesis and raised churn/demand-normalization risk.",
    { metrics: { price: 492.99 }, price: 492.99 },
  ),
  source("NFLX", "news", "2022 subscriber reset breaks pandemic pull-forward thesis", "2022-04-20T13:30:00.000Z", "Netflix reported subscriber weakness and reset the streaming growth narrative. Any thesis anchored only on pandemic pull-forward should be closed or shelved.", { metrics: { price: 226.19 }, price: 226.19 }),
  source("NFLX", "news", "2023 ad tier and password sharing recovery", "2023-12-29T21:00:00.000Z", "Netflix recovered as paid sharing and ad-tier execution shifted the debate from subscriber saturation to monetization discipline.", { metrics: { price: 486.88 }, price: 486.88 }),
  source("NFLX", "price", "Present replay mark", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible mark kept Netflix on monitor as paid sharing, ad-tier monetization, and content-spend discipline framed thesis health.", { metrics: { price: 720.0 }, price: 720.0 }),
  source(
    "META",
    "news",
    "Advertising shock hits social platforms",
    "2020-03-25T13:30:00.000Z",
    "Facebook usage rose during lockdowns, but advertising demand weakened sharply. The thesis depended on whether engagement could convert back into ad revenue as budgets normalized.",
    { metrics: { price: 156.21 }, price: 156.21 },
  ),
  source(
    "META",
    "fundamentals",
    "Ad recovery begins to show in second quarter",
    "2020-07-31T13:30:00.000Z",
    "Facebook reported signs of advertising stabilization and strong user engagement, keeping the recovery thesis intact while regulatory risk remained explicit.",
    { metrics: { price: 253.67, revenueGrowthPct: 11.0, operatingMarginPct: 32.0 }, price: 253.67 },
  ),
  source("META", "news", "2022 ad slowdown and metaverse spending break margin thesis", "2022-10-27T13:30:00.000Z", "Meta sold off after ad weakness and heavy metaverse spending pressured margins. The original ad recovery thesis weakened and required a risk-driven trim or exit.", { metrics: { price: 97.94 }, price: 97.94 }),
  source("META", "news", "2023 year of efficiency restores margin discipline", "2023-12-29T21:00:00.000Z", "Meta recovered after cost discipline and ad-market stabilization restored the margin thesis.", { metrics: { price: 353.96 }, price: 353.96 }),
  source("META", "price", "Present replay mark", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible mark kept Meta intact as ad recovery and cost discipline outweighed AI spend and regulatory risk for now.", { metrics: { price: 625.0 }, price: 625.0 }),
  source(
    "SPY",
    "macro",
    "Market regime enters COVID drawdown",
    "2020-03-16T13:30:00.000Z",
    "Broad risk appetite deteriorated as investors repriced earnings, liquidity, and shutdown risk. Risk Gate should cap gross exposure and prefer smaller starter sizes.",
    { metrics: { price: 239.85, vix: 82.7 }, price: 239.85 },
  ),
  source(
    "SPY",
    "macro",
    "Policy response stabilizes risk appetite",
    "2020-04-09T13:30:00.000Z",
    "Federal Reserve support and fiscal stimulus helped stabilize risk assets. The book can take selective exposure, but event risk remains elevated.",
    { metrics: { price: 278.20, vix: 41.7 }, price: 278.2 },
  ),
  source("SPY", "macro", "2022 rate shock replay regime", "2022-06-30T20:00:00.000Z", "Broad market risk deteriorated as inflation and rates compressed multiples. Risk Gate should reduce adds and consider trims on weakened theses.", { metrics: { price: 377.25, vix: 28.7 }, price: 377.25 }),
  source("SPY", "macro", "2023 risk appetite recovery replay regime", "2023-12-29T21:00:00.000Z", "Risk appetite recovered as mega-cap earnings and AI enthusiasm led the tape. Desk can hold winners while trimming excessive concentration.", { metrics: { price: 475.31, vix: 12.5 }, price: 475.31 }),
  source("SPY", "macro", "Present replay regime", "2026-04-17T20:00:00.000Z", "Replay mark: Latest visible macro mark left gross exposure tied to mega-cap earnings, AI spend, and rate expectations.", { metrics: { price: 570.0, vix: 17.0 }, price: 570.0 }),
];

export const historicalSources: HistoricalSource[] = [
  ...coreReplaySources,
  ...expansionReplayPack,
].sort((left, right) => left.knownAt.localeCompare(right.knownAt));

export const FULL_AUTO_REPLAY_MIN_DATE =
  historicalSources[0]?.knownAt ?? "2020-01-02T14:30:00.000Z";

export const FULL_AUTO_REPLAY_MAX_DATE =
  historicalSources[historicalSources.length - 1]?.knownAt ??
  "2026-04-17T20:00:00.000Z";

const toTime = (value: string) => new Date(value).getTime();

export const companyForTicker = (ticker: string) =>
  fullAutoUniverseCompanies.find(
    (company) => company.ticker === ticker.toUpperCase(),
  ) ?? {
    ticker: ticker.toUpperCase(),
    companyName: ticker.toUpperCase(),
    sector: "Unclassified",
  };

export const getVisibleSources = ({
  lookbackWindowDays,
  simulationTime,
  ticker,
  universe,
}: {
  simulationTime: string;
  ticker?: string;
  universe?: string[];
  lookbackWindowDays?: number;
}) => {
  const simulationMs = toTime(simulationTime);
  const minMs = lookbackWindowDays
    ? simulationMs - lookbackWindowDays * 24 * 60 * 60 * 1000
    : Number.NEGATIVE_INFINITY;
  const allowed = new Set((universe ?? FULL_AUTO_DEFAULT_UNIVERSE).map((item) => item.toUpperCase()));
  return historicalSources.filter((item) => {
    const knownMs = toTime(item.knownAt);
    if (knownMs > simulationMs || knownMs < minMs) return false;
    if (ticker) return item.ticker === ticker.toUpperCase();
    return allowed.has(item.ticker) || item.ticker === "SPY";
  });
};

export const getLatestPriceAt = (ticker: string, simulationTime: string) =>
  getLatestPriceSnapshotAt(ticker, simulationTime)?.price ?? null;

export const getLatestPriceSnapshotAt = (ticker: string, simulationTime: string) =>
  [...getVisibleSources({ simulationTime, ticker })]
    .filter((item) => typeof item.price === "number")
    .sort((left, right) => right.knownAt.localeCompare(left.knownAt))
    .map((item) => ({
      knownAt: item.knownAt,
      price: item.price as number,
      sourceId: item.sourceId,
    }))[0] ?? null;

export const getNextKnownEventDate = ({
  currentTime,
  universe,
}: {
  currentTime: string;
  universe: string[];
}) => {
  const currentMs = toTime(currentTime);
  const allowed = new Set(universe.map((item) => item.toUpperCase()));
  const next = historicalSources.find((item) => {
    if (!allowed.has(item.ticker) && item.ticker !== "SPY") return false;
    return toTime(item.knownAt) > currentMs;
  });
  return next?.knownAt ?? null;
};

export const getNextPortfolioMarkDate = ({
  currentTime,
  tickers,
}: {
  currentTime: string;
  tickers: string[];
}) => {
  const currentMs = toTime(currentTime);
  const allowed = new Set(tickers.map((item) => item.toUpperCase()));
  const next = historicalSources.find((item) => {
    if (toTime(item.knownAt) <= currentMs) return false;
    if (item.ticker === "SPY") return item.sourceType === "macro";
    if (!allowed.has(item.ticker)) return false;
    return item.sourceType === "price" || item.sourceType === "news";
  });
  return next?.knownAt ?? null;
};

export const addSimulationDay = (value: string) => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
};

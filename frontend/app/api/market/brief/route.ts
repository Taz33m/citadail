import { NextResponse } from "next/server";

import { fetchBuiltInMarketSources } from "@/lib/built-in-market-data";
import { buildMarketBriefFromSources, seedMarketBrief } from "@/lib/market-brief-data";

export async function GET() {
  const sources = await fetchBuiltInMarketSources();
  const payload = buildMarketBriefFromSources({
    news: sources.news,
    screener: sources.screener,
    macro: sources.macro,
    indices: sources.indices,
  });

  return NextResponse.json({
    ...(sources.successCount === 0 ? seedMarketBrief : payload),
    sourceStatus:
      sources.successCount === 0
        ? "seed"
        : sources.failedCount === 0
          ? "internal"
          : "partial",
  });
}

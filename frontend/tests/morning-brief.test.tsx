import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import MorningBrief from "@/components/morning-brief";
import { buildMarketBriefFromSources } from "@/lib/market-brief-data";

describe("MorningBrief", () => {
  it("renders the newspaper-style front page sections", () => {
    const markup = renderToStaticMarkup(<MorningBrief />);

    expect(markup).toContain("Morning News");
    expect(markup).toContain("Market Sentiment");
    expect(markup).toContain("Lead Story");
    expect(markup).toContain("Top Gainers");
    expect(markup).toContain("Top Losers");
    expect(markup).toContain("Most Active");
  });

  it("normalizes news, screener, macro, and index payloads", () => {
    const brief = buildMarketBriefFromSources({
      asOf: "2026-04-18T13:00:00.000Z",
      news: [
        {
          id: "headline-1",
          headline: "Earnings revisions drive the morning tape",
          summary: "Guidance updates are moving single names.",
          source: "Finnhub",
        },
      ],
      screener: {
        gainers: [
          {
            symbol: "MSFT",
            name: "Microsoft Corporation",
            price: 420,
            percent_change: 2.1,
            volume: 22000000,
          },
        ],
        losers: [
          {
            symbol: "TSLA",
            name: "Tesla, Inc.",
            price: 170,
            percent_change: -3.2,
            volume: 80000000,
          },
        ],
        active: [
          {
            symbol: "NVDA",
            name: "NVIDIA Corporation",
            price: 880,
            relative_volume_20d: 1.8,
            volume: 54000000,
          },
        ],
      },
      indices: {
        SPY: { price: 520, changePercent: 0.5 },
        QQQ: { price: 445, changePercent: 0.8 },
        DIA: { price: 383, changePercent: 0.1 },
      },
      macro: [
        {
          symbol: "TNX",
          name: "10-Year Treasury Yield",
          unit: "%",
          value: 4.32,
          prev: 4.28,
        },
      ],
    });

    expect(brief.sourceStatus).toBe("internal");
    expect(brief.sentiment.tone).toBe("positive");
    expect(brief.leadStory.headline).toBe(
      "Earnings revisions drive the morning tape",
    );
    expect(brief.screeners.gainers[0]?.symbol).toBe("MSFT");
    expect(brief.screeners.losers[0]?.symbol).toBe("TSLA");
    expect(brief.screeners.active[0]?.symbol).toBe("NVDA");
    expect(brief.macro[0]?.symbol).toBe("TNX");
  });
});

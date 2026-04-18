import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CoverageDesk from "@/components/coverage-desk";
import {
  coverageDeskItems,
  filterCoverageDeskItems,
  getCoverageDeskSectionItems,
} from "@/lib/coverage-desk-data";

describe("CoverageDesk", () => {
  it("renders the starter coverage desk artifact surface", () => {
    const markup = renderToStaticMarkup(<CoverageDesk />);

    expect(markup).toContain("Coverage Desk");
    expect(markup).toContain("Search ticker or company");
    expect(markup).toContain("Current Coverage");
    expect(markup).toContain("Watchlist");
    expect(markup).toContain("Flagged Names");
    expect(markup).not.toContain("Top Gainers");
    expect(markup).not.toContain("Top Losers");
    expect(markup).not.toContain("Most Active");
  });

  it("filters local desk names by ticker, company, and sector", () => {
    expect(filterCoverageDeskItems(coverageDeskItems, "aapl")).toEqual([
      expect.objectContaining({ ticker: "AAPL" }),
    ]);
    expect(filterCoverageDeskItems(coverageDeskItems, "microsoft")).toEqual([
      expect.objectContaining({ ticker: "MSFT" }),
    ]);
    expect(filterCoverageDeskItems(coverageDeskItems, "software").map((item) => item.ticker)).toEqual([
      "MSFT",
      "ADBE",
    ]);
  });

  it("keeps current coverage, watchlist, and flagged names separate", () => {
    expect(
      getCoverageDeskSectionItems(coverageDeskItems, "covered").map(
        (item) => item.ticker,
      ),
    ).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(
      getCoverageDeskSectionItems(coverageDeskItems, "watchlist").map(
        (item) => item.ticker,
      ),
    ).toEqual(["AMZN", "GOOGL"]);
    expect(
      getCoverageDeskSectionItems(coverageDeskItems, "flagged").map(
        (item) => item.ticker,
      ),
    ).toEqual(["TSLA", "DIS", "ADBE"]);
  });
});

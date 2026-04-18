import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ThesisTab from "@/components/thesis-tab";

describe("ThesisTab", () => {
  it("renders the initial thesis decision surface", () => {
    const markup = renderToStaticMarkup(
      <ThesisTab
        draft={{
          ticker: "AAPL",
          recommendation: null,
          rationale: "",
          submittedAt: null,
        }}
        onChange={() => {}}
      />,
    );

    expect(markup).toContain("Initial Thesis");
    expect(markup).toContain("AAPL");
    expect(markup).toContain("Buy / Long");
    expect(markup).toContain("Hold / Neutral");
    expect(markup).toContain("Sell / Short");
    expect(markup).toContain("Rationale");
    expect(markup).toContain("Send");
    expect(markup).not.toContain("Draft");
  });
});

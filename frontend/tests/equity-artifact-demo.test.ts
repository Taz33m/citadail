import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildEquityExport } from "@/lib/equity-office-export";
import { fetchEquityResearchContext } from "@/lib/equity-research-data";
import {
  buildReadyEquityProjectFixture,
  generatedEquityContentFixture,
} from "@/tests/utils/equity-project-fixture";

const outputDir = path.join(
  process.cwd(),
  "outputs",
  "equity-demo",
  "aapl-buy-long",
);

describe("equity artifact demo", () => {
  it("writes real analyst deliverables for a specific AAPL Buy / Long thesis", async () => {
    const researchContext = await fetchEquityResearchContext({
      ticker: "AAPL",
      companyContext: { companyName: "Apple Inc.", sector: "Technology" },
    });
    const project = {
      ...buildReadyEquityProjectFixture(),
      rationale:
        "Buy / Long: services durability and margin discipline are underappreciated while the market is over-focused on near-term iPhone unit pressure.",
      generatedContent: {
        ...generatedEquityContentFixture,
        recommendationSummary:
          "Buy / Long. User rationale: services durability and margin discipline are underappreciated while the market is over-focused on near-term iPhone unit pressure.",
        variantPerception:
          "Consensus likely focuses on hardware unit softness. We believe the sharper question is whether services mix and operating leverage can defend earnings power through the next product cycle.",
        evidence: [
          ...researchContext.evidence,
          ...generatedEquityContentFixture.evidence,
        ],
        modelAssumptions: [
          ...researchContext.modelAssumptions,
          ...generatedEquityContentFixture.modelAssumptions,
        ],
        forecast:
          researchContext.forecastBaseline
            ? [
                researchContext.forecastBaseline,
                ...generatedEquityContentFixture.forecast.slice(1),
              ]
            : generatedEquityContentFixture.forecast,
      },
    };

    await mkdir(outputDir, { recursive: true });

    const exports = await Promise.all([
      buildEquityExport({ artifactType: "memo_docx", project }),
      buildEquityExport({ artifactType: "operating_model_xlsx", project }),
      buildEquityExport({ artifactType: "pm_deck_pptx", project }),
    ]);

    await Promise.all(
      exports.map((artifact) =>
        writeFile(path.join(outputDir, artifact.filename), artifact.buffer),
      ),
    );

    expect(exports.map((artifact) => artifact.filename)).toEqual([
      "AAPL_Memo.docx",
      "AAPL_Model.xlsx",
      "AAPL_Deck.pptx",
    ]);
    exports.forEach((artifact) => {
      expect(artifact.buffer.subarray(0, 2).toString()).toBe("PK");
      expect(artifact.buffer.byteLength).toBeGreaterThan(1000);
    });
  });
});

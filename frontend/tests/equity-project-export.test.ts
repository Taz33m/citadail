import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";

import { POST as exportPost } from "@/app/api/equity/project/export/route";
import { POST as previewPost } from "@/app/api/equity/project/preview/route";
import { buildEquityExport } from "@/lib/equity-office-export";
import {
  completeEquityProject,
  createPendingEquityProject,
  normalizeGeneratedContent,
} from "@/lib/equity-project";
import { fetchEquityResearchContext } from "@/lib/equity-research-data";
import {
  buildReadyEquityProjectFixture,
  generatedEquityContentFixture,
} from "@/tests/utils/equity-project-fixture";

vi.mock("@google/genai", () => ({
  Type: {
    ARRAY: "ARRAY",
    NUMBER: "NUMBER",
    OBJECT: "OBJECT",
    STRING: "STRING",
  },
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async () => ({
        text: JSON.stringify(generatedEquityContentFixture),
      })),
    };
  },
}));

const officeZipText = (buffer: Buffer) => buffer.toString("latin1");

const pptxSlideText = async (buffer: Buffer) => {
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort();
  const slides = await Promise.all(
    slidePaths.map((path) => zip.file(path)?.async("string") ?? ""),
  );
  return slides.join("\n").replace(/<[^>]+>/g, " ");
};

describe("equity project deliverables", () => {
  it("builds a narrative-heavy research context before generation", async () => {
    const context = await fetchEquityResearchContext({
      ticker: "AAPL",
      companyContext: { companyName: "Apple Inc.", sector: "Technology" },
    });

    expect(context.sourceStatus).toBe("cached");
    expect(context.sourceDocuments.length).toBeGreaterThanOrEqual(5);
    expect(context.promptBlock).toContain("Narrative source documents");
    expect(context.promptBlock).toContain("Narrative fundamentals / evidence pack");
    expect(context.evidence[0]?.label).toBe("What changed");
    expect(context.evidence.some((row) => row.label === "Market debate")).toBe(
      true,
    );
    expect(context.evidence.some((row) => row.label.includes("revenue base"))).toBe(
      true,
    );
  });

  it("creates pending project state from a submitted thesis", () => {
    const project = createPendingEquityProject({
      ticker: "aapl",
      recommendation: "buy-long",
      rationale: "Services durability is underappreciated.",
      submittedAt: "2026-04-18T00:00:00.000Z",
    });

    expect(project.status).toBe("generating");
    expect(project.ticker).toBe("AAPL");
    expect(project.artifacts.memo_docx.filename).toBe("AAPL_Memo.docx");
    expect(project.artifacts.operating_model_xlsx.filename).toBe(
      "AAPL_Model.xlsx",
    );
    expect(project.artifacts.pm_deck_pptx.filename).toBe("AAPL_Deck.pptx");
  });

  it("generates required artifact metadata through the generation route", async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";
    const { POST: generatePost } = await import(
      "@/app/api/equity/project/generate/route"
    );

    const response = await generatePost(
      new NextRequest("http://localhost/api/equity/project/generate", {
        method: "POST",
        body: JSON.stringify({
          ticker: "AAPL",
          recommendation: "buy-long",
          rationale: "Services durability is underappreciated.",
        }),
      }),
    );
    const payload = (await response.json()) as {
      success: boolean;
      project: ReturnType<typeof buildReadyEquityProjectFixture>;
    };

    process.env.GEMINI_API_KEY = oldKey;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.project.status).toBe("ready");
    expect(payload.project.artifacts.memo_docx.mimeType).toContain(
      "wordprocessingml",
    );
    expect(payload.project.artifacts.operating_model_xlsx.mimeType).toContain(
      "spreadsheetml",
    );
    expect(payload.project.artifacts.pm_deck_pptx.mimeType).toContain(
      "presentationml",
    );
    expect(payload.project.generatedContent?.evidence[0]?.label).toBe(
      "What changed",
    );
  });

  it("repairs short memo section payloads from canonical thesis fields", () => {
    const normalized = normalizeGeneratedContent({
      ...generatedEquityContentFixture,
      memoSections: generatedEquityContentFixture.memoSections.slice(0, 1),
    });

    expect(normalized.memoSections.length).toBeGreaterThanOrEqual(5);
    expect(normalized.memoSections.map((section) => section.heading)).toContain(
      "Why Now",
    );
    expect(normalized.memoSections.map((section) => section.heading)).toContain(
      "Variant Perception / Edge",
    );
  });

  it("exports valid DOCX, XLSX, and PPTX Office zip binaries", async () => {
    const project = buildReadyEquityProjectFixture();
    const memo = await buildEquityExport({
      artifactType: "memo_docx",
      project,
    });
    const model = await buildEquityExport({
      artifactType: "operating_model_xlsx",
      project,
    });
    const deck = await buildEquityExport({
      artifactType: "pm_deck_pptx",
      project,
    });

    expect(memo.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(model.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(deck.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(officeZipText(memo.buffer)).toContain("word/document.xml");
    expect(officeZipText(model.buffer)).toContain("xl/worksheets/sheet1.xml");
    expect(officeZipText(deck.buffer)).toContain("ppt/slides/slide1.xml");
  });

  it("keeps greeting-only rationale out of the PM deck", async () => {
    const pendingProject = createPendingEquityProject({
      ticker: "AAPL",
      recommendation: "buy-long",
      rationale: "hi",
      submittedAt: "2026-04-18T00:00:00.000Z",
    });
    const project = completeEquityProject({
      project: pendingProject,
      content: normalizeGeneratedContent({
        ...generatedEquityContentFixture,
        recommendationSummary:
          "Buy / Long. hi Source-backed support comes from Apple FY2024 Form 10-K.",
        variantPerception:
          "hi The variant view is only valid if the driver model keeps revenue growth near 4.3%.",
      }),
    });

    const deck = await buildEquityExport({
      artifactType: "pm_deck_pptx",
      project,
    });
    const text = await pptxSlideText(deck.buffer);

    expect(text).not.toMatch(/\bhi The variant/i);
    expect(text).not.toContain("Initial analyst rationale: hi");
    expect(text).toContain("Research basis");
  });

  it("builds the workbook with expected analyst sheets", async () => {
    const project = buildReadyEquityProjectFixture();
    const model = await buildEquityExport({
      artifactType: "operating_model_xlsx",
      project,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(model.buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Summary",
      "Inputs",
      "Operating Model",
      "Sensitivity",
      "Valuation",
      "Comps",
      "Risk Triggers",
      "Source Notes",
    ]);
  });

  it("export route returns correct headers and binary body", async () => {
    const project = buildReadyEquityProjectFixture();
    const response = await exportPost(
      new NextRequest("http://localhost/api/equity/project/export", {
        method: "POST",
        body: JSON.stringify({
          artifactType: "memo_docx",
          project,
        }),
      }),
    );

    const buffer = Buffer.from(await response.arrayBuffer());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("wordprocessingml");
    expect(response.headers.get("content-disposition")).toContain(
      "AAPL_Memo.docx",
    );
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("previews exported DOCX, XLSX, and PPTX artifacts from the Office binaries", async () => {
    const project = buildReadyEquityProjectFixture();

    const memoResponse = await previewPost(
      new NextRequest("http://localhost/api/equity/project/preview", {
        method: "POST",
        body: JSON.stringify({ artifactType: "memo_docx", project }),
      }),
    );
    const modelResponse = await previewPost(
      new NextRequest("http://localhost/api/equity/project/preview", {
        method: "POST",
        body: JSON.stringify({ artifactType: "operating_model_xlsx", project }),
      }),
    );
    const deckResponse = await previewPost(
      new NextRequest("http://localhost/api/equity/project/preview", {
        method: "POST",
        body: JSON.stringify({ artifactType: "pm_deck_pptx", project }),
      }),
    );

    const memoPayload = await memoResponse.json();
    const modelPayload = await modelResponse.json();
    const deckPayload = await deckResponse.json();

    expect(memoResponse.status).toBe(200);
    expect(modelResponse.status).toBe(200);
    expect(deckResponse.status).toBe(200);
    expect(memoPayload.preview.kind).toBe("memo");
    expect(memoPayload.preview.blocks.length).toBeGreaterThan(5);
    expect(modelPayload.preview.kind).toBe("workbook");
    expect(modelPayload.preview.sheets.map((sheet: { name: string }) => sheet.name)).toContain(
      "Operating Model",
    );
    const operatingModelPreview = modelPayload.preview.sheets.find(
      (sheet: { name: string }) => sheet.name === "Operating Model",
    );
    expect(operatingModelPreview.rows[0].rowNumber).toBe(3);
    expect(
      operatingModelPreview.rows[0].cells.map(
        (cell: { value: string }) => cell.value,
      ),
    ).toContain("$mm except per-share data");
    expect(
      operatingModelPreview.rows[0].cells.map(
        (cell: { value: string }) => cell.value,
      ),
    ).not.toContain("AAPL Operating Model");
    expect(deckPayload.preview.kind).toBe("deck");
    expect(deckPayload.preview.slides.length).toBeGreaterThanOrEqual(5);
  });
});

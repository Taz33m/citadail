import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import pptxgen from "pptxgenjs";

import {
  formatThesisRecommendation,
  MIME_TYPES,
  normalizeAnalystRationale,
  sanitizeFilenamePart,
  stripNonSubstantiveLead,
} from "@/lib/equity-project";
import type {
  EquityCompsRow,
  EquityForecastRow,
  EquityProject,
  EquityProjectArtifactType,
  EquityProjectGeneratedContent,
  EquityRiskTrigger,
  EquitySensitivityRow,
  EquityTradeProposal,
  EquityValuationOutput,
} from "@/types/session";

export interface EquityExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

const EMPTY_CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" },
};

const moneyFormat = '$#,##0.0;[Red]($#,##0.0);-';
const percentFormat = '0.0%;[Red](0.0%);-';
const multipleFormat = '0.0x;[Red](0.0x);-';
const DOCX_PAGE_WIDTH = 12240;
const DOCX_PAGE_HEIGHT = 15840;
const DOCX_PAGE_MARGIN = 1440;
const DOCX_CONTENT_WIDTH = DOCX_PAGE_WIDTH - DOCX_PAGE_MARGIN * 2;
const DOCX_NAVY = "17345C";
const EXCEL = {
  bg: "FFF7F8FA",
  gold: "FFB08D57",
  inputFill: "FFFFF2CC",
  line: "FFD6DEE8",
  linkGreen: "FF008000",
  navy: "FF061B33",
  navy2: "FF0D2B4C",
  red: "FFFF0000",
  slate: "FFE7EBF0",
  steel: "FF5F738A",
  white: "FFFFFFFF",
};

const asPercent = (value: number) => (Math.abs(value) > 1 ? value / 100 : value);

const excelColumnName = (columnNumber: number) => {
  let column = "";
  let current = columnNumber;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    current = Math.floor((current - 1) / 26);
  }
  return column;
};

const excelBorder = {
  bottom: { style: "thin" as const, color: { argb: EXCEL.line } },
  left: { style: "thin" as const, color: { argb: EXCEL.line } },
  right: { style: "thin" as const, color: { argb: EXCEL.line } },
  top: { style: "thin" as const, color: { argb: EXCEL.line } },
};

const paragraph = (text: string, options?: { bold?: boolean }) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        bold: options?.bold,
      }),
    ],
  });

const heading = (text: string, level = HeadingLevel.HEADING_2) =>
  new Paragraph({
    text,
    heading: level,
    spacing: { before: 240, after: 120 },
  });

const bullet = (text: string) =>
  new Paragraph({
    children: [new TextRun(text)],
    numbering: { reference: "memo-bullets", level: 0 },
    spacing: { after: 80 },
  });

const tableCell = (
  text: string,
  bold = false,
  width = DOCX_CONTENT_WIDTH,
  fill?: string,
) =>
  new TableCell({
    borders: EMPTY_CELL_BORDER,
    width: { size: width, type: WidthType.DXA },
    ...(fill
      ? { shading: { fill, type: ShadingType.CLEAR, color: "auto" } }
      : {}),
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold,
            color: fill ? "FFFFFF" : undefined,
          }),
        ],
      }),
    ],
  });

const addRows = <T>(
  title: string,
  rows: T[],
  render: (row: T) => string[],
  options?: { columnWidths?: number[] },
) => {
  const renderedRows = rows.map(render);
  const columnCount = Math.max(1, renderedRows[0]?.length ?? 1);
  const baseWidth = Math.floor(DOCX_CONTENT_WIDTH / columnCount);
  const columnWidths =
    options?.columnWidths?.length === columnCount
      ? options.columnWidths
      : Array.from({ length: columnCount }, (_, index) =>
          index === columnCount - 1
            ? DOCX_CONTENT_WIDTH - baseWidth * (columnCount - 1)
            : baseWidth,
        );

  return [
    heading(title),
    new Table({
      width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths,
      rows: renderedRows.map(
        (row, rowIndex) =>
          new TableRow({
            children: row.map((value, columnIndex) =>
              tableCell(
                value,
                rowIndex === 0,
                columnWidths[columnIndex] ?? baseWidth,
                rowIndex === 0 ? DOCX_NAVY : undefined,
              ),
            ),
          }),
      ),
    }),
  ];
};

const CANONICAL_MEMO_HEADINGS = new Set(
  [
    "company overview",
    "what the company is",
    "recommendation",
    "recommendation / bias",
    "executive summary",
    "why now",
    "what changed",
    "variant perception / edge",
    "bull / base / bear",
    "catalysts",
    "risks",
    "risks and falsification",
    "invalidation conditions",
  ].map((heading) => heading.toLowerCase()),
);

const stripLeadingRecommendation = (summary: string) =>
  summary
    .replace(/^(buy\s*\/\s*long|hold\s*\/\s*neutral|sell\s*\/\s*short)\.?\s*/i, "")
    .trim();

export const buildMemoDocx = async (
  project: EquityProject,
): Promise<Buffer> => {
  const content = requireGeneratedContent(project);
  const title = `${project.ticker} Investment Memo`;
  const recommendationSummary = stripLeadingRecommendation(
    content.recommendationSummary,
  );
  const supplementalMemoSections = content.memoSections.filter(
    (section) =>
      !CANONICAL_MEMO_HEADINGS.has(section.heading.trim().toLowerCase()),
  );
  const generatedAt = new Date(project.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const document = new Document({
    creator: "Citadail",
    title,
    description: "AI-assisted internal equity research memo.",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22, color: "111827" },
          paragraph: { spacing: { after: 120 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 34, bold: true, color: DOCX_NAVY },
          paragraph: { spacing: { after: 160 } },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 28, bold: true, color: DOCX_NAVY },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Arial", size: 24, bold: true, color: DOCX_NAVY },
          paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "memo-bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "\u2022",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 420, hanging: 180 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: DOCX_PAGE_WIDTH,
              height: DOCX_PAGE_HEIGHT,
            },
            margin: {
              top: DOCX_PAGE_MARGIN,
              right: DOCX_PAGE_MARGIN,
              bottom: DOCX_PAGE_MARGIN,
              left: DOCX_PAGE_MARGIN,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Citadail Equity Research",
                    bold: true,
                    color: DOCX_NAVY,
                    size: 18,
                  }),
                  new TextRun({
                    text: ` | ${project.ticker}`,
                    color: "64748B",
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "Confidential internal draft | Page ",
                    color: "64748B",
                    size: 18,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: "64748B",
                    size: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.LEFT,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Citadail Equity Research",
                bold: true,
                color: DOCX_NAVY,
              }),
              new TextRun({
                text: ` | Generated ${generatedAt}`,
                color: "64748B",
              }),
            ],
            spacing: { after: 180 },
          }),
          ...addRows(
            "Thesis Snapshot",
            [
              { field: "Field", detail: "Detail" },
              { field: "Ticker", detail: project.ticker },
              {
                field: "Recommendation",
                detail: formatThesisRecommendation(project.recommendation),
              },
              { field: "Rationale", detail: project.rationale },
              {
                field: "Source posture",
                detail:
                  "Narrative source documents and reported baselines are cited; forward estimates are labeled separately.",
              },
            ],
            (row) => [row.field, row.detail],
          ),
          paragraph(
            `${formatThesisRecommendation(project.recommendation)}. ${recommendationSummary}`,
            { bold: true },
          ),
          paragraph(`User rationale: ${project.rationale}`),
          ...addRows(
            "Narrative Evidence",
            [
              {
                label: "Evidence",
                value: "Value",
                source: "Source",
                implication: "Implication",
              },
              ...content.evidence,
            ],
            (row) => [row.label, row.value, row.source, row.implication],
            { columnWidths: [1500, 3600, 1900, 2360] },
          ),
          heading("Company Overview"),
          paragraph(content.companyOverview),
          heading("Why Now"),
          paragraph(content.whyNow),
          heading("What Changed"),
          paragraph(content.whatChanged),
          heading("Variant Perception / Edge"),
          paragraph(content.variantPerception),
          paragraph(`Consensus likely believes: ${content.marketMissing}`),
          heading("Bull / Base / Bear"),
          paragraph(`Bull: ${content.bullCase}`),
          paragraph(`Base: ${content.baseCase}`),
          paragraph(`Bear: ${content.bearCase}`),
          heading("Catalysts"),
          ...content.catalysts.map(bullet),
          heading("Risks"),
          ...content.risks.map(bullet),
          heading("Invalidation Conditions"),
          ...content.invalidationConditions.map(bullet),
          ...(supplementalMemoSections.length
            ? [
                heading("Additional Analyst Notes"),
                ...supplementalMemoSections.flatMap((section) => [
                  heading(section.heading),
                  paragraph(section.body),
                ]),
              ]
            : []),
          ...addRows(
            "Risk Triggers",
            [
              { trigger: "Trigger", threshold: "Threshold", action: "Action" },
              ...content.riskTriggers,
            ],
            (row) => [row.trigger, row.threshold, row.action],
          ),
          heading("Trade Proposal"),
          paragraph(`Bias: ${content.tradeProposal.bias}`),
          paragraph(`Entry zone: ${content.tradeProposal.entryZone}`),
          paragraph(`Position size: ${content.tradeProposal.positionSize}`),
          paragraph(`Time horizon: ${content.tradeProposal.timeHorizon}`),
          paragraph(`Add / trim / exit: ${content.tradeProposal.addTrimExit}`),
          heading("Source Discipline"),
          paragraph(
            "Filing, news, profile, and reported-baseline claims in this package are cited where available. Forward-looking scenarios, valuation outputs, and trade sizing are explicitly labeled as estimates or user rationale.",
          ),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
};

const applySheetChrome = (sheet: ExcelJS.Worksheet, tabColor = EXCEL.navy) => {
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 4, showGridLines: false }];
  sheet.properties.defaultRowHeight = 18;
  sheet.properties.tabColor = { argb: tabColor };
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: {
      bottom: 0.35,
      footer: 0.2,
      header: 0.2,
      left: 0.25,
      right: 0.25,
      top: 0.35,
    },
    orientation: "landscape",
  };
  sheet.properties.defaultRowHeight = 18;
};

const setTitle = (sheet: ExcelJS.Worksheet, title: string, columns: number) => {
  sheet.mergeCells(1, 1, 1, columns);
  const cell = sheet.getCell(1, 1);
  cell.value = title;
  cell.font = { bold: true, color: { argb: EXCEL.white }, name: "Arial", size: 13 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: EXCEL.navy },
  };
  cell.alignment = { horizontal: "left", vertical: "middle" };
  sheet.getRow(1).height = 24;
};

const styleHeaderRow = (row: ExcelJS.Row) => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: EXCEL.white }, name: "Arial" };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: EXCEL.navy2 },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = excelBorder;
  });
  row.height = 22;
};

const styleInputCell = (cell: ExcelJS.Cell) => {
  cell.font = { color: { argb: "FF0000FF" }, name: "Arial" };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: EXCEL.inputFill },
  };
  cell.border = excelBorder;
};

const styleFormulaCell = (cell: ExcelJS.Cell) => {
  cell.font = { color: { argb: "FF000000" }, name: "Arial" };
  cell.border = excelBorder;
};

const styleLinkedCell = (cell: ExcelJS.Cell) => {
  cell.font = { bold: true, color: { argb: EXCEL.linkGreen }, name: "Arial" };
  cell.border = excelBorder;
};

const withComment = (cell: ExcelJS.Cell, source: string) => {
  cell.note = {
    texts: [{ text: `Source: ${source}` }],
  };
};

const styleBodyRows = (sheet: ExcelJS.Worksheet, startRow = 4) => {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return;
    row.eachCell((cell) => {
      cell.font = { ...(cell.font ?? {}), name: "Arial", size: 10 };
      cell.border = excelBorder;
      cell.alignment = {
        horizontal: typeof cell.value === "number" ? "right" : "left",
        vertical: "middle",
        wrapText: true,
      };
    });
    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        if (cell.fill && Object.keys(cell.fill).length > 0) return;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" },
        };
      });
    }
  });
};

const addAutoFilter = (sheet: ExcelJS.Worksheet, columns: number) => {
  if (sheet.rowCount >= 3) {
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: columns },
    };
  }
};

const workbookMedian = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const workbookStats = (content: EquityProjectGeneratedContent) => {
  const forecast = content.forecast.slice(0, 5);
  const first = forecast[0];
  const last = forecast.at(-1) ?? first;
  const years = Math.max(forecast.length - 1, 1);
  const revenueCagr =
    first && last && first.revenue > 0
      ? Math.pow(last.revenue / first.revenue, 1 / years) - 1
      : 0;
  const base =
    content.sensitivity.find((row) => row.case.toLowerCase().includes("base")) ??
    content.sensitivity[Math.floor(content.sensitivity.length / 2)] ??
    content.sensitivity[0];
  const bear =
    content.sensitivity.find((row) => row.case.toLowerCase().includes("bear")) ??
    content.sensitivity[0];
  const bull =
    content.sensitivity.find((row) => row.case.toLowerCase().includes("bull")) ??
    content.sensitivity.at(-1);

  return {
    baseValue: base?.impliedValue ?? 0,
    bearValue: bear?.impliedValue ?? 0,
    bullValue: bull?.impliedValue ?? 0,
    endingRevenue: last?.revenue ?? 0,
    fcfMargin: last?.freeCashFlowMargin ?? 0,
    medianEvRevenue: workbookMedian(content.comps.map((row) => row.evRevenue)),
    medianPe: workbookMedian(content.comps.map((row) => row.pe)),
    revenueCagr,
  };
};

const parseModelNumber = (value: string) => {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : value;
};

const addSummarySheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const stats = workbookStats(content);
  const forecastYears = content.forecast.slice(0, 6);
  const modelColumns = forecastYears.map((_, index) => excelColumnName(index + 2));
  const modelLastColumn = excelColumnName(forecastYears.length + 1);
  const sensitivityRowFor = (needle: string, fallbackIndex: number) => {
    const index = content.sensitivity.findIndex((row) =>
      row.case.toLowerCase().includes(needle),
    );
    return (index >= 0 ? index : fallbackIndex) + 4;
  };
  const baseRow = sensitivityRowFor(
    "base",
    Math.floor(content.sensitivity.length / 2),
  );
  const compsEndRow = Math.max(content.comps.length + 3, 4);
  const summaryComps = content.comps.slice(0, 5);
  const sheet = workbook.addWorksheet("Summary");
  applySheetChrome(sheet, EXCEL.gold);
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  sheet.columns = [
    { key: "a", width: 18 },
    { key: "b", width: 16 },
    { key: "c", width: 16 },
    { key: "d", width: 16 },
    { key: "e", width: 16 },
    { key: "f", width: 16 },
    { key: "g", width: 16 },
    { key: "h", width: 16 },
  ];
  setTitle(sheet, `${project.ticker} Operating Model`, 8);
  sheet.addRow([]);
  sheet.addRow([
    "Ticker",
    project.ticker,
    "Recommendation",
    formatThesisRecommendation(project.recommendation),
    "Base $/sh",
    { formula: `'Sensitivity'!D${baseRow}`, result: stats.baseValue },
    "Date",
    new Date(project.updatedAt),
  ]);
  withComment(sheet.getCell("D3"), `User rationale: ${project.rationale}`);
  sheet.getCell("H3").numFmt = "mmm d, yyyy";
  sheet.addRow([]);

  sheet.addRow(["Scenario", "Revenue Growth", "Operating Margin", "Implied $/sh", "Vs. Base", "", "", ""]);
  styleHeaderRow(sheet.getRow(5));
  content.sensitivity.forEach((row, index) => {
    const sourceRow = index + 4;
    const outputRow = sheet.rowCount + 1;
    sheet.addRow([
      { formula: `'Sensitivity'!A${sourceRow}`, result: row.case },
      { formula: `'Sensitivity'!B${sourceRow}`, result: asPercent(row.revenueGrowth) },
      { formula: `'Sensitivity'!C${sourceRow}`, result: asPercent(row.operatingMargin) },
      { formula: `'Sensitivity'!D${sourceRow}`, result: row.impliedValue },
      {
        formula: `IF($D$${outputRow}=0,0,$D${outputRow}/'Sensitivity'!D${baseRow}-1)`,
        result: stats.baseValue ? row.impliedValue / stats.baseValue - 1 : 0,
      },
      "",
      "",
      "",
    ]);
  });

  sheet.addRow([]);
  sheet.addRow(["Core Drivers", ...forecastYears.map((year) => year.year), "", ""]);
  styleHeaderRow(sheet.getRow(sheet.rowCount));
  [
    { label: "Revenue ($mm)", modelRow: 4, format: moneyFormat },
    { label: "Revenue Growth", modelRow: 5, format: percentFormat },
    { label: "Gross Margin", modelRow: 6, format: percentFormat },
    { label: "Operating Margin", modelRow: 8, format: percentFormat },
    { label: "FCF Margin", modelRow: 10, format: percentFormat },
    { label: "FCF ($mm)", modelRow: 11, format: moneyFormat },
  ].forEach((driver) => {
    sheet.addRow([
      driver.label,
      ...forecastYears.map((year, index) => ({
        formula: `'Operating Model'!${modelColumns[index]}${driver.modelRow}`,
        result:
          driver.modelRow === 4
            ? year.revenue
            : driver.modelRow === 5
              ? asPercent(year.revenueGrowth)
              : driver.modelRow === 6
                ? asPercent(year.grossMargin)
                : driver.modelRow === 8
                  ? asPercent(year.operatingMargin)
                  : driver.modelRow === 10
                    ? asPercent(year.freeCashFlowMargin)
                    : year.revenue * asPercent(year.freeCashFlowMargin),
      })),
      "",
    ]);
    const row = sheet.getRow(sheet.rowCount);
    row.eachCell((cell, columnNumber) => {
      if (columnNumber > 1 && columnNumber <= forecastYears.length + 1) {
        cell.numFmt = driver.format;
        styleLinkedCell(cell);
      }
    });
  });

  sheet.addRow([]);
  sheet.addRow(["Comps Snapshot", "EV/Revenue", "EV/EBITDA", "P/E", "P/E vs. Median", "", "", ""]);
  const compsHeaderRow = sheet.rowCount;
  styleHeaderRow(sheet.getRow(compsHeaderRow));
  summaryComps.forEach((row, index) => {
    const sourceRow = index + 4;
    sheet.addRow([
      { formula: `Comps!A${sourceRow}`, result: row.ticker },
      { formula: `Comps!C${sourceRow}`, result: row.evRevenue },
      { formula: `Comps!D${sourceRow}`, result: row.evEbitda },
      { formula: `Comps!E${sourceRow}`, result: row.pe },
      {
        formula: `IF(MEDIAN(Comps!E4:E${compsEndRow})=0,0,D${sheet.rowCount + 1}/MEDIAN(Comps!E4:E${compsEndRow})-1)`,
        result: stats.medianPe ? row.pe / stats.medianPe - 1 : 0,
      },
      "",
      "",
      "",
    ]);
  });

  sheet.addRow([]);
  sheet.addRow([
    "Median EV/Revenue",
    { formula: `MEDIAN(Comps!C4:C${compsEndRow})`, result: stats.medianEvRevenue },
    "Median P/E",
    { formula: `MEDIAN(Comps!E4:E${compsEndRow})`, result: stats.medianPe },
    "FY4 Revenue",
    { formula: `'Operating Model'!${modelLastColumn}4`, result: stats.endingRevenue },
    "FY4 FCF Margin",
    { formula: `'Operating Model'!${modelLastColumn}10`, result: stats.fcfMargin },
  ]);

  sheet.getCell("B3").font = { bold: true, color: { argb: EXCEL.navy }, name: "Arial" };
  sheet.getCell("D3").font = { bold: true, color: { argb: EXCEL.navy }, name: "Arial" };
  sheet.getCell("F3").numFmt = moneyFormat;
  sheet.getCell("F3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1F8" } };
  styleLinkedCell(sheet.getCell("F3"));
  sheet.getCell("H3").font = { color: { argb: EXCEL.steel }, name: "Arial" };
  for (let rowNumber = 6; rowNumber <= 5 + content.sensitivity.length; rowNumber += 1) {
    sheet.getCell(rowNumber, 2).numFmt = percentFormat;
    sheet.getCell(rowNumber, 3).numFmt = percentFormat;
    sheet.getCell(rowNumber, 4).numFmt = moneyFormat;
    sheet.getCell(rowNumber, 5).numFmt = percentFormat;
    for (let column = 1; column <= 5; column += 1) {
      styleLinkedCell(sheet.getCell(rowNumber, column));
    }
  }
  for (let rowNumber = compsHeaderRow + 1; rowNumber <= compsHeaderRow + summaryComps.length; rowNumber += 1) {
    sheet.getCell(rowNumber, 2).numFmt = multipleFormat;
    sheet.getCell(rowNumber, 3).numFmt = multipleFormat;
    sheet.getCell(rowNumber, 4).numFmt = multipleFormat;
    sheet.getCell(rowNumber, 5).numFmt = percentFormat;
    for (let column = 1; column <= 5; column += 1) {
      styleLinkedCell(sheet.getCell(rowNumber, column));
    }
  }
  const medianRow = sheet.rowCount;
  sheet.getCell(medianRow, 2).numFmt = multipleFormat;
  sheet.getCell(medianRow, 4).numFmt = multipleFormat;
  sheet.getCell(medianRow, 6).numFmt = moneyFormat;
  sheet.getCell(medianRow, 8).numFmt = percentFormat;
  [2, 4, 6, 8].forEach((column) => styleLinkedCell(sheet.getCell(medianRow, column)));
  styleBodyRows(sheet, 3);
};

const addAssumptionsSheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const sheet = workbook.addWorksheet("Inputs");
  applySheetChrome(sheet, EXCEL.gold);
  sheet.columns = [
    { key: "label", width: 34 },
    { key: "value", width: 38 },
    { key: "source", width: 58 },
  ];
  setTitle(sheet, `${project.ticker} Inputs`, 3);
  sheet.addRow([]);
  sheet.addRow(["Input", "Value", "Source"]);
  styleHeaderRow(sheet.getRow(3));
  for (const assumption of content.modelAssumptions) {
    sheet.addRow([assumption.label, assumption.value, assumption.source]);
  }
  sheet.getColumn(3).hidden = true;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;
    styleInputCell(row.getCell(2));
    withComment(row.getCell(2), String(row.getCell(3).value ?? "Source"));
  });
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, 3);
};

const addEvidenceSheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const sheet = workbook.addWorksheet("Source Notes");
  sheet.state = "hidden";
  applySheetChrome(sheet, EXCEL.navy2);
  sheet.columns = [
    { key: "label", width: 26 },
    { key: "value", width: 48 },
    { key: "source", width: 34 },
    { key: "implication", width: 56 },
  ];
  setTitle(sheet, `${project.ticker} Source Notes`, 4);
  sheet.addRow([]);
  sheet.addRow(["Evidence", "Value", "Source", "Implication"]);
  styleHeaderRow(sheet.getRow(3));
  content.evidence.forEach((row) =>
    sheet.addRow([row.label, row.value, row.source, row.implication]),
  );
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 3) row.height = 42;
  });
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, 4);
};

const addOperatingModelSheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  forecast: EquityForecastRow[],
) => {
  const sheet = workbook.addWorksheet("Operating Model");
  applySheetChrome(sheet, EXCEL.navy);
  const years = forecast.slice(0, 6);
  sheet.columns = [
    { key: "metric", width: 28 },
    ...years.map((year) => ({ key: year.year, width: 14 })),
  ];
  setTitle(sheet, `${project.ticker} Operating Model`, years.length + 1);
  sheet.addRow([]);
  sheet.addRow(["$mm except per-share data", ...years.map((year) => year.year)]);
  styleHeaderRow(sheet.getRow(3));

  const rowDefinitions = [
    "Revenue ($mm)",
    "Revenue Growth",
    "Gross Margin",
    "Gross Profit ($mm)",
    "Operating Margin",
    "Operating Income ($mm)",
    "FCF Margin",
    "Free Cash Flow ($mm)",
  ];
  rowDefinitions.forEach((label) => sheet.addRow([label]));

  years.forEach((year, index) => {
    const column = index + 2;
    sheet.getCell(4, column).value =
      index === 0
        ? year.revenue
        : { formula: `${sheet.getCell(4, column - 1).address}*(1+${sheet.getCell(5, column).address})` };
    sheet.getCell(5, column).value = asPercent(year.revenueGrowth);
    sheet.getCell(6, column).value = asPercent(year.grossMargin);
    sheet.getCell(7, column).value = {
      formula: `${sheet.getCell(4, column).address}*${sheet.getCell(6, column).address}`,
    };
    sheet.getCell(8, column).value = asPercent(year.operatingMargin);
    sheet.getCell(9, column).value = {
      formula: `${sheet.getCell(4, column).address}*${sheet.getCell(8, column).address}`,
    };
    sheet.getCell(10, column).value = asPercent(year.freeCashFlowMargin);
    sheet.getCell(11, column).value = {
      formula: `${sheet.getCell(4, column).address}*${sheet.getCell(10, column).address}`,
    };
  });

  [4, 7, 9, 11].forEach((rowNumber) => {
    sheet.getRow(rowNumber).numFmt = moneyFormat;
  });
  [5, 6, 8, 10].forEach((rowNumber) => {
    sheet.getRow(rowNumber).numFmt = percentFormat;
  });
  [5, 6, 8, 10].forEach((rowNumber) => {
    for (let column = 2; column <= years.length + 1; column += 1) {
      styleInputCell(sheet.getCell(rowNumber, column));
      withComment(
        sheet.getCell(rowNumber, column),
        column === 2
          ? "Reported baseline from source-backed research context."
          : "Forward estimate from user rationale and reported baseline.",
      );
    }
  });
  for (let column = 2; column <= years.length + 1; column += 1) {
    const cell = sheet.getCell(4, column);
    if (column === 2) {
      styleInputCell(cell);
      withComment(cell, "Reported revenue baseline from source-backed research context.");
    } else {
      styleFormulaCell(cell);
    }
  }
  [7, 9, 11].forEach((rowNumber) => {
    for (let column = 2; column <= years.length + 1; column += 1) {
      styleFormulaCell(sheet.getCell(rowNumber, column));
    }
  });
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, years.length + 1);
};

const addValuationSheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  valuation: EquityValuationOutput[],
) => {
  const sheet = workbook.addWorksheet("Valuation");
  applySheetChrome(sheet, EXCEL.navy);
  sheet.columns = [
    { key: "metric", width: 30 },
    { key: "value", width: 18 },
    { key: "source", width: 44 },
  ];
  setTitle(sheet, `${project.ticker} Valuation Output`, 3);
  sheet.addRow([]);
  sheet.addRow(["Output", "$ / share", "Source"]);
  styleHeaderRow(sheet.getRow(3));
  valuation.forEach((row) => {
    sheet.addRow([row.metric, parseModelNumber(row.value), row.source]);
    withComment(sheet.getRow(sheet.rowCount).getCell(2), row.source);
  });
  sheet.getColumn(2).numFmt = moneyFormat;
  sheet.getColumn(3).hidden = true;
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, 3);
};

const addSensitivitySheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  sensitivity: EquitySensitivityRow[],
) => {
  const sheet = workbook.addWorksheet("Sensitivity");
  applySheetChrome(sheet, EXCEL.navy);
  sheet.columns = [
    { key: "case", width: 22 },
    { key: "growth", width: 18 },
    { key: "margin", width: 20 },
    { key: "value", width: 18 },
  ];
  setTitle(sheet, `${project.ticker} Sensitivity`, 4);
  sheet.addRow([]);
  sheet.addRow(["Case", "Revenue Growth", "Operating Margin", "Implied Value"]);
  styleHeaderRow(sheet.getRow(3));
  sensitivity.forEach((row) => {
    sheet.addRow([
      row.case,
      asPercent(row.revenueGrowth),
      asPercent(row.operatingMargin),
      row.impliedValue,
    ]);
  });
  sheet.getColumn(2).numFmt = percentFormat;
  sheet.getColumn(3).numFmt = percentFormat;
  sheet.getColumn(4).numFmt = moneyFormat;
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, 4);
};

const addCompsSheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  comps: EquityCompsRow[],
) => {
  const sheet = workbook.addWorksheet("Comps");
  applySheetChrome(sheet, EXCEL.navy2);
  sheet.columns = [
    { key: "ticker", width: 12 },
    { key: "company", width: 28 },
    { key: "evRevenue", width: 14 },
    { key: "evEbitda", width: 14 },
    { key: "pe", width: 12 },
    { key: "rationale", width: 44 },
  ];
  setTitle(sheet, `${project.ticker} Comparable Companies`, 6);
  sheet.addRow([]);
  sheet.addRow(["Ticker", "Company", "EV/Revenue", "EV/EBITDA", "P/E", "Rationale"]);
  styleHeaderRow(sheet.getRow(3));
  comps.forEach((row) =>
    sheet.addRow([
      row.ticker,
      row.company,
      row.evRevenue,
      row.evEbitda,
      row.pe,
      row.rationale,
    ]),
  );
  comps.forEach((row, index) => {
    withComment(sheet.getCell(index + 4, 1), row.rationale);
  });
  sheet.getColumn(3).numFmt = multipleFormat;
  sheet.getColumn(4).numFmt = multipleFormat;
  sheet.getColumn(5).numFmt = multipleFormat;
  sheet.getColumn(6).hidden = true;
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, 6);
};

const addRiskSheet = (
  workbook: ExcelJS.Workbook,
  project: EquityProject,
  riskTriggers: EquityRiskTrigger[],
) => {
  const sheet = workbook.addWorksheet("Risk Triggers");
  applySheetChrome(sheet, EXCEL.red);
  sheet.columns = [
    { key: "trigger", width: 32 },
    { key: "threshold", width: 36 },
    { key: "action", width: 44 },
  ];
  setTitle(sheet, `${project.ticker} Risk / Falsification`, 3);
  sheet.addRow([]);
  sheet.addRow(["Trigger", "Threshold", "Action"]);
  styleHeaderRow(sheet.getRow(3));
  riskTriggers.forEach((row) =>
    sheet.addRow([row.trigger, row.threshold, row.action]),
  );
  styleBodyRows(sheet, 4);
  addAutoFilter(sheet, 3);
};

export const buildOperatingModelXlsx = async (
  project: EquityProject,
): Promise<Buffer> => {
  const content = requireGeneratedContent(project);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Citadail";
  workbook.company = "Citadail";
  workbook.subject = `${project.ticker} operating model`;
  workbook.title = `${project.ticker} Operating Model`;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  addSummarySheet(workbook, project, content);
  addAssumptionsSheet(workbook, project, content);
  addOperatingModelSheet(workbook, project, content.forecast);
  addSensitivitySheet(workbook, project, content.sensitivity);
  addValuationSheet(workbook, project, content.valuation);
  addCompsSheet(workbook, project, content.comps);
  addRiskSheet(workbook, project, content.riskTriggers);
  addEvidenceSheet(workbook, project, content);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
};

const DECK = {
  bg: "F7F8FA",
  ink: "101820",
  navy: "061B33",
  navy2: "0D2B4C",
  steel: "5F738A",
  slate: "E7EBF0",
  line: "C7D0DA",
  panel: "FFFFFF",
  accent: "6F8DA8",
  gold: "B08D57",
  red: "A94442",
};

const FONT = {
  display: "Arial",
  body: "Arial",
  mono: "Arial",
};

const deckPercent = (value: number) =>
  `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`;

const deckMoney = (value: number) =>
  value >= 1000 ? `$${(value / 1000).toFixed(1)}B` : `$${value.toFixed(0)}M`;

const cleanDeckCopy = (text: string, fallback = "") => {
  const cleaned = stripNonSubstantiveLead(text).replace(/\s+/g, " ").trim();
  return cleaned || fallback;
};

const shorten = (text: string, max = 150) => {
  const cleaned = cleanDeckCopy(text);
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trim()}...` : cleaned;
};

const sourceBackedRationale = (
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const rationale = normalizeAnalystRationale(project.rationale);
  if (rationale) return `Analyst rationale: ${shorten(rationale, 112)}`;

  const evidence = content.evidence[0];
  if (evidence) {
    return `Research basis: ${shorten(`${evidence.source}: ${evidence.implication}`, 126)}`;
  }

  return "Research basis: source-backed evidence pack and operating model outputs.";
};

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const modelStats = (content: EquityProjectGeneratedContent) => {
  const forecast = content.forecast.slice(0, 5);
  const first = forecast[0];
  const last = forecast.at(-1) ?? first;
  const years = Math.max(forecast.length - 1, 1);
  const revenueCagr =
    first && last && first.revenue > 0
      ? Math.pow(last.revenue / first.revenue, 1 / years) - 1
      : 0;
  const base =
    content.sensitivity.find((row) => row.case.toLowerCase().includes("base")) ??
    content.sensitivity[Math.floor(content.sensitivity.length / 2)] ??
    content.sensitivity[0];
  const bear =
    content.sensitivity.find((row) => row.case.toLowerCase().includes("bear")) ??
    content.sensitivity[0];
  const bull =
    content.sensitivity.find((row) => row.case.toLowerCase().includes("bull")) ??
    content.sensitivity.at(-1);

  return {
    baseValue: base?.impliedValue ?? 0,
    bearValue: bear?.impliedValue ?? 0,
    bullValue: bull?.impliedValue ?? 0,
    endingRevenue: last?.revenue ?? 0,
    fcfMargin: last?.freeCashFlowMargin ?? 0,
    medianEvRevenue: median(content.comps.map((row) => row.evRevenue)),
    medianPe: median(content.comps.map((row) => row.pe)),
    revenueCagr,
  };
};

const addWordmark = (
  slide: pptxgen.Slide,
  color = DECK.ink,
  x = 0.55,
  y = 0.36,
) => {
  slide.addText("CITADAIL", {
    x,
    y,
    w: 1.08,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 7.5,
    bold: true,
    color,
    margin: 0,
    fit: "shrink",
  });
};

const slideFooter = (slide: pptxgen.Slide, label: string) => {
  slide.addShape("line", {
    x: 0.55,
    y: 6.84,
    w: 12.25,
    h: 0,
    line: { color: DECK.line, width: 0.45 },
  });
  slide.addText("INTERNAL RESEARCH PACKAGE", {
    x: 0.55,
    y: 7.02,
    w: 2.7,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 7,
    bold: true,
    color: DECK.steel,
    margin: 0,
  });
  slide.addText(label, {
    x: 10.4,
    y: 7.02,
    w: 2.4,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 7,
    color: DECK.steel,
    align: "right",
    margin: 0,
  });
};

const addSectionTitle = (
  slide: pptxgen.Slide,
  eyebrow: string,
  title: string,
  subtitle?: string,
) => {
  slide.background = { color: DECK.bg };
  addWordmark(slide);
  slide.addText(eyebrow.toUpperCase(), {
    x: 0.55,
    y: 0.72,
    w: 4.5,
    h: 0.2,
    fontFace: FONT.body,
    fontSize: 7.5,
    bold: true,
    color: DECK.steel,
    margin: 0,
  });
  slide.addText(title, {
    x: 0.55,
    y: 0.96,
    w: 8.7,
    h: 0.44,
    fontFace: FONT.display,
    fontSize: 21,
    bold: true,
    color: DECK.navy,
    margin: 0,
    fit: "shrink",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.55,
      y: 1.43,
      w: 9.2,
      h: 0.28,
      fontFace: FONT.body,
      fontSize: 8.5,
      color: DECK.steel,
      margin: 0,
      fit: "shrink",
    });
  }
};

const addPanel = (
  slide: pptxgen.Slide,
  {
    h,
    title,
    w,
    x,
    y,
  }: {
    h: number;
    title?: string;
    w: number;
    x: number;
    y: number;
  },
) => {
  slide.addShape("rect", {
    x,
    y,
    w,
    h,
    fill: { color: DECK.panel },
    line: { color: DECK.line, width: 0.5 },
  });
  if (title) {
    slide.addText(title.toUpperCase(), {
      x: x + 0.18,
      y: y + 0.16,
      w: w - 0.36,
      h: 0.16,
      fontFace: FONT.body,
      fontSize: 6.8,
      bold: true,
      color: DECK.steel,
      margin: 0,
      fit: "shrink",
    });
  }
};

const addBodyText = (
  slide: pptxgen.Slide,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color = DECK.ink,
  fontSize = 8.7,
  maxChars = 160,
) => {
  slide.addText(shorten(text, maxChars), {
    x,
    y,
    w,
    h,
    fontFace: FONT.body,
    fontSize,
    color,
    breakLine: false,
    fit: "shrink",
    margin: 0,
    valign: "top",
  });
};

const addStat = (
  slide: pptxgen.Slide,
  label: string,
  value: string,
  x: number,
  y: number,
  w = 2.65,
) => {
  slide.addText(value, {
    x,
    y,
    w,
    h: 0.34,
    fontFace: FONT.display,
    fontSize: 17,
    bold: true,
    color: DECK.navy,
    margin: 0,
    fit: "shrink",
  });
  slide.addText(label.toUpperCase(), {
    x,
    y: y + 0.42,
    w,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 6.8,
    bold: true,
    color: DECK.steel,
    margin: 0,
    fit: "shrink",
  });
};

const addRevenueBars = (
  slide: pptxgen.Slide,
  forecast: EquityForecastRow[],
  x: number,
  y: number,
  w: number,
  h: number,
) => {
  const rows = forecast.slice(0, 5);
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);
  const gap = 0.16;
  const barW = (w - gap * (rows.length - 1)) / rows.length;
  rows.forEach((row, index) => {
    const barH = Math.max(0.14, (row.revenue / maxRevenue) * (h - 0.45));
    const left = x + index * (barW + gap);
    slide.addShape("rect", {
      x: left,
      y: y + h - barH - 0.28,
      w: barW,
      h: barH,
      fill: { color: index === rows.length - 1 ? DECK.navy2 : DECK.steel },
      line: { color: index === rows.length - 1 ? DECK.navy2 : DECK.steel },
    });
    slide.addText(row.year, {
      x: left,
      y: y + h - 0.18,
      w: barW,
      h: 0.16,
      fontFace: FONT.body,
      fontSize: 6.2,
      color: DECK.steel,
      align: "center",
      margin: 0,
    });
  });
};

const addCoverSlide = (
  pptx: pptxgen,
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const stats = modelStats(content);
  const slide = pptx.addSlide();
  slide.background = { color: DECK.navy };
  addWordmark(slide, "FFFFFF", 0.68, 0.5);
  slide.addShape("rect", {
    x: 8.62,
    y: 0,
    w: 4.72,
    h: 7.5,
    fill: { color: "071426" },
    line: { color: "071426" },
  });
  slide.addText("EQUITY THESIS PACKAGE", {
    x: 0.68,
    y: 0.94,
    w: 3.25,
    h: 0.18,
    fontFace: FONT.body,
    fontSize: 7.2,
    bold: true,
    color: "B9C7D6",
    margin: 0,
  });
  slide.addText(project.ticker, {
    x: 0.68,
    y: 1.48,
    w: 4.1,
    h: 0.82,
    fontFace: FONT.display,
    fontSize: 46,
    bold: true,
    color: "FFFFFF",
    margin: 0,
  });
  slide.addText(formatThesisRecommendation(project.recommendation), {
    x: 0.74,
    y: 2.42,
    w: 2.35,
    h: 0.34,
    fontFace: FONT.body,
    fontSize: 9.8,
    bold: true,
    color: DECK.navy,
    fill: { color: "FFFFFF" },
    align: "center",
    margin: 0.02,
  });
  slide.addText(shorten(content.variantPerception, 118), {
    x: 0.68,
    y: 3.18,
    w: 6.8,
    h: 0.98,
    fontFace: FONT.display,
    fontSize: 15.8,
    bold: true,
    color: "FFFFFF",
    fit: "shrink",
    margin: 0,
  });
  addBodyText(
    slide,
    sourceBackedRationale(project, content),
    0.72,
    4.42,
    6.55,
    0.55,
    "DDE6EF",
    8.4,
    132,
  );
  slide.addText("MODEL READ-THROUGH", {
    x: 9.08,
    y: 1.08,
    w: 2.4,
    h: 0.16,
    fontFace: FONT.body,
    fontSize: 7,
    bold: true,
    color: "B9C7D6",
    margin: 0,
  });
  [
    ["Base value", `$${stats.baseValue.toFixed(0)}/sh`],
    ["Revenue CAGR", deckPercent(stats.revenueCagr)],
    ["FY4 FCF margin", deckPercent(stats.fcfMargin)],
    ["Median P/E", `${stats.medianPe.toFixed(1)}x`],
  ].forEach(([label, value], index) => {
    const y = 1.62 + index * 1.0;
    slide.addText(value, {
      x: 9.08,
      y,
      w: 2.95,
      h: 0.32,
      fontFace: FONT.display,
      fontSize: 18,
      bold: true,
      color: "FFFFFF",
      margin: 0,
      fit: "shrink",
    });
    slide.addText(label.toUpperCase(), {
      x: 9.08,
      y: y + 0.42,
      w: 2.95,
      h: 0.14,
      fontFace: FONT.body,
      fontSize: 6.5,
      bold: true,
      color: "B9C7D6",
      margin: 0,
    });
  });
  slide.addText("No live execution. Paper trade package only.", {
    x: 9.08,
    y: 6.22,
    w: 3.0,
    h: 0.22,
    fontFace: FONT.body,
    fontSize: 7.6,
    color: "B9C7D6",
    margin: 0,
  });
  slide.addNotes("Open with recommendation, model output, and immediate falsification.");
};

const addThesisSlide = (
  pptx: pptxgen,
  content: EquityProjectGeneratedContent,
) => {
  const slide = pptx.addSlide();
  addSectionTitle(slide, "Thesis note", "The argument", "What changed, why now, and how the scenarios frame the pitch.");
  addPanel(slide, { x: 0.72, y: 2.0, w: 4.55, h: 3.95, title: "House view" });
  slide.addText(shorten(content.recommendationSummary, 118), {
    x: 1.0,
    y: 2.48,
    w: 3.96,
    h: 1.08,
    fontFace: FONT.display,
    fontSize: 13.2,
    bold: true,
    color: DECK.navy,
    fit: "shrink",
    margin: 0,
  });
  addBodyText(slide, content.companyOverview, 1.0, 3.9, 3.95, 0.92, DECK.ink, 8.6, 145);
  addPanel(slide, { x: 5.62, y: 2.0, w: 3.05, h: 1.24, title: "Why now" });
  addBodyText(slide, content.whyNow, 5.86, 2.48, 2.58, 0.55, DECK.ink, 8.4, 105);
  addPanel(slide, { x: 9.02, y: 2.0, w: 3.05, h: 1.24, title: "What changed" });
  addBodyText(slide, content.whatChanged, 9.26, 2.48, 2.58, 0.55, DECK.ink, 8.4, 105);
  [
    ["Bull", content.bullCase, DECK.navy2],
    ["Base", content.baseCase, DECK.gold],
    ["Bear", content.bearCase, DECK.red],
  ].forEach(([label, body, color], index) => {
    const x = 5.62 + index * 2.18;
    addPanel(slide, { x, y: 3.82, w: 1.92, h: 2.13, title: String(label) });
    slide.addShape("rect", {
      x,
      y: 3.82,
      w: 1.92,
      h: 0.05,
      fill: { color: String(color) },
      line: { color: String(color) },
    });
    addBodyText(slide, String(body), x + 0.18, 4.34, 1.56, 1.02, DECK.ink, 7.6, 95);
  });
  slideFooter(slide, "Thesis");
  slide.addNotes("Keep scenario framing short and tied to the memo.");
};

const addVariantSlide = (
  pptx: pptxgen,
  content: EquityProjectGeneratedContent,
) => {
  const slide = pptx.addSlide();
  addSectionTitle(slide, "Variant perception", "Where the view must be sharper", "Consensus, our variant, and the evidence that proves or breaks the view.");
  addPanel(slide, { x: 0.72, y: 2.05, w: 3.45, h: 2.25, title: "Consensus likely believes" });
  addBodyText(slide, content.marketMissing, 1.0, 2.55, 2.9, 1.18, DECK.ink, 8.5, 125);
  addPanel(slide, { x: 4.95, y: 2.05, w: 3.45, h: 2.25, title: "We believe instead" });
  addBodyText(slide, content.variantPerception, 5.23, 2.55, 2.9, 1.18, DECK.ink, 8.5, 125);
  addPanel(slide, { x: 9.18, y: 2.05, w: 3.0, h: 2.25, title: "Evidence" });
  addBodyText(slide, content.evidence.slice(0, 3).map((item) => `${item.label}: ${item.value}`).join("\n"), 9.46, 2.55, 2.44, 1.18, DECK.ink, 8.0, 135);
  addPanel(slide, { x: 0.72, y: 4.85, w: 11.46, h: 0.85, title: "Edge statement" });
  addBodyText(slide, content.recommendationSummary, 1.0, 5.24, 10.9, 0.34, DECK.ink, 8.8, 170);
  slideFooter(slide, "Edge");
  slide.addNotes("Force the PM conversation to consensus, variant, and proof.");
};

const addModelSlide = (
  pptx: pptxgen,
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const stats = modelStats(content);
  const slide = pptx.addSlide();
  addSectionTitle(slide, "Model", "The numbers behind the story", "All figures are derived from the same forecast, sensitivity, comps, and valuation payload used for the XLSX model.");
  addPanel(slide, { x: 0.72, y: 1.95, w: 11.45, h: 1.05 });
  addStat(slide, "FY4 Revenue", deckMoney(stats.endingRevenue), 1.0, 2.18);
  addStat(slide, "Revenue CAGR", deckPercent(stats.revenueCagr), 3.85, 2.18);
  addStat(slide, "FY4 FCF Margin", deckPercent(stats.fcfMargin), 6.7, 2.18);
  addStat(slide, "Base Value", `$${stats.baseValue.toFixed(0)}/sh`, 9.55, 2.18);
  addPanel(slide, { x: 0.72, y: 3.45, w: 5.58, h: 2.18, title: "Operating model output" });
  addRevenueBars(slide, content.forecast, 1.05, 4.05, 4.75, 1.25);
  addPanel(slide, { x: 6.62, y: 3.45, w: 5.55, h: 2.18, title: "Sensitivity range" });
  [
    ["Bear", `$${stats.bearValue.toFixed(0)}`],
    ["Base", `$${stats.baseValue.toFixed(0)}`],
    ["Bull", `$${stats.bullValue.toFixed(0)}`],
  ].forEach(([label, value], index) => {
    const x = 6.95 + index * 1.66;
    slide.addText(value, {
      x,
      y: 4.12,
      w: 1.26,
      h: 0.3,
      fontFace: FONT.display,
      fontSize: 16,
      bold: true,
      color: index === 1 ? DECK.navy : DECK.steel,
      align: "center",
      margin: 0,
    });
    slide.addText(String(label).toUpperCase(), {
      x,
      y: 4.55,
      w: 1.26,
      h: 0.14,
      fontFace: FONT.body,
      fontSize: 6.4,
      bold: true,
      color: DECK.steel,
      align: "center",
      margin: 0,
    });
  });
  addBodyText(slide, `Model dependency: ${content.baseCase}`, 6.96, 5.1, 4.6, 0.26, DECK.steel, 7.4);
  slideFooter(slide, project.ticker);
  slide.addNotes("Model figures match the workbook source payload.");
};

const addCompsSlide = (
  pptx: pptxgen,
  project: EquityProject,
  content: EquityProjectGeneratedContent,
) => {
  const stats = modelStats(content);
  const slide = pptx.addSlide();
  addSectionTitle(slide, "Comps", "Relative valuation context", "Peer multiples and medians are sourced from the same comps sheet payload.");
  const rows = [
    ["Ticker", "Peer", "EV/Rev", "EV/EBITDA", "P/E"],
    ...content.comps.slice(0, 5).map((row) => [
      row.ticker,
      shorten(row.company, 20),
      `${row.evRevenue.toFixed(1)}x`,
      `${row.evEbitda.toFixed(1)}x`,
      `${row.pe.toFixed(1)}x`,
    ]),
  ];
  slide.addTable(
    rows.map((row) => row.map((text) => ({ text, options: { bold: row[0] === "Ticker" } }))),
    {
      x: 0.72,
      y: 2.0,
      w: 7.2,
      h: 2.45,
      border: { color: DECK.line, pt: 0.5 },
      color: DECK.ink,
      fill: { color: "FFFFFF" },
      fontFace: FONT.body,
      fontSize: 7.8,
      margin: 0.06,
    },
  );
  addPanel(slide, { x: 8.45, y: 2.0, w: 3.6, h: 2.45, title: "Peer median" });
  addStat(slide, "Median EV/Revenue", `${stats.medianEvRevenue.toFixed(1)}x`, 8.75, 2.58, 2.8);
  addStat(slide, "Median P/E", `${stats.medianPe.toFixed(1)}x`, 8.75, 3.62, 2.8);
  addPanel(slide, { x: 0.72, y: 4.95, w: 11.33, h: 0.78, title: "Framing" });
  addBodyText(slide, `${project.ticker} must earn any premium through durable growth, margin stability, and catalyst confirmation. Narrative source documents and reported baselines are cited; forward multiples remain estimates until live comps data is expanded.`, 1.0, 5.34, 10.75, 0.2, DECK.ink, 7.8);
  slideFooter(slide, "Comps");
  slide.addNotes("Anchor valuation context to the same comps payload used in Excel.");
};

const addRiskSlide = (
  pptx: pptxgen,
  content: EquityProjectGeneratedContent,
) => {
  const slide = pptx.addSlide();
  addSectionTitle(slide, "Risk / falsification", "What breaks the thesis", "Early-warning thresholds and explicit actions.");
  content.riskTriggers.slice(0, 3).forEach((trigger, index) => {
    const x = 0.72 + index * 3.85;
    addPanel(slide, { x, y: 2.0, w: 3.35, h: 1.58, title: trigger.trigger });
    addBodyText(slide, `Threshold: ${trigger.threshold}\nAction: ${trigger.action}`, x + 0.22, 2.48, 2.86, 0.58, DECK.ink, 7.2);
  });
  addPanel(slide, { x: 0.72, y: 4.1, w: 5.45, h: 1.48, title: "Invalidation conditions" });
  addBodyText(slide, content.invalidationConditions.slice(0, 4).map((item) => `- ${item}`).join("\n"), 1.0, 4.55, 4.86, 0.62, DECK.ink, 7.2);
  addPanel(slide, { x: 6.72, y: 4.1, w: 5.45, h: 1.48, title: "Downside path" });
  addBodyText(slide, content.bearCase, 7.0, 4.55, 4.86, 0.62, DECK.ink, 7.2);
  slideFooter(slide, "Falsification");
  slide.addNotes("Lead with what changes the mind; avoid fake certainty.");
};

const addTradeProposal = (
  slide: pptxgen.Slide,
  tradeProposal: EquityTradeProposal,
  riskTriggers: EquityRiskTrigger[],
) => {
  const rows = [
    ["Bias", tradeProposal.bias],
    ["Entry zone", tradeProposal.entryZone],
    ["Position size", tradeProposal.positionSize],
    ["Time horizon", tradeProposal.timeHorizon],
    ["Add / trim / exit", tradeProposal.addTrimExit],
  ];
  slide.addTable(rows.map((row) => row.map((text) => ({ text }))), {
    x: 0.72,
    y: 2.0,
    w: 5.8,
    h: 2.2,
    border: { color: DECK.line, pt: 0.5 },
    fontFace: FONT.body,
    fontSize: 8,
    color: DECK.ink,
    fill: { color: "FFFFFF" },
    margin: 0.07,
  });
  addPanel(slide, { x: 6.92, y: 2.0, w: 5.22, h: 2.2, title: "Falsification triggers" });
  addBodyText(slide, riskTriggers.slice(0, 4).map((trigger) => `${trigger.trigger}: ${trigger.threshold}`).join("\n"), 7.2, 2.48, 4.58, 0.82, DECK.ink, 7.2);
  addPanel(slide, { x: 0.72, y: 4.8, w: 5.3, h: 0.9, title: "Desk instruction" });
  addBodyText(slide, "Open as a paper trade only. Monitor thesis health before adding risk. No live execution in v1.", 1.0, 5.18, 4.76, 0.22, DECK.ink, 7.4);
  addPanel(slide, { x: 6.45, y: 4.8, w: 5.3, h: 0.9, title: "Re-check cadence" });
  addBodyText(slide, "Re-check after earnings, guidance, material news, or any trigger breach.", 6.73, 5.18, 4.76, 0.22, DECK.ink, 7.4);
};

export const buildPmDeckPptx = async (
  project: EquityProject,
): Promise<Buffer> => {
  const content = requireGeneratedContent(project);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Citadail";
  pptx.company = "Citadail";
  pptx.subject = `${project.ticker} PM pitch deck`;
  pptx.title = `${project.ticker} PM Pitch Deck`;
  pptx.theme = {
    headFontFace: FONT.display,
    bodyFontFace: FONT.body,
  };
  addCoverSlide(pptx, project, content);
  addThesisSlide(pptx, content);
  addVariantSlide(pptx, content);
  addModelSlide(pptx, project, content);
  addCompsSlide(pptx, project, content);
  addRiskSlide(pptx, content);

  const tradeSlide = pptx.addSlide();
  addSectionTitle(tradeSlide, "Trade proposal", "Research to desk action", "Paper-trade instructions and monitoring logic.");
  addTradeProposal(tradeSlide, content.tradeProposal, content.riskTriggers);
  slideFooter(tradeSlide, "Desk");

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
};

const requireGeneratedContent = (
  project: EquityProject,
): EquityProjectGeneratedContent => {
  if (!project.generatedContent) {
    throw new Error("Project has no generated content.");
  }
  return project.generatedContent;
};

export const buildEquityExport = async ({
  artifactType,
  project,
}: {
  artifactType: EquityProjectArtifactType;
  project: EquityProject;
}): Promise<EquityExportResult> => {
  const artifact = project.artifacts[artifactType];
  const filename =
    artifact.filename ??
    `${sanitizeFilenamePart(project.ticker)}_${artifact.title}.${artifactType.split("_").at(-1)}`;
  const buffer =
    artifactType === "memo_docx"
      ? await buildMemoDocx(project)
      : artifactType === "operating_model_xlsx"
        ? await buildOperatingModelXlsx(project)
        : await buildPmDeckPptx(project);

  return {
    buffer,
    filename,
    mimeType: MIME_TYPES[artifactType],
  };
};

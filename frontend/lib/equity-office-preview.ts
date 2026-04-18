import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import ExcelJS from "exceljs";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

import { buildEquityExport } from "@/lib/equity-office-export";
import type {
  EquityDeckOfficePreview,
  EquityMemoOfficePreview,
  EquityMemoPreviewBlock,
  EquityOfficePreview,
  EquitySlidePreview,
  EquitySlidePreviewBlock,
  EquityWorkbookOfficePreview,
  EquityWorkbookPreviewCell,
  EquityWorkbookPreviewSheet,
} from "@/types/equity-office-preview";
import type { EquityProject, EquityProjectArtifactType } from "@/types/session";

const parser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  removeNSPrefix: true,
});

const execFileAsync = promisify(execFile);
const DECK_RENDER_TIMEOUT_MS = 30000;
const EXEC_MAX_BUFFER = 1024 * 1024 * 16;

const asArray = <T>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const cleanText = (value: string) =>
  value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const collectText = (node: unknown): string => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  const record = asRecord(node);
  if (!record) return "";

  let text = "";
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith("@_")) continue;
    if (key === "t") {
      text += collectText(value);
    } else if (key === "tab") {
      text += " ";
    } else if (key === "br") {
      text += "\n";
    } else {
      text += collectText(value);
    }
  }
  return text;
};

const parseXml = (xml: string): Record<string, unknown> =>
  parser.parse(xml) as Record<string, unknown>;

const getNestedRecord = (
  value: unknown,
  keys: string[],
): Record<string, unknown> | null => {
  let current: unknown = value;
  for (const key of keys) {
    current = asRecord(current)?.[key];
  }
  return asRecord(current);
};

const getAttribute = (value: unknown, key: string): string =>
  asString(asRecord(value)?.[`@_${key}`]);

const buildMemoPreview = async (
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<EquityMemoOfficePreview> => {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) throw new Error("DOCX preview could not read document.xml.");

  const body = getNestedRecord(parseXml(documentXml), ["document", "body"]);
  const paragraphs = asArray(body?.p);
  const tables = asArray(body?.tbl);

  const blocks: EquityMemoPreviewBlock[] = paragraphs
    .map((paragraph) => {
      const text = cleanText(collectText(paragraph));
      if (!text) return null;
      const paragraphRecord = asRecord(paragraph);
      const style = getAttribute(
        getNestedRecord(paragraphRecord, ["pPr", "pStyle"]),
        "val",
      );
      const numbered = Boolean(getNestedRecord(paragraphRecord, ["pPr", "numPr"]));
      const kind: EquityMemoPreviewBlock["kind"] =
        /heading|title/i.test(style) || text === text.toUpperCase()
          ? "heading"
          : numbered
            ? "list"
            : "paragraph";
      return { kind, text };
    })
    .filter(Boolean) as EquityMemoPreviewBlock[];

  for (const table of tables.slice(0, 4)) {
    const rows = asArray(asRecord(table)?.tr)
      .map((row) =>
        asArray(asRecord(row)?.tc)
          .map((cell) => cleanText(collectText(cell)))
          .filter(Boolean),
      )
      .filter((row) => row.length > 0);
    if (rows.length) blocks.push({ kind: "table", rows });
  }

  const title =
    blocks.find((block) => block.kind === "heading" && block.text)?.text ??
    filename.replace(/\.docx$/i, "");

  return {
    artifactType: "memo_docx",
    filename,
    mimeType,
    kind: "memo",
    title,
    blocks: blocks.slice(0, 48),
  };
};

const columnLetter = (column: number): string => {
  let label = "";
  let index = column;
  while (index > 0) {
    const remainder = (index - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    index = Math.floor((index - 1) / 26);
  }
  return label;
};

const colorFromArgb = (argb?: string): string | null => {
  if (!argb) return null;
  const normalized = argb.replace(/^FF/i, "").slice(-6);
  return normalized.length === 6 ? `#${normalized}` : null;
};

const formatNumber = (value: number, numFmt?: string): string => {
  if (/[%]/.test(numFmt ?? "")) return `${(value * 100).toFixed(1)}%`;
  if (/\$/.test(numFmt ?? "")) {
    const abs = Math.abs(value);
    const formatted =
      abs >= 1000 ? `$${(abs / 1000).toFixed(1)}B` : `$${abs.toFixed(0)}M`;
    return value < 0 ? `(${formatted})` : formatted;
  }
  if (/x/i.test(numFmt ?? "")) return `${value.toFixed(1)}x`;
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

const cellDisplay = (cell: ExcelJS.Cell): { value: string; formula: string | null } => {
  const raw = cell.value as unknown;
  const record = asRecord(raw);
  if (record?.formula) {
    const result = record.result;
    return {
      formula: String(record.formula),
      value:
        typeof result === "number"
          ? formatNumber(result, cell.numFmt)
          : cleanText(asString(result)),
    };
  }
  if (record?.richText && Array.isArray(record.richText)) {
    return {
      formula: null,
      value: cleanText(
        record.richText.map((part) => asString(asRecord(part)?.text)).join(""),
      ),
    };
  }
  if (record?.text) return { formula: null, value: cleanText(asString(record.text)) };
  if (raw instanceof Date) return { formula: null, value: raw.toISOString().slice(0, 10) };
  if (typeof raw === "number") return { formula: null, value: formatNumber(raw, cell.numFmt) };
  return { formula: null, value: cleanText(asString(raw)) };
};

const rowHasDisplayValue = (
  row: ExcelJS.Row,
  minColumn: number,
  maxColumn: number,
) => {
  for (let column = minColumn; column <= maxColumn; column += 1) {
    if (cellDisplay(row.getCell(column)).value) return true;
  }
  return false;
};

const getWorksheetPreviewBounds = (worksheet: ExcelJS.Worksheet) => {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;
  let minColumn = Number.POSITIVE_INFINITY;
  let maxColumn = 0;

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const display = cellDisplay(cell);
      if (!display.value) return;
      minRow = Math.min(minRow, rowNumber);
      maxRow = Math.max(maxRow, rowNumber);
      minColumn = Math.min(minColumn, columnNumber);
      maxColumn = Math.max(maxColumn, columnNumber);
    });
  });

  if (!Number.isFinite(minRow) || !Number.isFinite(minColumn)) return null;

  // Generated models use row 1 as a merged workbook title and row 2 as spacing.
  // For preview, start at the actual analyst grid so the artifact feels like a model.
  let firstRow = minRow <= 2 && maxRow >= 3 ? 3 : minRow;
  while (
    firstRow <= maxRow &&
    !rowHasDisplayValue(worksheet.getRow(firstRow), minColumn, maxColumn)
  ) {
    firstRow += 1;
  }

  return {
    minRow: firstRow,
    maxRow: Math.min(maxRow, firstRow + 25),
    minColumn,
    maxColumn: Math.min(maxColumn, minColumn + 9),
  };
};

const buildWorkbookPreview = async (
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<EquityWorkbookOfficePreview> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: EquityWorkbookPreviewSheet[] = workbook.worksheets
    .filter((worksheet) => worksheet.state !== "hidden")
    .slice(0, 8)
    .map((worksheet) => {
      const bounds = getWorksheetPreviewBounds(worksheet);
      if (!bounds) return { name: worksheet.name, columns: [], rows: [] };
      const columns = Array.from(
        { length: bounds.maxColumn - bounds.minColumn + 1 },
        (_, index) => columnLetter(bounds.minColumn + index),
      );
      const rows = Array.from(
        { length: bounds.maxRow - bounds.minRow + 1 },
        (_, rowIndex) => {
          const rowNumber = bounds.minRow + rowIndex;
          const row = worksheet.getRow(rowNumber);
          const cells: EquityWorkbookPreviewCell[] = columns.map(
            (column, index) => {
              const cell = row.getCell(bounds.minColumn + index);
              const fill = asRecord(cell.fill);
              const fgColor = asRecord(fill?.fgColor);
              const font = asRecord(cell.font);
              const fontColor = asRecord(font?.color);
              const { value, formula } = cellDisplay(cell);
              const align =
                cell.alignment?.horizontal === "center"
                  ? "center"
                  : cell.alignment?.horizontal === "right" ||
                      typeof cell.value === "number"
                    ? "right"
                    : "left";
              return {
                address: `${column}${rowNumber}`,
                value,
                formula,
                bold: Boolean(cell.font?.bold),
                fill: colorFromArgb(asString(fgColor?.argb)),
                color: colorFromArgb(asString(fontColor?.argb)),
                align,
              };
            },
          );
          return { rowNumber, cells };
        },
      );
      return { name: worksheet.name, columns, rows };
    });

  return {
    artifactType: "operating_model_xlsx",
    filename,
    mimeType,
    kind: "workbook",
    sheets,
  };
};

const slideFileIndex = (path: string) => {
  const match = path.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const getSlideSize = async (zip: JSZip) => {
  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  const parsed = presentationXml ? parseXml(presentationXml) : null;
  const size = getNestedRecord(parsed, ["presentation", "sldSz"]);
  return {
    width: Number(getAttribute(size, "cx")) || 12192000,
    height: Number(getAttribute(size, "cy")) || 6858000,
  };
};

const getPosition = (
  node: unknown,
  slideWidth: number,
  slideHeight: number,
  fallbackIndex: number,
) => {
  const xfrm =
    getNestedRecord(node, ["spPr", "xfrm"]) ??
    getNestedRecord(node, ["xfrm"]) ??
    getNestedRecord(node, ["nvGraphicFramePr", "xfrm"]);
  const off = asRecord(xfrm?.off);
  const ext = asRecord(xfrm?.ext);
  const x = Number(getAttribute(off, "x"));
  const y = Number(getAttribute(off, "y"));
  const w = Number(getAttribute(ext, "cx"));
  const h = Number(getAttribute(ext, "cy"));
  if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
    return {
      x: (x / slideWidth) * 100,
      y: (y / slideHeight) * 100,
      w: (w / slideWidth) * 100,
      h: (h / slideHeight) * 100,
    };
  }
  return {
    x: 6,
    y: 8 + fallbackIndex * 8,
    w: 88,
    h: 6,
  };
};

const isDeckChrome = (text: string) =>
  /^(citadail|internal research package|thesis|edge|model|comps|falsification|desk)$/i.test(
    text.trim(),
  );

const canAccess = async (filePath: string) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const resolveExecutable = async (candidates: string[], commandName: string) => {
  for (const candidate of candidates) {
    if (await canAccess(candidate)) return candidate;
  }
  try {
    const { stdout } = await execFileAsync("/usr/bin/which", [commandName], {
      timeout: 1000,
      maxBuffer: EXEC_MAX_BUFFER,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

const slideImageNumber = (filePath: string) => {
  const match = filePath.match(/-(\d+)\.png$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildSingleSlideDeckBuffer = async (
  buffer: Buffer,
  slideNumber: number,
): Promise<Buffer | null> => {
  const zip = await JSZip.loadAsync(buffer);
  const presentation = zip.file("ppt/presentation.xml");
  const rels = zip.file("ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) return null;

  const presentationXml = await presentation.async("string");
  const relsXml = await rels.async("string");
  const relationship = relsXml.match(
    new RegExp(
      `<Relationship\\b(?=[^>]*\\bTarget=["']slides/slide${slideNumber}\\.xml["'])[^>]*/>`,
      "i",
    ),
  )?.[0];
  const relationshipId = relationship?.match(/\bId=["']([^"']+)["']/i)?.[1];
  if (!relationshipId) return null;

  const slideId = presentationXml.match(
    new RegExp(
      `<[\\w-]+:sldId\\b(?=[^>]*\\br:id=["']${escapeRegExp(
        relationshipId,
      )}["'])[^>]*/>`,
      "i",
    ),
  )?.[0];
  if (!slideId) return null;

  const nextPresentationXml = presentationXml.replace(
    /<[\w-]+:sldIdLst>[\s\S]*?<\/[\w-]+:sldIdLst>/i,
    `<p:sldIdLst>${slideId}</p:sldIdLst>`,
  );
  zip.file("ppt/presentation.xml", nextPresentationXml);

  const output = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
};

const renderDeckSlideImagesWithQuickLook = async (
  buffer: Buffer,
  slideCount: number,
): Promise<string[]> => {
  const qlmanage = await resolveExecutable(["/usr/bin/qlmanage"], "qlmanage");
  if (!qlmanage || slideCount <= 0) return [];

  const workDir = await mkdtemp(path.join(tmpdir(), "citadail-pptx-ql-preview-"));
  try {
    const inputPaths: string[] = [];
    for (let slideNumber = 1; slideNumber <= slideCount; slideNumber += 1) {
      const singleSlideBuffer = await buildSingleSlideDeckBuffer(
        buffer,
        slideNumber,
      );
      if (!singleSlideBuffer) continue;
      const inputPath = path.join(workDir, `slide-${slideNumber}.pptx`);
      await writeFile(inputPath, singleSlideBuffer);
      inputPaths.push(inputPath);
    }

    if (!inputPaths.length) return [];
    await execFileAsync(
      qlmanage,
      ["-t", "-s", "1600", "-o", workDir, ...inputPaths],
      {
        timeout: Math.max(DECK_RENDER_TIMEOUT_MS, inputPaths.length * 5000),
        maxBuffer: EXEC_MAX_BUFFER,
      },
    );

    const imageFiles = (await readdir(workDir))
      .filter((file) => /^slide-\d+\.pptx\.png$/i.test(file))
      .sort((left, right) => slideImageNumber(left) - slideImageNumber(right));

    return Promise.all(
      imageFiles.map(async (file) => {
        const bytes = await readFile(path.join(workDir, file));
        return `data:image/png;base64,${bytes.toString("base64")}`;
      }),
    );
  } catch {
    return [];
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const renderDeckSlideImagesWithLibreOffice = async (
  buffer: Buffer,
): Promise<string[]> => {
  const soffice = await resolveExecutable(
    ["/usr/local/bin/soffice", "/opt/homebrew/bin/soffice"],
    "soffice",
  );
  const pdftoppm = await resolveExecutable(
    ["/usr/local/bin/pdftoppm", "/opt/homebrew/bin/pdftoppm"],
    "pdftoppm",
  );
  if (!soffice || !pdftoppm) return [];

  const workDir = await mkdtemp(path.join(tmpdir(), "citadail-pptx-preview-"));
  try {
    const pptxPath = path.join(workDir, "deck.pptx");
    await writeFile(pptxPath, buffer);

    await execFileAsync(
      soffice,
      [
        "--headless",
        "--invisible",
        "--nologo",
        "--nofirststartwizard",
        "--nolockcheck",
        `-env:UserInstallation=${pathToFileURL(path.join(workDir, "lo-profile")).href}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        pptxPath,
      ],
      { timeout: DECK_RENDER_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER },
    );

    const filesAfterPdf = await readdir(workDir);
    const pdfPath =
      filesAfterPdf
        .filter((file) => file.toLowerCase().endsWith(".pdf"))
        .map((file) => path.join(workDir, file))
        .at(0) ?? path.join(workDir, "deck.pdf");
    if (!(await canAccess(pdfPath))) return [];

    const outputPrefix = path.join(workDir, "slide");
    await execFileAsync(
      pdftoppm,
      ["-png", "-r", "140", pdfPath, outputPrefix],
      { timeout: DECK_RENDER_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER },
    );

    const imageFiles = (await readdir(workDir))
      .filter((file) => /^slide-\d+\.png$/i.test(file))
      .sort((left, right) => slideImageNumber(left) - slideImageNumber(right));

    return Promise.all(
      imageFiles.map(async (file) => {
        const bytes = await readFile(path.join(workDir, file));
        return `data:image/png;base64,${bytes.toString("base64")}`;
      }),
    );
  } catch {
    return [];
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const renderDeckSlideImages = async (
  buffer: Buffer,
  slideCount: number,
): Promise<string[]> => {
  if (process.env.NODE_ENV === "test") return [];

  const quickLookImages = await renderDeckSlideImagesWithQuickLook(
    buffer,
    slideCount,
  );
  if (quickLookImages.length) return quickLookImages;
  return renderDeckSlideImagesWithLibreOffice(buffer);
};

const buildDeckPreview = async (
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<EquityDeckOfficePreview> => {
  const zip = await JSZip.loadAsync(buffer);
  const slideSize = await getSlideSize(zip);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((left, right) => slideFileIndex(left) - slideFileIndex(right));
  const slideImages = await renderDeckSlideImages(buffer, slidePaths.length);

  const slides: EquitySlidePreview[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const xml = await zip.file(path)?.async("string");
    if (!xml) continue;
    const parsed = parseXml(xml);
    const spTree = getNestedRecord(parsed, ["sld", "cSld", "spTree"]);
    const candidates = [
      ...asArray(asRecord(spTree)?.sp),
      ...asArray(asRecord(spTree)?.graphicFrame),
    ];
    const blocks: EquitySlidePreviewBlock[] = candidates
      .map((node, blockIndex) => {
        const text = cleanText(collectText(node));
        if (!text) return null;
        const position = getPosition(node, slideSize.width, slideSize.height, blockIndex);
        const role: EquitySlidePreviewBlock["role"] =
          blockIndex <= 2 && !isDeckChrome(text)
            ? "title"
            : text.length <= 28 || isDeckChrome(text)
              ? "label"
              : "body";
        return {
          text,
          ...position,
          role,
        };
      })
      .filter(Boolean) as EquitySlidePreviewBlock[];
    const title =
      blocks.find((block) => block.role === "title" && !isDeckChrome(block.text))?.text ??
      `Slide ${index + 1}`;
    slides.push({
      index,
      title: cleanText(title).slice(0, 90),
      blocks: blocks.slice(0, 36),
      imageDataUrl: slideImages[index] ?? null,
    });
  }

  return {
    artifactType: "pm_deck_pptx",
    filename,
    mimeType,
    kind: "deck",
    slides,
  };
};

export const buildEquityOfficePreview = async ({
  artifactType,
  project,
}: {
  artifactType: EquityProjectArtifactType;
  project: EquityProject;
}): Promise<EquityOfficePreview> => {
  const exportResult = await buildEquityExport({ artifactType, project });
  if (artifactType === "memo_docx") {
    return buildMemoPreview(exportResult.buffer, exportResult.filename, exportResult.mimeType);
  }
  if (artifactType === "operating_model_xlsx") {
    return buildWorkbookPreview(exportResult.buffer, exportResult.filename, exportResult.mimeType);
  }
  return buildDeckPreview(exportResult.buffer, exportResult.filename, exportResult.mimeType);
};

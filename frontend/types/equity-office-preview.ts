import type { EquityProjectArtifactType } from "@/types/session";

export interface EquityOfficePreviewBase {
  artifactType: EquityProjectArtifactType;
  filename: string;
  mimeType: string;
}

export interface EquityMemoPreviewBlock {
  kind: "heading" | "paragraph" | "list" | "table";
  text?: string;
  rows?: string[][];
}

export interface EquityMemoOfficePreview extends EquityOfficePreviewBase {
  kind: "memo";
  title: string;
  blocks: EquityMemoPreviewBlock[];
}

export interface EquityWorkbookPreviewCell {
  address: string;
  value: string;
  formula: string | null;
  bold: boolean;
  fill: string | null;
  color: string | null;
  align: "left" | "center" | "right";
}

export interface EquityWorkbookPreviewRow {
  rowNumber: number;
  cells: EquityWorkbookPreviewCell[];
}

export interface EquityWorkbookPreviewSheet {
  name: string;
  columns: string[];
  rows: EquityWorkbookPreviewRow[];
}

export interface EquityWorkbookOfficePreview extends EquityOfficePreviewBase {
  kind: "workbook";
  sheets: EquityWorkbookPreviewSheet[];
}

export interface EquitySlidePreviewBlock {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  role: "title" | "body" | "label";
}

export interface EquitySlidePreview {
  index: number;
  title: string;
  blocks: EquitySlidePreviewBlock[];
  imageDataUrl: string | null;
}

export interface EquityDeckOfficePreview extends EquityOfficePreviewBase {
  kind: "deck";
  slides: EquitySlidePreview[];
}

export type EquityOfficePreview =
  | EquityMemoOfficePreview
  | EquityWorkbookOfficePreview
  | EquityDeckOfficePreview;

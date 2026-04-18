"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  EquityDeckOfficePreview,
  EquityMemoOfficePreview,
  EquityOfficePreview,
  EquityWorkbookOfficePreview,
} from "@/types/equity-office-preview";
import type {
  EquityProject,
  EquityProjectArtifactType,
} from "@/types/session";

interface EquityProjectArtifactTabProps {
  artifactType: EquityProjectArtifactType;
  project: EquityProject | null;
}

const fileLabels: Record<EquityProjectArtifactType, string> = {
  memo_docx: "DOCX",
  operating_model_xlsx: "XLSX",
  pm_deck_pptx: "PPTX",
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const previewKindLabel: Record<EquityOfficePreview["kind"], string> = {
  memo: "Word preview",
  workbook: "Excel preview",
  deck: "PowerPoint preview",
};

const ArtifactShell = ({
  artifactType,
  children,
  downloadDisabled,
  downloadState,
  filename,
  onDownload,
  status,
}: {
  artifactType: EquityProjectArtifactType;
  children: ReactNode;
  downloadDisabled: boolean;
  downloadState: "idle" | "downloading" | "failed";
  filename: string;
  onDownload: () => void;
  status: string;
}) => (
  <div className="flex min-h-full flex-col bg-[#f6f7f9] text-slate-950">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
            {fileLabels[artifactType]}
          </span>
          <span className="text-xs font-medium text-slate-400">{filename}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded border px-2 py-1 text-[11px] font-semibold capitalize",
            status === "ready"
              ? "border-slate-200 bg-white text-slate-600"
              : status === "failed"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-slate-50 text-slate-500",
          )}
        >
          {status}
        </span>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadDisabled}
          className={cn(
            "rounded-md px-3 py-2 text-xs font-semibold transition-colors",
            downloadDisabled
              ? "cursor-not-allowed bg-slate-100 text-slate-400"
              : "bg-[#061b33] text-white hover:bg-[#0d2b4c]",
          )}
        >
          {downloadState === "downloading"
            ? "Preparing..."
            : `Download .${filename.split(".").at(-1)}`}
        </button>
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto">{children}</div>
  </div>
);

const LoadingPreview = ({ label }: { label: string }) => (
  <div className="flex min-h-[420px] items-center justify-center px-6 text-center">
    <div>
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-[#061b33]" />
      <p className="mt-4 text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-xs text-slate-400">
        Reading the generated Office file.
      </p>
    </div>
  </div>
);

const MemoPreview = ({ preview }: { preview: EquityMemoOfficePreview }) => (
  <div className="px-6 py-8">
    <div className="mx-auto min-h-[920px] max-w-[820px] border border-slate-200 bg-white px-16 py-14 shadow-sm">
      <div className="border-b border-slate-200 pb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Citadail Investment Memo
        </p>
        <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#061b33]">
          {preview.title}
        </h2>
      </div>

      <div className="mt-8 space-y-5">
        {preview.blocks.map((block, index) => {
          if (block.kind === "table" && block.rows?.length) {
            return (
              <div key={`table-${index}`} className="overflow-hidden border border-slate-200">
                <table className="w-full border-collapse text-left text-xs">
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr
                        key={`${index}-${rowIndex}`}
                        className={rowIndex === 0 ? "bg-[#061b33] text-white" : ""}
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={`${index}-${rowIndex}-${cellIndex}`}
                            className="border border-slate-200 px-3 py-2 align-top leading-5"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          if (block.kind === "heading") {
            return (
              <h3
                key={`heading-${index}`}
                className="pt-3 text-lg font-semibold text-[#061b33]"
              >
                {block.text}
              </h3>
            );
          }

          if (block.kind === "list") {
            return (
              <p
                key={`list-${index}`}
                className="pl-4 text-sm leading-7 text-slate-700 before:mr-2 before:content-['-']"
              >
                {block.text}
              </p>
            );
          }

          return (
            <p key={`paragraph-${index}`} className="text-sm leading-7 text-slate-700">
              {block.text}
            </p>
          );
        })}
      </div>
    </div>
  </div>
);

const WorkbookPreview = ({
  preview,
}: {
  preview: EquityWorkbookOfficePreview;
}) => {
  const [activeSheetName, setActiveSheetName] = useState(
    preview.sheets[0]?.name ?? "",
  );
  const sheetViewportRef = useRef<HTMLDivElement | null>(null);

  const activeSheet =
    preview.sheets.find((sheet) => sheet.name === activeSheetName) ??
    preview.sheets[0];

  const gridColumnCount = useMemo(
    () =>
      Math.max(
        8,
        ...preview.sheets.map((sheet) => sheet.columns.length),
      ),
    [preview.sheets],
  );

  useLayoutEffect(() => {
    const viewport = sheetViewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }, [activeSheetName]);

  if (!activeSheet) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        Workbook preview is empty.
      </div>
    );
  }

  const isDarkFill = (fill: string | null) => {
    if (!fill) return false;
    const hex = fill.replace("#", "");
    if (hex.length !== 6) return false;
    const red = Number.parseInt(hex.slice(0, 2), 16);
    const green = Number.parseInt(hex.slice(2, 4), 16);
    const blue = Number.parseInt(hex.slice(4, 6), 16);
    return red * 0.299 + green * 0.587 + blue * 0.114 < 128;
  };

  const displayColumns = Array.from(
    { length: gridColumnCount },
    (_, index) => activeSheet.columns[index] ?? "",
  );
  const displayRows = Array.from(
    { length: Math.max(24, activeSheet.rows.length) },
    (_, index) => {
      const fallbackStart = activeSheet.rows[0]?.rowNumber ?? 1;
      return (
        activeSheet.rows[index] ?? {
          rowNumber: fallbackStart + index,
          cells: [],
        }
      );
    },
  );
  const tableWidth = Math.max(1064, 44 + gridColumnCount * 128);

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div
        ref={sheetViewportRef}
        className="min-h-0 flex-1 overflow-auto bg-[#eef1f5] p-4"
      >
        <table
          className="table-fixed border-collapse bg-white font-[Arial] text-xs shadow-sm"
          style={{ minWidth: "100%", width: tableWidth }}
        >
          <colgroup>
            <col className="w-11" />
            {displayColumns.map((_, index) => (
              <col key={`column-width-${index}`} className="w-32" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 h-8 w-10 border border-slate-300 bg-slate-100 text-slate-400" />
              {displayColumns.map((column, index) => (
                <th
                  key={`${column || "blank"}-${index}`}
                  className="sticky top-0 z-10 h-8 border border-slate-300 bg-slate-100 px-2 text-center font-semibold text-slate-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.rowNumber}>
                <th className="sticky left-0 z-10 h-8 border border-slate-300 bg-slate-100 px-2 text-right font-semibold text-slate-400">
                  {row.rowNumber}
                </th>
                {displayColumns.map((_, index) => {
                  const cell = row.cells[index];
                  return (
                    <td
                      key={cell?.address ?? `blank-${row.rowNumber}-${index}`}
                      title={cell?.formula ? `=${cell.formula}` : cell?.value}
                      className={cn(
                        "h-8 truncate border border-slate-200 px-2 align-middle",
                        cell?.bold ? "font-semibold" : "font-normal",
                      )}
                      style={{
                        backgroundColor: cell?.fill ?? undefined,
                        color:
                          cell?.color ??
                          (isDarkFill(cell?.fill ?? null)
                            ? "#ffffff"
                            : undefined),
                        textAlign: cell?.align ?? "left",
                      }}
                    >
                      {cell?.value ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex shrink-0 items-end gap-1 overflow-x-auto border-t border-slate-300 bg-[#dfe5ec] px-3 pt-1">
        {preview.sheets.map((sheet) => (
          <button
            key={sheet.name}
            type="button"
            onClick={() => setActiveSheetName(sheet.name)}
            className={cn(
              "rounded-t border px-3 py-2 text-xs font-semibold transition-colors",
              activeSheet.name === sheet.name
                ? "border-slate-300 border-b-white bg-white text-[#061b33]"
                : "border-slate-300/70 bg-[#edf1f5] text-slate-600 hover:bg-white/75 hover:text-[#061b33]",
            )}
          >
            {sheet.name}
          </button>
        ))}
      </div>
    </div>
  );
};

const isSlideChrome = (text: string) =>
  /^(citadail|internal research package|thesis|edge|model|comps|falsification|desk)$/i.test(
    text.trim(),
  );

const DeckPreview = ({ preview }: { preview: EquityDeckOfficePreview }) => {
  const [requestedSlideIndex, setRequestedSlideIndex] = useState(0);
  const activeSlideIndex = Math.min(
    requestedSlideIndex,
    Math.max(preview.slides.length - 1, 0),
  );
  const activeSlide = preview.slides[activeSlideIndex] ?? preview.slides[0];

  if (!activeSlide) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
        Deck preview is empty.
      </div>
    );
  }

  const slideBlocks = activeSlide.blocks.filter(
    (block) => !isSlideChrome(block.text),
  );
  const titleBlock =
    slideBlocks.find((block) => block.role === "title") ?? slideBlocks[0];
  const bodyBlocks = slideBlocks.filter((block) => block !== titleBlock);

  return (
    <div className="grid min-h-full grid-cols-[148px_minmax(0,1fr)] bg-[#eef1f5]">
      <aside className="overflow-y-auto border-r border-slate-200 bg-white p-3">
        <div className="space-y-2">
          {preview.slides.map((slide, index) => (
            <button
              key={slide.index}
              type="button"
              onClick={() => setRequestedSlideIndex(index)}
              className={cn(
                "block w-full border bg-white p-1 text-left transition-colors",
                activeSlide.index === slide.index
                  ? "border-[#061b33]"
                  : "border-slate-200 hover:border-slate-400",
              )}
            >
              <div className="aspect-video overflow-hidden bg-[#f7f8fa]">
                {slide.imageDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.imageDataUrl}
                    alt={`Slide ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="px-2 py-1">
                    <p className="truncate text-[9px] font-semibold text-[#061b33]">
                      {slide.title}
                    </p>
                    <div className="mt-1 space-y-1">
                      <div className="h-1 w-3/4 bg-slate-300" />
                      <div className="h-1 w-1/2 bg-slate-200" />
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                {index + 1}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {activeSlide.title}
            </p>
            <p className="text-[11px] text-slate-400">
              Slide {activeSlideIndex + 1} of {preview.slides.length}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setRequestedSlideIndex(Math.max(activeSlideIndex - 1, 0))
              }
              disabled={activeSlideIndex === 0}
              className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() =>
                setRequestedSlideIndex(
                  Math.min(activeSlideIndex + 1, preview.slides.length - 1),
                )
              }
              disabled={activeSlideIndex === preview.slides.length - 1}
              className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="aspect-video w-full max-w-5xl overflow-hidden border border-slate-200 bg-white shadow-lg">
            {activeSlide.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={activeSlide.imageDataUrl}
                alt={`Slide ${activeSlideIndex + 1}`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full flex-col p-12">
                <div className="flex items-start justify-between gap-8">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Citadail
                    </p>
                    <h2 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight text-[#061b33]">
                      {titleBlock?.text ?? activeSlide.title}
                    </h2>
                  </div>
                  <p className="shrink-0 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Slide {activeSlideIndex + 1}
                  </p>
                </div>

                <div className="mt-10 grid flex-1 grid-cols-2 gap-4">
                  {bodyBlocks.slice(0, 6).map((block, index) => (
                    <div
                      key={`${activeSlide.index}-${index}`}
                      className={cn(
                        "border border-slate-200 bg-[#f8fafc] p-4",
                        block.role === "label" ? "min-h-20" : "min-h-28",
                      )}
                    >
                      <p
                        className={cn(
                          block.role === "label"
                            ? "text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
                            : "text-sm leading-6 text-slate-700",
                        )}
                      >
                        {block.text}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <span>Internal research package</span>
                  <span>{preview.filename}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default function EquityProjectArtifactTab({
  artifactType,
  project,
}: EquityProjectArtifactTabProps) {
  const [downloadState, setDownloadState] = useState<
    "idle" | "downloading" | "failed"
  >("idle");
  const [previewState, setPreviewState] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [preview, setPreview] = useState<EquityOfficePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const artifact = project?.artifacts[artifactType] ?? null;

  useEffect(() => {
    if (!project || !artifact || project.status !== "ready" || artifact.status !== "ready") {
      setPreview(null);
      setPreviewState("idle");
      return;
    }

    const controller = new AbortController();
    setPreview(null);
    setPreviewState("loading");
    setError(null);

    void fetch("/api/equity/project/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ artifactType, project }),
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          preview?: EquityOfficePreview;
          error?: string;
        } | null;
        if (!response.ok || !payload?.success || !payload.preview) {
          throw new Error(payload?.error ?? "Preview failed.");
        }
        setPreview(payload.preview);
        setPreviewState("ready");
      })
      .catch((previewError) => {
        if (controller.signal.aborted) return;
        setPreviewState("failed");
        setError(
          previewError instanceof Error ? previewError.message : "Preview failed.",
        );
      });

    return () => controller.abort();
  }, [artifact, artifactType, project]);

  const previewLabel = useMemo(() => {
    if (preview) return previewKindLabel[preview.kind];
    if (artifactType === "memo_docx") return "Loading Word preview...";
    if (artifactType === "operating_model_xlsx") return "Loading Excel preview...";
    return "Loading PowerPoint preview...";
  }, [artifactType, preview]);

  if (!project || !artifact) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6 text-center">
        <p className="text-sm font-medium text-slate-500">No project package.</p>
      </div>
    );
  }

  const handleDownload = async () => {
    if (project.status !== "ready" || artifact.status !== "ready") return;

    setDownloadState("downloading");
    setError(null);
    try {
      const response = await fetch("/api/equity/project/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactType, project }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Export failed.");
      }

      const blob = await response.blob();
      downloadBlob(blob, artifact.filename);
      setDownloadState("idle");
    } catch (downloadError) {
      setDownloadState("failed");
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Export failed.",
      );
    }
  };

  return (
    <ArtifactShell
      artifactType={artifactType}
      downloadDisabled={
        project.status !== "ready" ||
        artifact.status !== "ready" ||
        downloadState === "downloading"
      }
      downloadState={downloadState}
      filename={artifact.filename}
      onDownload={handleDownload}
      status={artifact.status}
    >
      {error || artifact.error ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {artifact.error ?? error}
        </div>
      ) : null}

      {previewState === "loading" ? (
        <LoadingPreview label={previewLabel} />
      ) : previewState === "failed" ? (
        <div className="flex min-h-[420px] items-center justify-center px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-700">
              Could not render file preview.
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              The Office export is still available for download.
            </p>
          </div>
        </div>
      ) : preview?.kind === "memo" ? (
        <MemoPreview preview={preview} />
      ) : preview?.kind === "workbook" ? (
        <WorkbookPreview preview={preview} />
      ) : preview?.kind === "deck" ? (
        <DeckPreview preview={preview} />
      ) : (
        <LoadingPreview label={previewLabel} />
      )}
    </ArtifactShell>
  );
}

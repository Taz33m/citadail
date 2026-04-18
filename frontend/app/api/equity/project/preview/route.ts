import { NextRequest, NextResponse } from "next/server";

import { buildEquityOfficePreview } from "@/lib/equity-office-preview";
import {
  completeEquityProject,
  createPendingEquityProject,
  isEquityProjectArtifactType,
  normalizeGeneratedContent,
  sanitizeTicker,
} from "@/lib/equity-project";
import type { EquityProject, ThesisRecommendation } from "@/types/session";

export const runtime = "nodejs";

const isRecommendation = (value: unknown): value is ThesisRecommendation =>
  value === "buy-long" || value === "hold-neutral" || value === "sell-short";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeProjectForPreview = (value: unknown): EquityProject => {
  const projectRecord = asRecord(value);
  if (!projectRecord) throw new Error("project is required.");

  const ticker = sanitizeTicker(asString(projectRecord.ticker));
  const recommendation = projectRecord.recommendation;
  const rationale = asString(projectRecord.rationale);
  if (!ticker || !isRecommendation(recommendation) || !rationale) {
    throw new Error("project ticker, recommendation, and rationale are required.");
  }

  const generatedContent = normalizeGeneratedContent(projectRecord.generatedContent);
  const pendingProject = createPendingEquityProject({
    ticker,
    recommendation,
    rationale,
    submittedAt: new Date().toISOString(),
  });

  const completedProject = completeEquityProject({
    project: {
      ...pendingProject,
      id: asString(projectRecord.id) || pendingProject.id,
    },
    content: generatedContent,
  });

  const artifacts = asRecord(projectRecord.artifacts);
  if (!artifacts) return completedProject;

  return {
    ...completedProject,
    artifacts: {
      memo_docx: {
        ...completedProject.artifacts.memo_docx,
        filename:
          asString(asRecord(artifacts.memo_docx)?.filename) ||
          completedProject.artifacts.memo_docx.filename,
      },
      operating_model_xlsx: {
        ...completedProject.artifacts.operating_model_xlsx,
        filename:
          asString(asRecord(artifacts.operating_model_xlsx)?.filename) ||
          completedProject.artifacts.operating_model_xlsx.filename,
      },
      pm_deck_pptx: {
        ...completedProject.artifacts.pm_deck_pptx,
        filename:
          asString(asRecord(artifacts.pm_deck_pptx)?.filename) ||
          completedProject.artifacts.pm_deck_pptx.filename,
      },
    },
  };
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const artifactType = body.artifactType;
    if (!isEquityProjectArtifactType(artifactType)) {
      return NextResponse.json(
        { success: false, error: "Unsupported artifact type." },
        { status: 400 },
      );
    }

    const project = normalizeProjectForPreview(body.project);
    const preview = await buildEquityOfficePreview({ artifactType, project });
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to preview analyst artifact.",
      },
      { status: 400 },
    );
  }
}

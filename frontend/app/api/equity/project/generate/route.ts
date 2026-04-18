import { NextRequest, NextResponse } from "next/server";

import {
  generateEquityProject,
  resolveCompanyContext,
} from "@/lib/equity-project-generation";
import { sanitizeTicker } from "@/lib/equity-project";
import type { ThesisRecommendation } from "@/types/session";

export const runtime = "nodejs";
export const maxDuration = 120;

const isRecommendation = (value: unknown): value is ThesisRecommendation =>
  value === "buy-long" || value === "hold-neutral" || value === "sell-short";

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ticker = sanitizeTicker(asString(body.ticker));
    const recommendation = body.recommendation;
    const rationale = asString(body.rationale);

    if (!ticker || !isRecommendation(recommendation) || !rationale) {
      return NextResponse.json(
        {
          success: false,
          error: "ticker, recommendation, and rationale are required.",
        },
        { status: 400 },
      );
    }

    const companyContext =
      body.companyContext && typeof body.companyContext === "object"
        ? resolveCompanyContext(
            ticker,
            body.companyContext as Record<string, string>,
          )
        : resolveCompanyContext(ticker);

    const project = await generateEquityProject({
      ticker,
      recommendation,
      rationale,
      companyContext,
    });

    return NextResponse.json({ success: true, project });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate analyst package.",
      },
      { status: 503 },
    );
  }
}

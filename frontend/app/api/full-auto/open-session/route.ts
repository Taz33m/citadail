import { NextRequest, NextResponse } from "next/server";

import type { ThesisRecord } from "@/types/full-auto";

const isThesisRecord = (value: unknown): value is ThesisRecord => {
  if (!value || typeof value !== "object") return false;
  const record = value as ThesisRecord;
  return Boolean(record.id && record.ticker && record.recommendation);
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { thesisRecord?: unknown };
    if (!isThesisRecord(body.thesisRecord)) {
      return NextResponse.json(
        { success: false, error: "Valid thesisRecord is required." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      thesisRecord: body.thesisRecord,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not prepare Full Auto session import.",
      },
      { status: 503 },
    );
  }
}


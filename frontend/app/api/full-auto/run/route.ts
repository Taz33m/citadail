import { NextResponse } from "next/server";

import { loadSpectrumDeskState } from "@/lib/spectrum-desk-state";

export const runtime = "nodejs";

export async function GET() {
  try {
    const state = await loadSpectrumDeskState();
    return NextResponse.json({ success: true, run: state.activeRun });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not load Full Auto run.",
      },
      { status: 503 },
    );
  }
}

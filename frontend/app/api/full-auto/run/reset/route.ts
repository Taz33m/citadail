import { NextResponse } from "next/server";

import { resetSpectrumDeskState } from "@/lib/spectrum-desk-state";

export const runtime = "nodejs";

export async function POST() {
  try {
    const state = await resetSpectrumDeskState();
    return NextResponse.json({ success: true, run: state.activeRun });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not reset Full Auto run.",
      },
      { status: 503 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { resetSpectrumDeskState } from "@/lib/spectrum-desk-state";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let dateWindow:
      | {
          startDate?: string | null;
          endDate?: string | null;
        }
      | undefined;
    try {
      const body = (await request.json()) as {
        endDate?: unknown;
        startDate?: unknown;
      };
      dateWindow = {
        endDate: typeof body.endDate === "string" ? body.endDate : null,
        startDate: typeof body.startDate === "string" ? body.startDate : null,
      };
    } catch {
      dateWindow = undefined;
    }

    const state = await resetSpectrumDeskState(dateWindow);
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

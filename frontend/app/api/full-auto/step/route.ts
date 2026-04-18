import { NextRequest, NextResponse } from "next/server";

import { createFullAutoRun, stepFullAutoRun } from "@/lib/full-auto-orchestrator";
import { trySyncFullAutoRunToDedalus } from "@/lib/dedalus-runtime";
import {
  getSpectrumFullAutoRun,
  persistSpectrumFullAutoRun,
} from "@/lib/spectrum-desk-state";
import type { FullAutoRun, FullAutoStepCommand } from "@/types/full-auto";

export const runtime = "nodejs";
export const maxDuration = 30;

const isCommand = (value: unknown): value is FullAutoStepCommand =>
  value === "start" ||
  value === "pause" ||
  value === "step_day" ||
  value === "step_event" ||
  value === "fast_forward";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      command?: unknown;
      run?: FullAutoRun;
    };
    if (!isCommand(body.command)) {
      return NextResponse.json(
        { success: false, error: "Invalid Full Auto command." },
        { status: 400 },
      );
    }

    const run = body.run ?? (await getSpectrumFullAutoRun()) ?? createFullAutoRun();
    const nextRun = await stepFullAutoRun({
      command: body.command,
      run,
    });
    await persistSpectrumFullAutoRun(nextRun);
    await trySyncFullAutoRunToDedalus(nextRun);

    return NextResponse.json({ success: true, run: nextRun });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Full Auto step failed.",
      },
      { status: 503 },
    );
  }
}

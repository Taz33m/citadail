import { NextRequest, NextResponse } from "next/server";

import { trySyncFullAutoRunToDedalus } from "@/lib/dedalus-runtime";
import { createFullAutoRun } from "@/lib/full-auto-orchestrator";
import {
  DEFAULT_FULL_AUTO_EXECUTION_MODE,
  isFullAutoExecutionMode,
  runFullAutoStepWithRuntime,
} from "@/lib/full-auto-step-runtime";
import {
  getSpectrumFullAutoRun,
  persistSpectrumFullAutoRun,
} from "@/lib/spectrum-desk-state";
import type { FullAutoRun, FullAutoStepCommand } from "@/types/full-auto";

export const runtime = "nodejs";
export const maxDuration = 120;

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
      executionMode?: unknown;
      run?: FullAutoRun;
    };
    if (!isCommand(body.command)) {
      return NextResponse.json(
        { success: false, error: "Invalid Full Auto command." },
        { status: 400 },
      );
    }

    const run = body.run ?? (await getSpectrumFullAutoRun()) ?? createFullAutoRun();
    const runtimeResult = await runFullAutoStepWithRuntime({
      command: body.command,
      mode: isFullAutoExecutionMode(body.executionMode)
        ? body.executionMode
        : DEFAULT_FULL_AUTO_EXECUTION_MODE,
      run,
    });
    const nextRun = runtimeResult.run;
    await persistSpectrumFullAutoRun(nextRun);
    if (runtimeResult.executionMode !== "dedalus_openclaw") {
      await trySyncFullAutoRunToDedalus(nextRun);
    }

    return NextResponse.json({
      executionMode: runtimeResult.executionMode,
      proof: runtimeResult.proof,
      run: nextRun,
      success: true,
    });
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

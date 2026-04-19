import { NextRequest, NextResponse } from "next/server";

import {
  getDedalusRuntimeStatus,
  isDedalusRuntimeAction,
  redactDedalusText,
  runDedalusRuntimeAction,
} from "@/lib/dedalus-runtime";
import type { DedalusRuntimeActionBody } from "@/types/dedalus-runtime";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET() {
  try {
    const runtimeStatus = await getDedalusRuntimeStatus();
    return NextResponse.json({ runtime: runtimeStatus, success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: redactDedalusText(error),
        success: false,
      },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<DedalusRuntimeActionBody>;
    if (!isDedalusRuntimeAction(body.action)) {
      return NextResponse.json(
        { error: "Invalid Dedalus runtime action.", success: false },
        { status: 400 },
      );
    }

    const runtimeStatus = await runDedalusRuntimeAction({
      action: body.action,
      command: body.command,
      run: body.run,
    });
    return NextResponse.json({
      action: body.action,
      runtime: runtimeStatus,
      success: true,
    });
  } catch (error) {
    const runtimeStatus = await getDedalusRuntimeStatus().catch(() => null);
    return NextResponse.json(
      {
        error: redactDedalusText(error),
        runtime: runtimeStatus,
        success: false,
      },
      { status: 503 },
    );
  }
}

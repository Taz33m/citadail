import { NextResponse } from "next/server";

import {
  runDeskSidebarChat,
  type DeskSidebarChatRequest,
} from "@/lib/desk-sidebar-chat";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Partial<DeskSidebarChatRequest>;
    const message = typeof payload.message === "string" ? payload.message : "";
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const snapshot =
      payload.snapshot &&
      typeof payload.snapshot === "object" &&
      !Array.isArray(payload.snapshot)
        ? (payload.snapshot as Record<string, unknown>)
        : {};

    const result = await runDeskSidebarChat({
      message,
      messages,
      snapshot,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Sidebar chat failed.",
      },
      { status: 500 },
    );
  }
}

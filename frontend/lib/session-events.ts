import { createEventId } from "./session-storage";
import type { SessionEvent, SessionEventType } from "../types/session";

export interface SessionToolResultInput {
  toolName: string;
  requestedToolName?: string;
  executedToolName?: string;
  args: Record<string, unknown>;
  success: boolean;
  message: string;
  diagnostics?: Record<string, unknown>;
}

export const createSessionEvent = (
  type: SessionEventType,
  text: string,
  metadata?: Record<string, unknown>,
  now: Date = new Date(),
): SessionEvent => ({
  id: createEventId(),
  type,
  timestamp: now,
  text,
  metadata,
});

export const createToolResultEvent = (
  event: SessionToolResultInput,
  now: Date = new Date(),
): SessionEvent =>
  createSessionEvent(
    "tool_result",
    `${event.success ? "Completed" : "Failed"} ${
      event.requestedToolName &&
      event.executedToolName &&
      event.requestedToolName !== event.executedToolName
        ? `${event.requestedToolName} -> ${event.executedToolName}`
        : event.toolName
    }: ${event.message}`,
    {
      toolName: event.toolName,
      requestedToolName: event.requestedToolName ?? event.toolName,
      executedToolName: event.executedToolName ?? event.toolName,
      success: event.success,
      args: event.args,
      ...(event.diagnostics ? { diagnostics: event.diagnostics } : {}),
    },
    now,
  );

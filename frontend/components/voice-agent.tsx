'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  type VoiceAssistantTurnEvent,
  type VoiceTranscriptPreviewEvent,
  type VoiceToolEvent,
  type VoiceUserTurnEvent,
  useVoiceAgent,
} from "@/hooks/useVoiceAgent";
import type { CreateArtifactInput } from "@/lib/adk-tools";
import type { AgentConnectMode } from "@/lib/voice-agent-controller";
import { cn } from "@/lib/utils";
import type {
  SessionArtifact,
  SessionEvent,
  SessionTranscriptEntry,
} from "@/types/session";

export interface VoiceAgentControllerHandle {
  connectVoiceAgent: () => Promise<void>;
  connectTextAgent: () => Promise<void>;
  disconnectAgent: () => Promise<void>;
  sendTextTurn: (prompt: string) => Promise<void>;
  getStatus: () => string;
  runTool: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}

interface VoiceAgentProps {
  instructions?: string;
  artifacts: SessionArtifact[];
  transcript?: SessionTranscriptEntry[];
  transcriptPreview?: SessionTranscriptEntry | null;
  toolEvents?: SessionEvent[];
  onCreateArtifact: (artifact: CreateArtifactInput) => SessionArtifact;
  getConversationContext?: () => string | undefined;
  onToolEvent?: (event: VoiceToolEvent) => void;
  onTranscriptPreviewChange?: (event: VoiceTranscriptPreviewEvent | null) => void;
  onUserTurn?: (event: VoiceUserTurnEvent) => void;
  onAssistantTurn?: (event: VoiceAssistantTurnEvent) => void;
  onStatusChange?: (status: string) => void;
  onControllerChange?: (controller: VoiceAgentControllerHandle | null) => void;
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 14-7-4 7 4 7-14-7Z" />
      <path d="M5 12h10" />
    </svg>
  );
}

const formatTimestamp = (date: Date) =>
  date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

export default function VoiceAgent({
  instructions,
  artifacts,
  transcript = [],
  transcriptPreview = null,
  toolEvents = [],
  onCreateArtifact,
  getConversationContext,
  onToolEvent,
  onTranscriptPreviewChange,
  onUserTurn,
  onAssistantTurn,
  onStatusChange,
  onControllerChange,
}: VoiceAgentProps) {
  const [textPrompt, setTextPrompt] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSendingText, setIsSendingText] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    activity,
    connectionMode,
    status,
    error,
    connectAgent,
    disconnectAgent,
    sendTextTurn,
    getStatus,
    runTool,
  } = useVoiceAgent({
    instructions,
    artifacts,
    onCreateArtifact,
    getConversationContext,
    onToolEvent,
    onTranscriptPreviewChange,
    onUserTurn,
    onAssistantTurn,
  });

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const waitForConnectedStatus = useCallback(async () => {
    const timeoutAt = Date.now() + 20_000;

    while (getStatus() !== "connected") {
      if (getStatus() === "error") {
        throw new Error(error ?? "Agent entered an error state while connecting.");
      }

      if (Date.now() >= timeoutAt) {
        throw new Error("Timed out waiting for the agent connection.");
      }

      await new Promise((resolve) => {
        window.setTimeout(resolve, 50);
      });
    }
  }, [error, getStatus]);

  const controller = useMemo<VoiceAgentControllerHandle>(
    () => ({
      connectVoiceAgent: async () => {
        await connectAgent({ mode: "voice", forceStart: true });
        await waitForConnectedStatus();
      },
      connectTextAgent: async () => {
        await connectAgent({ mode: "text", forceStart: true });
        await waitForConnectedStatus();
      },
      disconnectAgent,
      sendTextTurn,
      getStatus,
      runTool,
    }),
    [
      connectAgent,
      disconnectAgent,
      getStatus,
      runTool,
      sendTextTurn,
      waitForConnectedStatus,
    ],
  );

  useEffect(() => {
    onControllerChange?.(controller);
    return () => {
      onControllerChange?.(null);
    };
  }, [controller, onControllerChange]);

  const isBusy = status === "requesting-permission" || status === "connecting";
  const isConnected = status === "connected";
  const resolvedError = actionError ?? error;
  const isResponding = isConnected && activity === "speaking";
  const visibleTranscript = transcriptPreview
    ? [...transcript, transcriptPreview]
    : transcript;
  const shouldShowEmptyPrompt =
    visibleTranscript.length === 0 && textPrompt.trim().length === 0;

  const syncTextAreaHeight = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = "0px";
    const nextHeight = Math.min(Math.max(element.scrollHeight, 44), 144);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > 144 ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    syncTextAreaHeight(textAreaRef.current);
  }, [syncTextAreaHeight, textPrompt]);

  const ensureConnectedMode = useCallback(
    async (mode: AgentConnectMode) => {
      if (status === "connected" && connectionMode === mode) return;
      if (status === "connected" && connectionMode !== mode) {
        await disconnectAgent();
      }

      await connectAgent({ mode, forceStart: true });
      await waitForConnectedStatus();
    },
    [connectAgent, connectionMode, disconnectAgent, status, waitForConnectedStatus],
  );

  const handleTextSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const normalizedPrompt = textPrompt.trim();
      if (!normalizedPrompt || isBusy || isSendingText) return;

      setActionError(null);
      setIsSendingText(true);

      try {
        await ensureConnectedMode("text");
        await sendTextTurn(normalizedPrompt);
        setTextPrompt("");
      } catch (nextError) {
        setActionError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to send that text prompt.",
        );
      } finally {
        setIsSendingText(false);
      }
    },
    [ensureConnectedMode, isBusy, isSendingText, sendTextTurn, textPrompt],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      {/*
        Voice controls are intentionally hidden for now. Gemini Live voice
        connection/controller support remains in the hook and can be wired back
        into the sidebar later without changing the chat surface.
      */}

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 px-4 py-4">
        {visibleTranscript.length ? (
          <div className="space-y-3">
            {visibleTranscript.map((entry) => (
              <article
                key={entry.id}
                className={cn(
                  "rounded-lg border px-3 py-2 shadow-sm",
                  entry.role === "user"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-900",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase opacity-70">
                    {entry.role === "assistant" ? "Agent" : entry.role}
                  </span>
                  <span className="text-[11px] opacity-60">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-5">{entry.text}</p>
              </article>
            ))}
          </div>
        ) : shouldShowEmptyPrompt ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <p className="text-sm font-semibold text-gray-800">
                Start from the desk.
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                Ask for a brief, call a tool, or create an artifact from here.
              </p>
            </div>
          </div>
        ) : null}

        {toolEvents.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Tool Calls
            </p>
            {toolEvents.slice(-4).map((event) => (
              <div
                key={event.id}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-gray-900">
                    {String(event.metadata?.toolName ?? "tool")}
                  </span>
                  <span>{formatTimestamp(event.timestamp)}</span>
                </div>
                <p className="mt-1 line-clamp-2 leading-5">{event.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-gray-200 bg-white p-3">
        {resolvedError ? (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {resolvedError}
          </div>
        ) : null}

        <form onSubmit={handleTextSubmit} className="flex items-end gap-2">
          <label htmlFor="session-text-prompt" className="sr-only">
            Text prompt
          </label>
          <div className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <textarea
              id="session-text-prompt"
              ref={textAreaRef}
              rows={1}
              value={textPrompt}
              onChange={(event) => {
                setTextPrompt(event.target.value);
                syncTextAreaHeight(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleTextSubmit();
                }
              }}
              placeholder="Ask the desk agent..."
              className="m-0 block min-h-[44px] w-full resize-none overflow-y-hidden border-0 bg-transparent p-0 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 [appearance:none] [-webkit-appearance:none] [scrollbar-width:thin] focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent"
              style={{ boxShadow: "none", outline: "none" }}
            />
          </div>
          <button
            type="submit"
            disabled={isBusy || isSendingText || textPrompt.trim().length === 0}
            aria-label={isSendingText ? "Sending prompt" : "Send prompt"}
            title={isSendingText ? "Sending" : "Send prompt"}
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-900 bg-gray-900 text-white transition-colors",
              isBusy || isSendingText || textPrompt.trim().length === 0
                ? "cursor-not-allowed opacity-50"
                : "hover:bg-gray-800",
            )}
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </form>

        {isResponding ? (
          <p className="mt-2 text-xs font-medium text-blue-700">
            Agent is responding.
          </p>
        ) : null}
      </div>
    </div>
  );
}

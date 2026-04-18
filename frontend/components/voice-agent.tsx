"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import {
  type VoiceAssistantTurnEvent,
  type VoiceTranscriptPreviewEvent,
  type VoiceToolEvent,
  type VoiceUserTurnEvent,
} from "@/hooks/useVoiceAgent";
import type { CreateArtifactInput } from "@/lib/adk-tools";
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
  getScreenSnapshot?: () => Record<string, unknown>;
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

const createTurnId = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function VoiceAgent({
  instructions,
  artifacts,
  onStatusChange,
  onControllerChange,
  getScreenSnapshot,
}: VoiceAgentProps) {
  const [textPrompt, setTextPrompt] = useState("");
  const [localTranscript, setLocalTranscript] = useState<SessionTranscriptEntry[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSendingText, setIsSendingText] = useState(false);
  const [status, setStatus] = useState("connected");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const sendSidebarTurn = useCallback(
    async (prompt: string) => {
      const normalizedPrompt = prompt.trim();
      if (!normalizedPrompt) return;

      const userTurn: SessionTranscriptEntry = {
        id: createTurnId("user"),
        role: "user",
        text: normalizedPrompt,
        timestamp: new Date(),
      };
      const nextTranscript = [...localTranscript, userTurn].slice(-12);
      setLocalTranscript(nextTranscript);

      const snapshot = {
        ...(getScreenSnapshot?.() ?? {}),
        artifacts: artifacts.map((artifact) => ({
          id: artifact.id,
          title: artifact.title,
          summary: artifact.summary,
          type: artifact.type,
        })),
        instructions,
      };

      const response = await fetch("/api/desk/chat", {
        body: JSON.stringify({
          message: normalizedPrompt,
          messages: nextTranscript.slice(-8).map((entry) => ({
            role: entry.role === "user" ? "user" : "assistant",
            text: entry.text,
          })),
          snapshot,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        reply?: string;
        error?: string;
        tools?: Array<{
          name?: string;
          message?: string;
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        }>;
      } | null;

      if (!response.ok || !payload?.success || !payload.reply) {
        throw new Error(payload?.error ?? "Sidebar chat failed.");
      }

      const assistantTurn: SessionTranscriptEntry = {
        id: createTurnId("assistant"),
        role: "assistant",
        text: payload.reply,
        timestamp: new Date(),
      };
      setLocalTranscript([...nextTranscript, assistantTurn].slice(-12));
    },
    [
      artifacts,
      getScreenSnapshot,
      instructions,
      localTranscript,
    ],
  );

  const controller = useMemo<VoiceAgentControllerHandle>(
    () => ({
      connectVoiceAgent: async () => {
        setStatus("connected");
      },
      connectTextAgent: async () => {
        setStatus("connected");
      },
      disconnectAgent: async () => {
        setStatus("idle");
      },
      sendTextTurn: sendSidebarTurn,
      getStatus: () => statusRef.current,
      runTool: async (toolName, args = {}) => ({
        args,
        message: `${toolName} is handled through the sidebar chat endpoint.`,
        success: false,
      }),
    }),
    [sendSidebarTurn],
  );

  useEffect(() => {
    onControllerChange?.(controller);
    return () => {
      onControllerChange?.(null);
    };
  }, [controller, onControllerChange]);

  const isBusy = false;
  const resolvedError = actionError;
  const isResponding = isSendingText;
  const visibleTranscript = localTranscript;
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

  const handleTextSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();

      const normalizedPrompt = textPrompt.trim();
      if (!normalizedPrompt || isBusy || isSendingText) return;

      setActionError(null);
      setIsSendingText(true);

      try {
        setStatus("connected");
        await sendSidebarTurn(normalizedPrompt);
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
    [isBusy, isSendingText, sendSidebarTurn, textPrompt],
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

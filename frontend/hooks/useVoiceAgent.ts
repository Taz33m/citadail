'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type FunctionCall,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type Session,
} from "@google/genai";

import {
  buildFunctionDeclarations,
  createAdkTools,
  runAdkTool,
  type CreateArtifactInput,
} from "@/lib/adk-tools";
import {
  getLiveDisconnectMessage,
  sanitizeLiveErrorMessage,
} from "@/lib/live-reconnect-policy";
import {
  finalizeTranscriptPreviewText,
  mergeTranscriptPreviewText,
} from "@/lib/transcript-preview";
import {
  dispatchTextTurn,
  shouldRequestMicrophone,
  type AgentConnectMode,
} from "@/lib/voice-agent-controller";
import type { SessionArtifact } from "@/types/session";

export type VoiceStatus =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "connected"
  | "error";

export interface VoiceToolEvent {
  id: string;
  toolName: string;
  requestedToolName: string;
  executedToolName: string;
  args: Record<string, unknown>;
  success: boolean;
  message: string;
  output?: Record<string, unknown>;
  timestamp: Date;
}

export interface VoiceAssistantTurnEvent {
  id: string;
  text: string;
  timestamp: Date;
}

export interface VoiceUserTurnEvent {
  id: string;
  text: string;
  timestamp: Date;
  source: AgentConnectMode;
}

export interface VoiceTranscriptPreviewEvent {
  role: "user" | "assistant";
  text: string;
  timestamp: Date;
}

export type VoiceActivity = "idle" | "listening" | "speaking";

interface EphemeralKeyResponse {
  ephemeralKey: string;
  expiresAt: string;
}

interface UseVoiceAgentOptions {
  instructions?: string;
  artifacts: SessionArtifact[];
  onCreateArtifact: (artifact: CreateArtifactInput) => SessionArtifact;
  getConversationContext?: () => string | undefined;
  onToolEvent?: (event: VoiceToolEvent) => void;
  onTranscriptPreviewChange?: (event: VoiceTranscriptPreviewEvent | null) => void;
  onUserTurn?: (event: VoiceUserTurnEvent) => void;
  onAssistantTurn?: (event: VoiceAssistantTurnEvent) => void;
}

const TOKEN_ENDPOINT = "/api/voice/token";
const LIVE_MODEL =
  process.env.NEXT_PUBLIC_GEMINI_LIVE_MODEL ??
  "gemini-2.5-flash-native-audio-preview-12-2025";
const LIVE_CONNECT_TIMEOUT_MS = 12_000;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const createTurnEventId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });

const waitForUiFlush = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });

const stopMediaStreamTracks = (stream: MediaStream | null | undefined) => {
  stream?.getTracks().forEach((track) => track.stop());
};

const float32ToPcm16Base64 = (input: Float32Array): string => {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    pcm[i] = Math.round(clamp(input[i], -1, 1) * 32767);
  }

  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const base64ToPcm16 = (base64: string): Int16Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Int16Array(bytes.buffer);
};

const parseSampleRateFromMimeType = (
  mimeType: string | undefined,
  fallback = 24000,
) => {
  if (!mimeType) return fallback;
  const rateMatch = mimeType.match(/(?:rate|sample_rate)=([0-9]+)/i);
  if (!rateMatch) return fallback;
  const parsed = Number.parseInt(rateMatch[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const buildAgentInstructions = (instructions?: string) => `You are the agent inside a reusable AI workspace shell.

Respond concisely and directly. Use tools for durable work product instead of pretending that a tab or artifact exists.
When work should persist outside the thread, call create_text_artifact with a clear title, one-sentence summary, and Markdown content.
Use list_artifacts when you need to inspect existing durable context.

${instructions?.trim() || "Operate as a neutral internal agent until a product-specific soul file is added."}`;

const buildSystemInstruction = (
  instructions?: string,
): NonNullable<LiveConnectConfig["systemInstruction"]> => [
  { text: buildAgentInstructions(instructions) },
];

export const useVoiceAgent = ({
  instructions,
  artifacts,
  onCreateArtifact,
  getConversationContext,
  onToolEvent,
  onTranscriptPreviewChange,
  onUserTurn,
  onAssistantTurn,
}: UseVoiceAgentOptions) => {
  const sessionRef = useRef<Session | null>(null);
  const connectAgentRef = useRef<
    (options?: { mode?: AgentConnectMode; forceStart?: boolean }) => Promise<void>
  >(async () => {});
  const disconnectAgentRef = useRef<() => Promise<void>>(async () => {});
  const handleServerMessageRef = useRef<(message: LiveServerMessage) => Promise<void>>(
    async () => {},
  );
  const connectionModeRef = useRef<AgentConnectMode>("voice");
  const activeInputTranscriptionRef = useRef("");
  const assistantTranscriptionRef = useRef("");
  const lastAssistantTurnTextRef = useRef("");
  const statusRef = useRef<VoiceStatus>("idle");
  const isMicMutedRef = useRef(false);
  const activeConnectionIdRef = useRef(0);

  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micSinkRef = useRef<GainNode | null>(null);
  const micSampleRateRef = useRef(16000);

  const playbackContextRef = useRef<AudioContext | null>(null);
  const playbackCursorRef = useRef(0);
  const playbackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const artifactsRef = useRef<SessionArtifact[]>(artifacts);
  const createArtifactRef = useRef(onCreateArtifact);
  const getConversationContextRef = useRef(getConversationContext);

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [isMicrophoneReady, setIsMicrophoneReady] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [connectionMode, setConnectionMode] = useState<AgentConnectMode>("voice");
  const [activity, setActivity] = useState<VoiceActivity>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    artifactsRef.current = artifacts;
  }, [artifacts]);

  useEffect(() => {
    createArtifactRef.current = onCreateArtifact;
  }, [onCreateArtifact]);

  useEffect(() => {
    getConversationContextRef.current = getConversationContext;
  }, [getConversationContext]);

  const tools = useMemo(
    () =>
      createAdkTools({
        createArtifact: (artifact) => createArtifactRef.current(artifact),
        getArtifacts: () => artifactsRef.current,
        getConversationContext: () => getConversationContextRef.current?.(),
      }),
    [],
  );
  const toolMap = useMemo(
    () => new Map(tools.map((tool) => [tool.name, tool])),
    [tools],
  );
  const functionDeclarations = useMemo(
    () => buildFunctionDeclarations(tools),
    [tools],
  );

  const stopPlaybackQueue = useCallback(() => {
    playbackSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // Ignore already-stopped sources.
      }
    });
    playbackSourcesRef.current.clear();
    playbackCursorRef.current = playbackContextRef.current?.currentTime ?? 0;
  }, []);

  const closePlayback = useCallback(async () => {
    stopPlaybackQueue();
    if (playbackContextRef.current) {
      try {
        await playbackContextRef.current.close();
      } catch {
        // Ignore close failures.
      }
      playbackContextRef.current = null;
    }
    playbackCursorRef.current = 0;
  }, [stopPlaybackQueue]);

  const queueAudioForPlayback = useCallback(
    async (base64Data: string, mimeType: string | undefined) => {
      if (connectionModeRef.current !== "voice") return;

      const sampleRate = parseSampleRateFromMimeType(mimeType);
      const pcm = base64ToPcm16(base64Data);
      if (pcm.length === 0) return;

      const AudioContextCtor =
        window.AudioContext ??
        ((window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext);
      if (!AudioContextCtor) return;

      const playbackContext =
        playbackContextRef.current ?? new AudioContextCtor({ sampleRate });
      playbackContextRef.current = playbackContext;
      await playbackContext.resume();

      const buffer = playbackContext.createBuffer(1, pcm.length, sampleRate);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 1) {
        channel[i] = pcm[i] / 32768;
      }

      const source = playbackContext.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackContext.destination);
      source.onended = () => {
        playbackSourcesRef.current.delete(source);
      };

      const startAt = Math.max(playbackCursorRef.current, playbackContext.currentTime);
      source.start(startAt);
      playbackCursorRef.current = startAt + buffer.duration;
      playbackSourcesRef.current.add(source);
    },
    [],
  );

  const stopMicrophoneCapture = useCallback(async () => {
    if (micProcessorRef.current) {
      micProcessorRef.current.onaudioprocess = null;
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }

    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }

    if (micSinkRef.current) {
      micSinkRef.current.disconnect();
      micSinkRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (micContextRef.current) {
      try {
        await micContextRef.current.close();
      } catch {
        // Ignore close failures.
      }
      micContextRef.current = null;
    }

    setIsMicrophoneReady(false);
  }, []);

  const startMicrophoneCapture = useCallback(
    async (session: Session, stream: MediaStream) => {
      await stopMicrophoneCapture();

      const micContext = new AudioContext();
      await micContext.resume();

      const source = micContext.createMediaStreamSource(stream);
      const processor = micContext.createScriptProcessor(2048, 1, 1);
      const silentSink = micContext.createGain();
      silentSink.gain.value = 0;

      source.connect(processor);
      processor.connect(silentSink);
      silentSink.connect(micContext.destination);

      micSampleRateRef.current = micContext.sampleRate;

      processor.onaudioprocess = (event) => {
        if (isMicMutedRef.current || statusRef.current !== "connected") {
          return;
        }

        const input = event.inputBuffer.getChannelData(0);
        if (input.length === 0) return;

        session.sendRealtimeInput({
          audio: {
            data: float32ToPcm16Base64(input),
            mimeType: `audio/pcm;rate=${micSampleRateRef.current}`,
          },
        });
      };

      micStreamRef.current = stream;
      micContextRef.current = micContext;
      micSourceRef.current = source;
      micProcessorRef.current = processor;
      micSinkRef.current = silentSink;

      setIsMicrophoneReady(true);
    },
    [stopMicrophoneCapture],
  );

  const emitUserTurn = useCallback(
    (source: AgentConnectMode, text: string) => {
      const finalizedText = finalizeTranscriptPreviewText(text);
      if (!finalizedText) return;
      onUserTurn?.({
        id: createTurnEventId(),
        text: finalizedText,
        timestamp: new Date(),
        source,
      });
    },
    [onUserTurn],
  );

  const finalizeAssistantTurn = useCallback(
    (reason: string) => {
      const finalizedText = finalizeTranscriptPreviewText(
        assistantTranscriptionRef.current,
      );
      assistantTranscriptionRef.current = "";
      onTranscriptPreviewChange?.(null);

      if (!finalizedText || finalizedText === lastAssistantTurnTextRef.current) {
        return;
      }

      lastAssistantTurnTextRef.current = finalizedText;
      onAssistantTurn?.({
        id: createTurnEventId(),
        text: finalizedText,
        timestamp: new Date(),
      });

      if (new URLSearchParams(window.location.search).get("debug") === "1") {
        console.log("[useVoiceAgent] assistant turn finalized", {
          reason,
          text: finalizedText,
        });
      }
    },
    [onAssistantTurn, onTranscriptPreviewChange],
  );

  const handleToolCalls = useCallback(
    async (functionCalls: FunctionCall[]) => {
      const session = sessionRef.current;
      if (!session || functionCalls.length === 0) return;

      const responses = await Promise.all(
        functionCalls.map(async (call) => {
          const toolName = call.name ?? "";
          const args =
            call.args && typeof call.args === "object"
              ? (call.args as Record<string, unknown>)
              : {};

          try {
            const output = await runAdkTool(toolMap, toolName, args);
            const success =
              typeof output.success === "boolean" ? output.success : true;
            const message =
              typeof output.message === "string"
                ? output.message
                : `${toolName} ${success ? "completed" : "failed"}`;

            onToolEvent?.({
              id: call.id ?? `${toolName}-${Date.now()}`,
              toolName,
              requestedToolName: toolName,
              executedToolName: toolName,
              args,
              success,
              message,
              output,
              timestamp: new Date(),
            });

            return { id: call.id, name: toolName, response: { output } };
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Unknown tool error";
            onToolEvent?.({
              id: call.id ?? `${toolName}-${Date.now()}`,
              toolName,
              requestedToolName: toolName,
              executedToolName: toolName,
              args,
              success: false,
              message,
              timestamp: new Date(),
            });
            return { id: call.id, name: toolName, response: { error: message } };
          }
        }),
      );

      session.sendToolResponse({ functionResponses: responses });
    },
    [onToolEvent, toolMap],
  );

  const handleServerMessage = useCallback(
    async (message: LiveServerMessage) => {
      const content = message.serverContent;
      const toolCallFcs = message.toolCall?.functionCalls ?? [];
      const partFcs: FunctionCall[] = (content?.modelTurn?.parts ?? [])
        .filter((part) => part.functionCall != null)
        .map((part) => part.functionCall as FunctionCall);
      const functionCalls = [...toolCallFcs, ...partFcs];

      const inputTranscription = content?.inputTranscription;
      if (inputTranscription?.text) {
        const transcriptionText = mergeTranscriptPreviewText(
          activeInputTranscriptionRef.current,
          inputTranscription.text,
        );
        activeInputTranscriptionRef.current = transcriptionText;
        setActivity("listening");
        onTranscriptPreviewChange?.({
          role: "user",
          text: transcriptionText,
          timestamp: new Date(),
        });
      }

      if (inputTranscription?.finished) {
        emitUserTurn(connectionModeRef.current, activeInputTranscriptionRef.current);
        activeInputTranscriptionRef.current = "";
        onTranscriptPreviewChange?.(null);
        setActivity("idle");
      }

      const outputTranscription = content?.outputTranscription;
      if (outputTranscription?.text) {
        const transcriptionText = mergeTranscriptPreviewText(
          assistantTranscriptionRef.current,
          outputTranscription.text,
        );
        assistantTranscriptionRef.current = transcriptionText;
        setActivity("speaking");
        onTranscriptPreviewChange?.({
          role: "assistant",
          text: transcriptionText,
          timestamp: new Date(),
        });
      }

      for (const part of content?.modelTurn?.parts ?? []) {
        const inlineData = part.inlineData;
        if (
          inlineData?.data &&
          inlineData.mimeType?.startsWith("audio/") &&
          connectionModeRef.current === "voice"
        ) {
          void queueAudioForPlayback(inlineData.data, inlineData.mimeType);
        }

        if (
          connectionModeRef.current === "text" &&
          typeof part.text === "string" &&
          part.text.trim()
        ) {
          assistantTranscriptionRef.current = mergeTranscriptPreviewText(
            assistantTranscriptionRef.current,
            part.text,
          );
        }
      }

      if (functionCalls.length > 0) {
        finalizeAssistantTurn("tool-call-start");
        await handleToolCalls(functionCalls);
      }

      if (
        outputTranscription?.finished ||
        content?.generationComplete ||
        content?.turnComplete
      ) {
        finalizeAssistantTurn(
          outputTranscription?.finished
            ? "output-finished"
            : content?.generationComplete
              ? "generation-complete"
              : "turn-complete",
        );
        setActivity("idle");
      }

      if (content?.interrupted) {
        stopPlaybackQueue();
        assistantTranscriptionRef.current = "";
        onTranscriptPreviewChange?.(null);
        setActivity("idle");
      }
    },
    [
      emitUserTurn,
      finalizeAssistantTurn,
      handleToolCalls,
      onTranscriptPreviewChange,
      queueAudioForPlayback,
      stopPlaybackQueue,
    ],
  );

  useEffect(() => {
    handleServerMessageRef.current = handleServerMessage;
  }, [handleServerMessage]);

  const disconnectAgent = useCallback(async () => {
    activeConnectionIdRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = null;
    connectionModeRef.current = "voice";

    if (session) {
      try {
        session.close();
      } catch {
        // Ignore close failures.
      }
    }

    activeInputTranscriptionRef.current = "";
    assistantTranscriptionRef.current = "";
    lastAssistantTurnTextRef.current = "";
    onTranscriptPreviewChange?.(null);

    await stopMicrophoneCapture();
    await closePlayback();

    isMicMutedRef.current = false;
    setIsMicMuted(false);
    setConnectionMode("voice");
    setActivity("idle");
    setStatus("idle");
    statusRef.current = "idle";
    setExpiresAt(null);
    setError(null);
  }, [closePlayback, onTranscriptPreviewChange, stopMicrophoneCapture]);

  const connectAgent = useCallback(
    async (options?: { mode?: AgentConnectMode; forceStart?: boolean }) => {
      const mode = options?.mode ?? "voice";
      const useMicrophone = shouldRequestMicrophone(mode);

      if (
        !options?.forceStart &&
        (statusRef.current === "connecting" || statusRef.current === "connected")
      ) {
        return;
      }

      if (statusRef.current === "connected" || statusRef.current === "connecting") {
        await disconnectAgentRef.current();
      }

      connectionModeRef.current = mode;
      setConnectionMode(mode);
      setError(null);
      setActivity("idle");
      statusRef.current = useMicrophone ? "requesting-permission" : "connecting";
      setStatus(useMicrophone ? "requesting-permission" : "connecting");

      await waitForUiFlush();

      let permissionStream: MediaStream | null = null;
      const connectionId = activeConnectionIdRef.current + 1;
      activeConnectionIdRef.current = connectionId;

      try {
        if (useMicrophone) {
          permissionStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          statusRef.current = "connecting";
          setStatus("connecting");
        }

        const tokenResponse = await fetch(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!tokenResponse.ok) {
          throw new Error("Failed to obtain Gemini ephemeral token.");
        }

        const { ephemeralKey, expiresAt: expiresAtIso } =
          (await tokenResponse.json()) as EphemeralKeyResponse;

        const ai = new GoogleGenAI({
          apiKey: ephemeralKey,
          apiVersion: "v1alpha",
        });

        const liveConfig: LiveConnectConfig = {
          responseModalities: [Modality.AUDIO],
          systemInstruction: buildSystemInstruction(instructions),
          ...(functionDeclarations.length > 0
            ? { tools: [{ functionDeclarations }] }
            : {}),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        };

        const session = await withTimeout(
          ai.live.connect({
            model: LIVE_MODEL,
            config: liveConfig,
            callbacks: {
              onmessage: (event) => {
                if (activeConnectionIdRef.current !== connectionId) return;
                void handleServerMessageRef.current(event);
              },
              onerror: (event) => {
                if (activeConnectionIdRef.current !== connectionId) return;
                const message = sanitizeLiveErrorMessage(
                  event.error?.message,
                  "Gemini Live disconnected unexpectedly.",
                );
                setError(message);
                statusRef.current = "error";
                setStatus("error");
              },
              onclose: (event) => {
                if (activeConnectionIdRef.current !== connectionId) return;
                sessionRef.current = null;
                void stopMicrophoneCapture();
                void closePlayback();
                setActivity("idle");
                setExpiresAt(null);
                isMicMutedRef.current = false;
                setIsMicMuted(false);

                if (statusRef.current !== "idle") {
                  setError(getLiveDisconnectMessage(event));
                  statusRef.current = "error";
                  setStatus("error");
                }
              },
            },
          }),
          LIVE_CONNECT_TIMEOUT_MS,
          "Gemini Live connection timed out. Try again or switch modes.",
        );

        if (activeConnectionIdRef.current !== connectionId) {
          stopMediaStreamTracks(permissionStream);
          session.close();
          return;
        }

        sessionRef.current = session;

        if (useMicrophone && permissionStream) {
          await startMicrophoneCapture(session, permissionStream);
          permissionStream = null;
        } else {
          setIsMicrophoneReady(false);
        }

        setExpiresAt(new Date(expiresAtIso));
        setError(null);
        statusRef.current = "connected";
        setStatus("connected");
      } catch (err) {
        stopMediaStreamTracks(permissionStream);
        const message = sanitizeLiveErrorMessage(
          err instanceof Error ? err.message : null,
          "Failed to connect to Gemini Live.",
        );

        sessionRef.current = null;
        await stopMicrophoneCapture();
        await closePlayback();
        setActivity("idle");
        setExpiresAt(null);
        setError(message);
        statusRef.current = "error";
        setStatus("error");
      }
    },
    [
      closePlayback,
      functionDeclarations,
      instructions,
      startMicrophoneCapture,
      stopMicrophoneCapture,
    ],
  );

  useEffect(() => {
    connectAgentRef.current = connectAgent;
  }, [connectAgent]);

  useEffect(() => {
    disconnectAgentRef.current = disconnectAgent;
  }, [disconnectAgent]);

  const sendTextTurn = useCallback(
    async (prompt: string) => {
      const normalizedPrompt = dispatchTextTurn({
        prompt,
        session: sessionRef.current,
        status: statusRef.current,
        rememberUserUtterance: () => {},
        clearActiveInput: () => {
          activeInputTranscriptionRef.current = "";
        },
      });

      onUserTurn?.({
        id: createTurnEventId(),
        text: normalizedPrompt,
        timestamp: new Date(),
        source: "text",
      });
      setActivity("listening");
    },
    [onUserTurn],
  );

  const runTool = useCallback(
    async (toolName: string, args: Record<string, unknown> = {}) => {
      const output = await runAdkTool(toolMap, toolName, args);
      const success =
        typeof output.success === "boolean" ? output.success : true;
      const message =
        typeof output.message === "string"
          ? output.message
          : `${toolName} ${success ? "completed" : "failed"}`;

      onToolEvent?.({
        id: `direct-${toolName}-${Date.now()}`,
        toolName,
        requestedToolName: toolName,
        executedToolName: toolName,
        args,
        success,
        message,
        output,
        timestamp: new Date(),
      });

      return output;
    },
    [onToolEvent, toolMap],
  );

  const getStatus = useCallback(() => statusRef.current, []);

  const toggleMic = useCallback(() => {
    if (!sessionRef.current || statusRef.current !== "connected") return;

    setIsMicMuted((prev) => {
      const next = !prev;
      isMicMutedRef.current = next;

      if (next) {
        sessionRef.current?.sendRealtimeInput({ audioStreamEnd: true });
      }

      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      void disconnectAgentRef.current();
    };
  }, []);

  return {
    session: sessionRef.current,
    status,
    error,
    expiresAt,
    isMicrophoneReady,
    isMicMuted,
    connectionMode,
    activity,
    connectAgent,
    disconnectAgent,
    sendTextTurn,
    runTool,
    getStatus,
    toggleMic,
  };
};

export type UseVoiceAgentReturn = ReturnType<typeof useVoiceAgent>;

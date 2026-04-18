import type { Session } from "@google/genai";

export type AgentConnectMode = "voice" | "text";
export type AgentConnectionStatus =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "connected"
  | "error";

export const shouldRequestMicrophone = (mode: AgentConnectMode) =>
  mode === "voice";

interface DispatchTextTurnInput {
  prompt: string;
  session: Pick<Session, "sendClientContent"> | null;
  status: AgentConnectionStatus;
  rememberUserUtterance: (text: string) => void;
  clearActiveInput: () => void;
}

export const dispatchTextTurn = ({
  prompt,
  session,
  status,
  rememberUserUtterance,
  clearActiveInput,
}: DispatchTextTurnInput) => {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    throw new Error("Text prompt is required.");
  }

  if (!session || status !== "connected") {
    throw new Error(
      "Voice agent must be connected before sending a text prompt.",
    );
  }

  rememberUserUtterance(normalizedPrompt);
  clearActiveInput();
  session.sendClientContent({
    turns: normalizedPrompt,
    turnComplete: true,
  });

  return normalizedPrompt;
};

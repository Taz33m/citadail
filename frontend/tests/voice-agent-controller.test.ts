import { describe, expect, it, vi } from "vitest";

import {
  dispatchTextTurn,
  shouldRequestMicrophone,
} from "@/lib/voice-agent-controller";

describe("voice agent controller", () => {
  it("requests the microphone only for voice mode", () => {
    expect(shouldRequestMicrophone("voice")).toBe(true);
    expect(shouldRequestMicrophone("text")).toBe(false);
  });

  it("dispatches a trimmed text turn to Gemini", () => {
    const sendClientContent = vi.fn();
    const rememberUserUtterance = vi.fn();
    const clearActiveInput = vi.fn();

    const result = dispatchTextTurn({
      prompt: "  build an artifact  ",
      session: { sendClientContent },
      status: "connected",
      rememberUserUtterance,
      clearActiveInput,
    });

    expect(result).toBe("build an artifact");
    expect(rememberUserUtterance).toHaveBeenCalledWith("build an artifact");
    expect(clearActiveInput).toHaveBeenCalled();
    expect(sendClientContent).toHaveBeenCalledWith({
      turns: "build an artifact",
      turnComplete: true,
    });
  });

  it("rejects text dispatch before connection", () => {
    expect(() =>
      dispatchTextTurn({
        prompt: "hello",
        session: null,
        status: "idle",
        rememberUserUtterance: vi.fn(),
        clearActiveInput: vi.fn(),
      }),
    ).toThrow("Voice agent must be connected");
  });
});

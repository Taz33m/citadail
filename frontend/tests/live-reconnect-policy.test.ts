import { describe, expect, it } from "vitest";

import {
  getLiveDisconnectMessage,
  sanitizeLiveErrorMessage,
  shouldRetryLiveClose,
} from "@/lib/live-reconnect-policy";

describe("live reconnect policy", () => {
  it("retries transient close codes and reasons", () => {
    expect(shouldRetryLiveClose({ code: 1006 })).toBe(true);
    expect(shouldRetryLiveClose({ code: 1000, reason: "network reset" })).toBe(
      true,
    );
    expect(shouldRetryLiveClose({ code: 1000, reason: "normal close" })).toBe(
      false,
    );
  });

  it("sanitizes noisy provider messages", () => {
    expect(
      sanitizeLiveErrorMessage("operation is not implemented, or supported"),
    ).toBe("Voice agent disconnected unexpectedly.");
    expect(getLiveDisconnectMessage({ reason: "server restart" })).toBe(
      "Voice agent disconnected unexpectedly: server restart",
    );
  });
});

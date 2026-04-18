import { describe, expect, it } from "vitest";

import {
  finalizeTranscriptPreviewText,
  mergeTranscriptPreviewText,
} from "@/lib/transcript-preview";

describe("transcript preview", () => {
  it("merges incremental chunks without duplicating overlap", () => {
    expect(mergeTranscriptPreviewText("hello", "hello world")).toBe(
      "hello world",
    );
    expect(mergeTranscriptPreviewText("hello ", " world")).toBe("hello world");
    expect(mergeTranscriptPreviewText("hello world", "world")).toBe(
      "hello world",
    );
  });

  it("normalizes whitespace at finalization", () => {
    expect(finalizeTranscriptPreviewText("  hello\u00a0 world  ")).toBe(
      "hello world",
    );
  });
});

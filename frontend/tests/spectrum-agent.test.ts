import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  isAllowedCitadailSpectrumActor,
  parseCitadailSpectrumCommand,
} from "@/lib/citadail-spectrum-command";
import {
  runCitadailProactivePulse,
  runCitadailSpectrumCommand,
} from "@/lib/citadail-spectrum-handler";
import {
  hasProcessedSpectrumMessage,
  loadSpectrumDeskState,
  recordSpectrumMessageProcessed,
  resetSpectrumDeskState,
} from "@/lib/spectrum-desk-state";
import type { CitadailSpectrumCommand } from "@/types/citadail-spectrum";

const statePath = path.join(
  os.tmpdir(),
  `citadail-spectrum-test-${process.pid}.json`,
);

const command = (
  type: CitadailSpectrumCommand["type"],
  ticker: string | null = null,
): CitadailSpectrumCommand => ({
  isGroup: true,
  messageId: `msg-${type}-${ticker ?? "none"}`,
  rawText: `Citadail ${type} ${ticker ?? ""}`,
  senderId: "pm-1",
  spaceId: "chat-1",
  ticker,
  type,
});

describe("Citadail Spectrum integration", () => {
  beforeEach(async () => {
    process.env.CITADAIL_SPECTRUM_STATE_PATH = statePath;
    await rm(statePath, { force: true });
    await resetSpectrumDeskState();
  });

  it("parses group commands only when prefixed", () => {
    expect(
      parseCitadailSpectrumCommand({
        isGroup: true,
        messageId: "1",
        rawText: "brief",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toBeNull();

    expect(
      parseCitadailSpectrumCommand({
        isGroup: true,
        messageId: "2",
        rawText: "Citadail thesis NVDA",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toMatchObject({ ticker: "NVDA", type: "thesis" });

    expect(
      parseCitadailSpectrumCommand({
        isGroup: true,
        messageId: "3",
        rawText: "cd start feed",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toMatchObject({ type: "start_feed" });

    expect(
      parseCitadailSpectrumCommand({
        isGroup: true,
        messageId: "4",
        rawText: "Citadail runtime",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toMatchObject({ type: "runtime" });

    expect(
      parseCitadailSpectrumCommand({
        isGroup: true,
        messageId: "5",
        rawText: "Citadail news AAPL",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toMatchObject({ ticker: "AAPL", type: "news" });
  });

  it("enforces sender and space allowlists", () => {
    expect(
      isAllowedCitadailSpectrumActor({
        allowedSenders: "pm-1",
        allowedSpaces: "chat-1",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toBe(true);
    expect(
      isAllowedCitadailSpectrumActor({
        allowedSenders: "pm-2",
        allowedSpaces: "chat-1",
        senderId: "pm-1",
        spaceId: "chat-1",
      }),
    ).toBe(false);
  });

  it("steps the shared Full Auto run and formats the book", async () => {
    const stepResponse = await runCitadailSpectrumCommand(command("step"));
    const state = await loadSpectrumDeskState();

    expect(stepResponse.text).toContain("Paper portfolio only");
    expect(state.activeRun.status).toBe("running");
    expect(state.activeRun.thesisRecords.length).toBeGreaterThan(0);

    const bookResponse = await runCitadailSpectrumCommand(command("book"));
    expect(bookResponse.text).toContain("Book");
    expect(bookResponse.text).toContain("Exposure");
  });

  it("formats the Dedalus runtime command for PM chat", async () => {
    delete process.env.DEDALUS_API_KEY;

    const response = await runCitadailSpectrumCommand(command("runtime"));
    expect(response.text).toContain("Runtime");
    expect(response.text).toContain("Paper portfolio only");
  });

  it("returns thesis summaries and Office artifact attachments", async () => {
    await runCitadailSpectrumCommand(command("step"));

    const newsResponse = await runCitadailSpectrumCommand(command("news", "AAPL"));
    expect(newsResponse.text).toContain("AAPL news");
    expect(newsResponse.text).toContain("Current ticker news");
    expect(newsResponse.text).toContain("Separate from Full Auto replay");
    expect(newsResponse.text).toContain("Paper portfolio only");

    const thesisResponse = await runCitadailSpectrumCommand(
      command("thesis", "AAPL"),
    );
    expect(thesisResponse.text).toContain("AAPL");
    expect(thesisResponse.text).toContain("Paper portfolio only");

    const deckResponse = await runCitadailSpectrumCommand(command("deck", "AAPL"));
    expect(deckResponse.kind).toBe("artifact");
    expect(deckResponse.attachments?.[0]?.filename).toMatch(/AAPL.*\.pptx$/);
    expect(deckResponse.attachments?.[0]?.buffer.subarray(0, 2).toString()).toBe(
      "PK",
    );

    const chartResponse = await runCitadailSpectrumCommand(command("chart", "AAPL"));
    expect(chartResponse.kind).toBe("artifact");
    expect(chartResponse.attachments?.[0]?.mimeType).toBe("image/png");
    expect(chartResponse.attachments?.[0]?.filename).toMatch(/AAPL.*\.png$/);
    expect(chartResponse.attachments?.[0]?.buffer.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it("records PM decisions and deduplicates processed messages", async () => {
    await runCitadailSpectrumCommand(command("step"));
    const response = await runCitadailSpectrumCommand(command("approve", "AAPL"));
    const state = await loadSpectrumDeskState();
    const aapl = state.activeRun.thesisRecords.find(
      (record) => record.ticker === "AAPL",
    );

    expect(response.kind).toBe("action");
    expect(aapl?.pmDecision).toBe("approved");

    expect(await hasProcessedSpectrumMessage("msg-1")).toBe(false);
    await recordSpectrumMessageProcessed({
      messageId: "msg-1",
      spaceId: "chat-1",
    });
    expect(await hasProcessedSpectrumMessage("msg-1")).toBe(true);
  });

  it("enables proactive feed and emits agent dispatches", async () => {
    const start = await runCitadailSpectrumCommand(command("start_feed"));
    const state = await loadSpectrumDeskState();

    expect(start.text).toContain("Citadail feed is on");
    expect(state.proactiveSpaces).toContain("chat-1");

    const dispatches = await runCitadailProactivePulse("chat-1");
    const nextState = await loadSpectrumDeskState();
    expect(dispatches.length).toBeGreaterThan(0);
    expect(dispatches[0]?.text).toMatch(/Morning brief|Desk update|Risk check|PM summary|chart/i);
    expect(nextState.activeRun.status).toBe("running");
  });
});

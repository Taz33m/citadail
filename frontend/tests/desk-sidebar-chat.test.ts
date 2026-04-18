import { afterEach, describe, expect, it, vi } from "vitest";

import { runDeskSidebarChat } from "@/lib/desk-sidebar-chat";

describe("desk sidebar chat", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers from the current screen snapshot without a model key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const response = await runDeskSidebarChat({
      message: "Where am I and what should I do next?",
      snapshot: {
        activeTab: "risk-gate",
        equityProject: {
          status: "ready",
          ticker: "AAPL",
        },
        pmReview: {
          decision: "approved_to_risk",
        },
        riskGate: {
          decision: "pending",
        },
        selectedTicker: "AAPL",
      },
    });

    expect(response.reply).toContain("Risk Gate");
    expect(response.reply).toContain("AAPL");
    expect(response.reply).toContain("Purpose");
    expect(response.tools.map((tool) => tool.name)).toEqual([
      "screen_snapshot",
      "workspace_search",
    ]);
  });

  it("knows the product and workflow context", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    const response = await runDeskSidebarChat({
      message: "What is this project and what tab am I on?",
      snapshot: {
        activeTab: "coverage-desk",
      },
    });

    expect(response.reply).toContain("Citadail");
    expect(response.reply).toContain("Coverage Desk");
    expect(response.reply).toContain("Workflow");
  });
});

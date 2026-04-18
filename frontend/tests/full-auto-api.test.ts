import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { POST as openSessionPost } from "@/app/api/full-auto/open-session/route";
import { GET as runGet } from "@/app/api/full-auto/run/route";
import { POST as runResetPost } from "@/app/api/full-auto/run/reset/route";
import { POST as stepPost } from "@/app/api/full-auto/step/route";
import { createFullAutoRun } from "@/lib/full-auto-orchestrator";

const statePath = path.join(
  os.tmpdir(),
  `citadail-full-auto-api-test-${process.pid}.json`,
);

const request = (body: unknown) =>
  new Request("http://localhost/api/full-auto/test", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("Full Auto API routes", () => {
  beforeEach(async () => {
    process.env.CITADAIL_SPECTRUM_STATE_PATH = statePath;
    await rm(statePath, { force: true });
  });

  it("starts a run through the step endpoint", async () => {
    const response = await stepPost(
      request({ command: "start", run: createFullAutoRun() }) as never,
    );
    const payload = (await response.json()) as {
      success: boolean;
      run?: ReturnType<typeof createFullAutoRun>;
    };

    expect(payload.success).toBe(true);
    expect(payload.run?.status).toBe("running");
    expect(payload.run?.simulationTime).toBe("2022-01-01T14:30:00.000Z");
    expect(payload.run?.thesisRecords[0]?.validation).toBeTruthy();
  });

  it("advances a run through the step endpoint", async () => {
    const started = await stepPost(
      request({ command: "start", run: createFullAutoRun() }) as never,
    );
    const startedPayload = (await started.json()) as {
      run: ReturnType<typeof createFullAutoRun>;
    };
    const response = await stepPost(
      request({ command: "step_event", run: startedPayload.run }) as never,
    );
    const payload = (await response.json()) as {
      success: boolean;
      run?: ReturnType<typeof createFullAutoRun>;
    };

    expect(payload.success).toBe(true);
    expect(payload.run?.simulationTime).not.toBe(
      startedPayload.run.simulationTime,
    );
  });

  it("rejects invalid open-session payloads", async () => {
    const response = await openSessionPost(request({}) as never);
    const payload = (await response.json()) as { success: boolean };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
  });

  it("loads and resets the shared Full Auto run", async () => {
    const initialResponse = await runGet();
    const initialPayload = (await initialResponse.json()) as {
      success: boolean;
      run?: ReturnType<typeof createFullAutoRun>;
    };

    expect(initialPayload.success).toBe(true);
    expect(initialPayload.run?.simulationTime).toBe("2022-01-01T14:30:00.000Z");

    await stepPost(request({ command: "start" }) as never);
    const resetResponse = await runResetPost();
    const resetPayload = (await resetResponse.json()) as {
      success: boolean;
      run?: ReturnType<typeof createFullAutoRun>;
    };

    expect(resetPayload.success).toBe(true);
    expect(resetPayload.run?.status).toBe("idle");
    expect(resetPayload.run?.thesisRecords).toHaveLength(0);
  });
});

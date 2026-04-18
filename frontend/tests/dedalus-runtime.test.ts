import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  GET as dedalusGet,
  POST as dedalusPost,
} from "@/app/api/dedalus/runtime/route";
import {
  getDedalusRuntimeStatus,
  isDedalusRuntimeAction,
  redactDedalusText,
} from "@/lib/dedalus-runtime";

const statePath = path.join(
  os.tmpdir(),
  `citadail-dedalus-runtime-test-${process.pid}.json`,
);

const request = (body: unknown) =>
  new Request("http://localhost/api/dedalus/runtime", {
    body: JSON.stringify(body),
    method: "POST",
  });

describe("Dedalus runtime", () => {
  beforeEach(async () => {
    delete process.env.DEDALUS_API_KEY;
    delete process.env.DEDALUS_MACHINE_ID;
    process.env.CITADAIL_DEDALUS_STATE_PATH = statePath;
    await rm(statePath, { force: true });
  });

  it("reports an unconfigured runtime without throwing", async () => {
    const status = await getDedalusRuntimeStatus();

    expect(status.configured).toBe(false);
    expect(status.phase).toBe("unconfigured");
    expect(status.machine.id).toBeNull();
  });

  it("redacts Dedalus-looking secrets", () => {
    const fakeSecret = ["dsk", "fake", "local", "secret"].join("-");
    process.env.DEDALUS_API_KEY = fakeSecret;

    expect(redactDedalusText(`failed with ${fakeSecret}`)).not.toContain(
      fakeSecret,
    );
    expect(redactDedalusText(`token ${["dsk", "fake", "abc123"].join("-")}`)).toContain(
      "dsk-[redacted]",
    );
  });

  it("validates allowed runtime actions", () => {
    expect(isDedalusRuntimeAction("sync_full_auto_run")).toBe(true);
    expect(isDedalusRuntimeAction("arbitrary_shell")).toBe(false);
  });

  it("serves runtime status through the API without a key", async () => {
    const response = await dedalusGet();
    const payload = (await response.json()) as {
      success: boolean;
      runtime?: Awaited<ReturnType<typeof getDedalusRuntimeStatus>>;
    };

    expect(payload.success).toBe(true);
    expect(payload.runtime?.configured).toBe(false);
  });

  it("rejects invalid runtime actions", async () => {
    const response = await dedalusPost(request({ action: "arbitrary_shell" }) as never);
    const payload = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error).toMatch(/invalid/i);
  });
});

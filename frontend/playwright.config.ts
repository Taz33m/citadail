import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

const chromePath =
  process.env.CITADAIL_PLAYWRIGHT_EXECUTABLE ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const launchOptions =
  fs.existsSync(chromePath) || process.env.CITADAIL_PLAYWRIGHT_EXECUTABLE
    ? {
        executablePath: chromePath,
      }
    : undefined;

export default defineConfig({
  testDir: path.join(process.cwd(), "smoke"),
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL:
      process.env.CITADAIL_BASE_URL ?? "http://127.0.0.1:3000",
    headless: true,
    launchOptions,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chrome",
      use: {
        browserName: "chromium",
      },
    },
  ],
});

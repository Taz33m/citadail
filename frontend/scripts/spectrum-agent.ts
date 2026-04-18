import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { attachment, Spectrum, type PlatformProviderConfig, type Space } from "spectrum-ts";
import { terminal } from "spectrum-ts/providers/terminal";

import {
  isAllowedCitadailSpectrumActor,
  parseCitadailSpectrumCommand,
} from "../lib/citadail-spectrum-command";
import {
  runCitadailProactivePulse,
  runCitadailSpectrumCommand,
} from "../lib/citadail-spectrum-handler";
import {
  hasProcessedSpectrumMessage,
  loadSpectrumDeskState,
  recordSpectrumMessageProcessed,
} from "../lib/spectrum-desk-state";

const loadLocalEnv = () => {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
};

loadLocalEnv();

const projectId = process.env.PHOTON_PROJECT_ID;
const projectSecret = process.env.PHOTON_PROJECT_SECRET;
const useImessage = Boolean(projectId && projectSecret);
const useTerminal = process.env.SPECTRUM_USE_TERMINAL !== "false";
const proactiveIntervalMs = Number(
  process.env.CITADAIL_PROACTIVE_INTERVAL_MS ?? "12000",
);

const main = async () => {
  const providers: PlatformProviderConfig[] = [];
  const imessageProvider = useImessage
    ? (await import("spectrum-ts/providers/imessage")).imessage
    : null;
  if (useImessage) {
    providers.push(imessageProvider!.config());
  }
  if (useTerminal || !useImessage) {
    providers.push(terminal.config());
  }

  if (!providers.length) {
    throw new Error("No Spectrum providers configured.");
  }

  const app = useImessage
    ? await Spectrum({
        projectId: projectId!,
        projectSecret: projectSecret!,
        providers,
      })
    : await Spectrum({ providers });

  console.log(
    `Citadail Spectrum agent running with providers: ${providers
      .map((provider) => provider.__name)
      .join(", ")}`,
  );

  const spaces = new Map<string, Space>();
  let proactiveRunning = false;

  const sendResponse = async ({
    platform,
    response,
    space,
  }: {
    platform: string;
    response: Awaited<ReturnType<typeof runCitadailSpectrumCommand>>;
    space: Space;
  }) => {
    const attachments =
      platform === "terminal"
        ? []
        : response.attachments?.map((item) =>
            attachment(item.buffer, {
              mimeType: item.mimeType,
              name: item.filename,
            }),
          ) ?? [];
    await space.send(response.text, ...attachments);
  };

  const proactiveTimer = setInterval(() => {
    if (proactiveRunning) return;
    proactiveRunning = true;
    void (async () => {
      try {
        const state = await loadSpectrumDeskState();
        for (const spaceId of state.proactiveSpaces) {
          const space = spaces.get(spaceId);
          if (!space) continue;
          const responses = await runCitadailProactivePulse(spaceId);
          for (const response of responses) {
            await sendResponse({
              platform: space.__platform,
              response,
              space,
            });
          }
        }
      } catch (error) {
        console.error("Citadail proactive pulse failed", error);
      } finally {
        proactiveRunning = false;
      }
    })();
  }, Math.max(5000, proactiveIntervalMs));

  const stop = async () => {
    clearInterval(proactiveTimer);
    await app.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void stop();
  });
  process.once("SIGTERM", () => {
    void stop();
  });

  for await (const [space, message] of app.messages) {
    spaces.set(space.id, space);
    if (message.content.type !== "text") continue;
    if (await hasProcessedSpectrumMessage(message.id)) continue;

    const imessageMessage =
      imessageProvider && message.platform === "iMessage"
        ? imessageProvider(message)
        : null;
    const isGroup = imessageMessage?.space.type === "group";
    const command = parseCitadailSpectrumCommand({
      isGroup,
      messageId: message.id,
      rawText: message.content.text,
      senderId: message.sender.id,
      spaceId: space.id,
    });
    if (!command) continue;

    if (
      !isAllowedCitadailSpectrumActor({
        allowedSenders: process.env.CITADAIL_ALLOWED_SENDERS,
        allowedSpaces: process.env.CITADAIL_ALLOWED_SPACES,
        senderId: command.senderId,
        spaceId: command.spaceId,
      })
    ) {
      await recordSpectrumMessageProcessed({
        messageId: message.id,
        spaceId: space.id,
      });
      continue;
    }

    await space.responding(async () => {
      const send = async (content: string, ...attachments: ReturnType<typeof attachment>[]) => {
        if (message.platform === "terminal") {
          await space.send(content);
        } else {
          await message.reply(content, ...attachments);
        }
      };

      try {
        const response = await runCitadailSpectrumCommand(command);
        const attachments =
          message.platform === "terminal"
            ? []
            : response.attachments?.map((item) =>
                attachment(item.buffer, {
                  mimeType: item.mimeType,
                  name: item.filename,
                }),
              ) ?? [];

        await send(response.text, ...attachments);
        await recordSpectrumMessageProcessed({
          audit: {
            command: command.rawText,
            id: `spectrum-audit-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            result: response.auditText ?? response.text.slice(0, 160),
            senderId: command.senderId,
            spaceId: command.spaceId,
            timestamp: new Date().toISOString(),
          },
          messageId: message.id,
          spaceId: space.id,
        });
      } catch (error) {
        const text =
          error instanceof Error
            ? error.message
            : "Citadail could not process that command.";
        await send(`Citadail error: ${text}`);
        await recordSpectrumMessageProcessed({
          messageId: message.id,
          spaceId: space.id,
        });
      }
    });
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

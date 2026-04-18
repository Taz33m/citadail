import type {
  CitadailSpectrumCommand,
  CitadailSpectrumCommandType,
} from "@/types/citadail-spectrum";

const GROUP_PREFIX_RE = /^(?:citadail|cd)\b[\s,:-]*/i;
const TICKER_RE = /\b[A-Z][A-Z0-9.\-]{0,11}\b/;

const commandPatterns: Array<{
  type: CitadailSpectrumCommandType;
  pattern: RegExp;
  ticker?: boolean;
}> = [
  { type: "fast_forward", pattern: /^(?:fast[\s-]?forward|ff)\b/i },
  { type: "start_feed", pattern: /^(?:start|enable|subscribe)\s+(?:feed|auto|agents?)\b/i },
  { type: "stop_feed", pattern: /^(?:stop|disable|unsubscribe)\s+(?:feed|auto|agents?)\b/i },
  { type: "pulse", pattern: /^(?:pulse|dispatch|update)\b/i },
  { type: "runtime", pattern: /^(?:runtime|dedalus|machine|openclaw)\b/i },
  { type: "send_back", pattern: /^send\s+back\b/i, ticker: true },
  { type: "risk_approve", pattern: /^risk\s+approve\b/i, ticker: true },
  { type: "approve", pattern: /^approve\b/i, ticker: true },
  { type: "reject", pattern: /^reject\b/i, ticker: true },
  { type: "reduce", pattern: /^reduce\b/i, ticker: true },
  { type: "monitor", pattern: /^monitor\b/i, ticker: true },
  { type: "open", pattern: /^open\b/i, ticker: true },
  { type: "trim", pattern: /^trim\b/i, ticker: true },
  { type: "exit", pattern: /^exit\b/i, ticker: true },
  { type: "thesis", pattern: /^thesis\b/i, ticker: true },
  { type: "memo", pattern: /^memo\b/i, ticker: true },
  { type: "model", pattern: /^model\b/i, ticker: true },
  { type: "deck", pattern: /^deck\b/i, ticker: true },
  { type: "chart", pattern: /^chart\b/i, ticker: true },
  { type: "news", pattern: /^(?:news|headlines?|sources?)\b/i, ticker: true },
  { type: "positions", pattern: /^positions?\b/i },
  { type: "watch", pattern: /^watch(?:list)?\b/i },
  { type: "book", pattern: /^book\b/i },
  { type: "brief", pattern: /^(?:brief|morning)\b/i },
  { type: "step", pattern: /^step\b/i },
  { type: "help", pattern: /^help\b/i },
];

const normalizeTicker = (value: string | null) =>
  value?.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12) || null;

export const parseCitadailSpectrumCommand = ({
  isGroup,
  messageId,
  rawText,
  senderId,
  spaceId,
}: {
  rawText: string;
  spaceId: string;
  senderId: string;
  messageId: string;
  isGroup: boolean;
}): CitadailSpectrumCommand | null => {
  const trimmed = rawText.trim();
  if (!trimmed) return null;

  const prefixed = GROUP_PREFIX_RE.test(trimmed);
  if (isGroup && !prefixed) return null;

  const text = prefixed ? trimmed.replace(GROUP_PREFIX_RE, "").trim() : trimmed;
  if (!text) {
    return {
      isGroup,
      messageId,
      rawText,
      senderId,
      spaceId,
      ticker: null,
      type: "help",
    };
  }

  for (const entry of commandPatterns) {
    if (!entry.pattern.test(text)) continue;
    const rest = text.replace(entry.pattern, "").trim();
    const ticker = entry.ticker ? normalizeTicker(rest.match(TICKER_RE)?.[0] ?? null) : null;
    return {
      isGroup,
      messageId,
      rawText,
      senderId,
      spaceId,
      ticker,
      type: entry.type,
    };
  }

  return {
    isGroup,
    messageId,
    rawText,
    senderId,
    spaceId,
    ticker: normalizeTicker(text.match(TICKER_RE)?.[0] ?? null),
    type: "unknown",
  };
};

export const isAllowedCitadailSpectrumActor = ({
  allowedSenders,
  allowedSpaces,
  senderId,
  spaceId,
}: {
  allowedSenders?: string;
  allowedSpaces?: string;
  senderId: string;
  spaceId: string;
}) => {
  const senderList = allowedSenders
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const spaceList = allowedSpaces
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (senderList?.length && !senderList.includes(senderId)) return false;
  if (spaceList?.length && !spaceList.includes(spaceId)) return false;
  return true;
};

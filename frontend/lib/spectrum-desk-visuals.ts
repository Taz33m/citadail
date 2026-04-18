import { Resvg } from "@resvg/resvg-js";

import type { FullAutoPaperPosition, FullAutoRun } from "@/types/full-auto";

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtMoney = (value: number) =>
  value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  });

const pointsFor = (
  values: number[],
  width: number,
  height: number,
  padding: number,
) => {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(1, values.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((value - min) / span) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

const shell = ({
  accent = "#0a2259",
  body,
  subtitle,
  title,
}: {
  title: string;
  subtitle: string;
  body: string;
  accent?: string;
}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#f6f8fb"/>
  <rect x="42" y="38" width="876" height="464" fill="#ffffff" stroke="#d9e0e8"/>
  <rect x="42" y="38" width="876" height="8" fill="${accent}"/>
  <text x="72" y="88" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" letter-spacing="3" fill="#94a3b8">CITADAIL</text>
  <text x="72" y="132" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#0a2259">${esc(title)}</text>
  <text x="72" y="166" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#64748b">${esc(subtitle)}</text>
  ${body}
</svg>`;

const toPng = (svg: string) =>
  new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: 960,
    },
    font: {
      loadSystemFonts: true,
    },
  }).render().asPng();

const buildBookEquitySvg = (run: FullAutoRun) => {
  const points = run.portfolio.equityCurve.length
    ? run.portfolio.equityCurve
    : [
        {
          cash: run.portfolio.cash,
          closedPositions: 0,
          date: run.simulationTime,
          grossExposure: run.portfolio.grossExposure,
          label: "Now",
          netExposure: 0,
          openPositions: run.portfolio.openPositionCount,
          value: run.portfolio.netLiquidationValue,
        },
      ];
  const values = points.map((point) => point.value);
  const polyline = pointsFor(values, 760, 230, 28);
  const start = points[0];
  const end = points.at(-1) ?? start;
  const pnl = run.portfolio.netLiquidationValue - run.portfolio.startingCapital;
  const accent = pnl >= 0 ? "#0a2259" : "#9f1239";

  return shell({
    accent,
    title: "Book Equity",
    subtitle: `${start.label} to ${end.label} | ${fmtMoney(run.portfolio.netLiquidationValue)} | ${pnl >= 0 ? "+" : ""}${fmtMoney(pnl)}`,
    body: `
        <g transform="translate(100 220)">
          <rect x="0" y="0" width="760" height="230" fill="#f8fafc" stroke="#e2e8f0"/>
          <line x1="28" y1="202" x2="732" y2="202" stroke="#cbd5e1"/>
          <line x1="28" y1="28" x2="28" y2="202" stroke="#cbd5e1"/>
          <polyline points="${polyline}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="732" cy="${pointsFor([values.at(-1) ?? values[0]], 760, 230, 28).split(",")[1]}" r="7" fill="${accent}"/>
        </g>
        <text x="100" y="482" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#0a2259">Gross ${run.portfolio.grossExposurePct.toFixed(1)}% | Open ${run.portfolio.openPositionCount} | Paper-only simulation</text>
      `,
  });
};

const buildPositionSvg = (
  run: FullAutoRun,
  position: FullAutoPaperPosition,
) => {
  const actions = position.history.length ? position.history : [
    {
      id: "open",
      note: "Opened",
      price: position.entryPrice,
      simulationTime: position.openedAt,
      sizeDelta: position.initialSize,
      timestamp: position.openedAt,
      type: "open" as const,
    },
  ];
  const prices = actions.map((action) => action.price);
  if (prices.at(-1) !== position.currentPrice) prices.push(position.currentPrice);
  const polyline = pointsFor(prices, 760, 230, 28);
  const pnl = position.pnl;
  const accent = pnl >= 0 ? "#0a2259" : "#9f1239";

  return shell({
    accent,
    title: `${position.ticker} Trade Chart`,
    subtitle: `${position.side.toUpperCase()} | Entry $${position.entryPrice.toFixed(2)} | Current $${position.currentPrice.toFixed(2)} | ${fmtMoney(pnl)}`,
    body: `
        <g transform="translate(100 220)">
          <rect x="0" y="0" width="760" height="230" fill="#f8fafc" stroke="#e2e8f0"/>
          <line x1="28" y1="202" x2="732" y2="202" stroke="#cbd5e1"/>
          <line x1="28" y1="28" x2="28" y2="202" stroke="#cbd5e1"/>
          <polyline points="${polyline}" fill="none" stroke="${accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <text x="100" y="482" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#0a2259">Thesis ${position.thesisStatus} | Action ${position.nextAction} | Paper-only simulation</text>
      `,
  });
};

export const buildBookEquityPng = (run: FullAutoRun) =>
  toPng(buildBookEquitySvg(run));

export const buildPositionPng = (
  run: FullAutoRun,
  position: FullAutoPaperPosition,
) => toPng(buildPositionSvg(run, position));

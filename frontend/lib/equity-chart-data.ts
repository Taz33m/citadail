import { positionPnl } from "@/lib/equity-trade-desk";
import type { EquityPaperPosition } from "@/types/session";

export interface EquityChartPoint {
  date: string;
  label: string;
  value: number;
}

export interface EquityChartSeries {
  fromLabel: string;
  toLabel: string;
  points: EquityChartPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const asDate = (value: string | null | undefined, fallback = new Date()) => {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });

const interpolate = (start: number, end: number, progress: number) =>
  start + (end - start) * progress;

const deterministicBend = (seed: string, index: number, total: number) => {
  const seedScore = [...seed].reduce(
    (score, char) => score + char.charCodeAt(0),
    0,
  );
  const wave = Math.sin((index + 1) * 1.7 + seedScore / 17) * 0.014;
  const curve = Math.sin((index / Math.max(total - 1, 1)) * Math.PI) * 0.011;
  return wave + curve;
};

const normalizeRange = (start: Date, end: Date) => {
  if (end.getTime() - start.getTime() >= 6 * DAY_MS) {
    return { start, end };
  }
  return { start: addDays(end, -14), end };
};

export const buildTickerPriceSeries = (
  position: EquityPaperPosition,
): EquityChartSeries => {
  const start = asDate(position.openedAt);
  const end = asDate(position.closedAt, new Date());
  const range = normalizeRange(start, end);
  const pointCount = 10;
  const direction = position.side === "long" ? 1 : -1;
  const currentReturn =
    ((position.currentPrice - position.entryPrice) / position.entryPrice) *
    direction;

  const points = Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const date = new Date(
      range.start.getTime() +
        (range.end.getTime() - range.start.getTime()) * progress,
    );
    const targetPrice = interpolate(
      position.entryPrice,
      position.currentPrice,
      progress,
    );
    const noise =
      index === 0 || index === pointCount - 1
        ? 0
        : deterministicBend(position.ticker, index, pointCount) *
          position.entryPrice *
          Math.max(0.35, Math.min(Math.abs(currentReturn) * 4, 1.25));
    return {
      date: date.toISOString(),
      label: formatDate(date),
      value: Number((targetPrice + noise).toFixed(2)),
    };
  });

  points[0] = {
    ...points[0],
    date: start.toISOString(),
    label: formatDate(start),
    value: position.entryPrice,
  };
  points[points.length - 1] = {
    ...points[points.length - 1],
    date: end.toISOString(),
    label: formatDate(end),
    value: position.currentPrice,
  };

  return {
    fromLabel: formatDate(start),
    toLabel: formatDate(end),
    points,
  };
};

export const buildPortfolioPnlSeries = (
  positions: EquityPaperPosition[],
): EquityChartSeries => {
  const datedPositions = positions.map((position) => ({
    position,
    start: asDate(position.openedAt),
    end: asDate(position.closedAt, new Date()),
  }));
  const end =
    datedPositions
      .map((item) => item.end)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? new Date();
  const earliest =
    datedPositions
      .map((item) => item.start)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? addDays(end, -14);
  const range = normalizeRange(earliest, end);
  const pointCount = 10;
  const points = Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const date = new Date(
      range.start.getTime() +
        (range.end.getTime() - range.start.getTime()) * progress,
    );
    const value = datedPositions.reduce((total, item) => {
      if (date.getTime() < item.start.getTime()) return total;
      const pnl = positionPnl(item.position).pnl;
      const positionProgress = Math.min(
        Math.max(
          (date.getTime() - item.start.getTime()) /
            Math.max(item.end.getTime() - item.start.getTime(), DAY_MS),
          0,
        ),
        1,
      );
      return total + pnl * positionProgress;
    }, 0);
    return {
      date: date.toISOString(),
      label: formatDate(date),
      value: Math.round(value),
    };
  });

  return {
    fromLabel: formatDate(earliest),
    toLabel: formatDate(end),
    points,
  };
};

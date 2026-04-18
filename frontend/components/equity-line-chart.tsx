"use client";

import { cn } from "@/lib/utils";
import type { EquityChartSeries } from "@/lib/equity-chart-data";

interface EquityLineChartProps {
  formatValue: (value: number) => string;
  series: EquityChartSeries;
  title: string;
  tone?: "navy" | "positive" | "negative";
}

const chartWidth = 720;
const chartHeight = 230;
const pad = { top: 22, right: 28, bottom: 34, left: 54 };

const lineColor = {
  navy: "#061b33",
  positive: "#047857",
  negative: "#b91c1c",
};

const buildPath = (points: Array<{ x: number; y: number }>) =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

const niceStepFor = (range: number) => {
  const roughStep = Math.max(range / 4, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return magnitude * 2;
  if (normalized <= 5) return magnitude * 5;
  return magnitude * 10;
};

const chartDomain = (values: number[]) => {
  if (!values.length) return { maxValue: 1, minValue: 0, spread: 1 };

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const reference = Math.max(Math.abs(rawMax), Math.abs(rawMin), 1);
  const minimumRange = Math.max(reference * 0.02, 1);
  const rawRange = Math.max(rawMax - rawMin, minimumRange);
  const center = (rawMin + rawMax) / 2;
  const paddedRange = rawRange * 1.25;
  const step = niceStepFor(paddedRange);
  const minValue = Math.floor((center - paddedRange / 2) / step) * step;
  const maxValue = Math.ceil((center + paddedRange / 2) / step) * step;
  const spread = Math.max(maxValue - minValue, 1);

  return { maxValue, minValue, spread };
};

export default function EquityLineChart({
  formatValue,
  series,
  title,
  tone = "navy",
}: EquityLineChartProps) {
  const values = series.points.map((point) => point.value);
  const { maxValue, minValue, spread } = chartDomain(values);
  const plotWidth = chartWidth - pad.left - pad.right;
  const plotHeight = chartHeight - pad.top - pad.bottom;
  const points = series.points.map((point, index) => ({
    x: pad.left + (plotWidth * index) / Math.max(series.points.length - 1, 1),
    y: pad.top + plotHeight - ((point.value - minValue) / spread) * plotHeight,
  }));
  const path = buildPath(points);
  const latest = series.points.at(-1)?.value ?? 0;
  const first = series.points[0]?.value ?? latest;
  const delta = latest - first;
  const deltaPct = first ? delta / Math.abs(first) : 0;
  const stroke = tone === "navy" ? (delta >= 0 ? lineColor.positive : lineColor.negative) : lineColor[tone];

  return (
    <div className="border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {title}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {series.fromLabel} to {series.toLabel}
          </p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "text-lg font-semibold text-[#061b33]",
              delta >= 0 ? "text-emerald-700" : "text-red-700",
            )}
          >
            {formatValue(latest)}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {delta >= 0 ? "+" : ""}
            {formatValue(delta)} / {deltaPct >= 0 ? "+" : ""}
            {(deltaPct * 100).toFixed(1)}%
          </p>
        </div>
      </div>

      <svg
        role="img"
        aria-label={`${title} from ${series.fromLabel} to ${series.toLabel}`}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="mt-3 h-56 w-full overflow-visible"
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = pad.top + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line
                x1={pad.left}
                x2={chartWidth - pad.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={pad.left - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[11px] font-semibold"
              >
                {formatValue(maxValue - spread * ratio)}
              </text>
            </g>
          );
        })}
        <line
          x1={pad.left}
          x2={pad.left}
          y1={pad.top}
          y2={chartHeight - pad.bottom}
          stroke="#cbd5e1"
          strokeWidth="1"
        />
        <line
          x1={pad.left}
          x2={chartWidth - pad.right}
          y1={chartHeight - pad.bottom}
          y2={chartHeight - pad.bottom}
          stroke="#cbd5e1"
          strokeWidth="1"
        />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {points.map((point, index) => (
          <circle
            key={`${series.points[index]?.date}-${index}`}
            cx={point.x}
            cy={point.y}
            r={index === points.length - 1 ? 5 : 3}
            fill={index === points.length - 1 ? stroke : "#ffffff"}
            stroke={stroke}
            strokeWidth="2"
          />
        ))}
        <text
          x={pad.left}
          y={chartHeight - 8}
          textAnchor="start"
          className="fill-slate-500 text-[11px] font-semibold"
        >
          {series.points[0]?.label}
        </text>
        <text
          x={chartWidth - pad.right}
          y={chartHeight - 8}
          textAnchor="end"
          className="fill-slate-500 text-[11px] font-semibold"
        >
          {series.points.at(-1)?.label}
        </text>
      </svg>
    </div>
  );
}

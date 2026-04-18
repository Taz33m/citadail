'use client';

import { useEffect, useState } from "react";

import {
  seedMarketBrief,
  type MarketBriefPayload,
  type MarketBriefScreenerItem,
  type MarketBriefTone,
} from "@/lib/market-brief-data";
import { cn } from "@/lib/utils";

const toneClass: Record<MarketBriefTone, string> = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-gray-200 bg-gray-50 text-gray-700",
  negative: "border-rose-200 bg-rose-50 text-rose-800",
};

const formatNumber = (value: number | null, digits = 2) =>
  value === null
    ? "-"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);

const formatPercent = (value: number | null) => {
  if (value === null) return "-";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value)}%`;
};

const formatVolume = (value: number | null) => {
  if (value === null) return "-";
  if (value >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 1)}B`;
  if (value >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${formatNumber(value / 1_000, 1)}K`;
  return formatNumber(value, 0);
};

const formatTimestamp = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

function ScreenerTable({
  title,
  items,
  tone,
}: {
  title: string;
  items: MarketBriefScreenerItem[];
  tone: "positive" | "negative" | "neutral";
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-gray-950">{title}</h2>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
            toneClass[tone],
          )}
        >
          {items.length}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {items.slice(0, 4).map((item) => (
          <div
            key={`${title}-${item.symbol}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-gray-950">
                  {item.symbol}
                </span>
                <span className="truncate text-sm text-gray-700">{item.name}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Vol {formatVolume(item.volume)}
                {item.relativeVolume !== null
                  ? ` / ${formatNumber(item.relativeVolume, 1)}x rel vol`
                  : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">
                {item.price === null ? "-" : `$${formatNumber(item.price)}`}
              </div>
              <div
                className={cn(
                  "mt-1 text-xs font-semibold",
                  (item.changePercent ?? 0) > 0
                    ? "text-emerald-700"
                    : (item.changePercent ?? 0) < 0
                      ? "text-rose-700"
                      : "text-gray-500",
                )}
              >
                {formatPercent(item.changePercent)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MorningBrief() {
  const [brief, setBrief] = useState<MarketBriefPayload>(seedMarketBrief);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/market/brief", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load market brief.");
        return response.json() as Promise<MarketBriefPayload>;
      })
      .then((payload) => {
        if (!cancelled) setBrief(payload);
      })
      .catch(() => {
        if (!cancelled) setBrief(seedMarketBrief);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const secondaryNews = brief.news.filter(
    (item) => item.id !== brief.leadStory.id,
  );

  return (
    <div className="min-h-full bg-gray-50 px-6 pb-20 pt-10 text-gray-950">
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase text-gray-500">
            Market News
          </p>
          <h1 className="mt-3 text-xl font-semibold text-gray-950">
            Morning News
          </h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span>{formatTimestamp(brief.asOf)}</span>
            {isLoading ? (
              <>
                <span className="hidden text-gray-300 sm:inline">/</span>
                <span>Refreshing</span>
              </>
            ) : null}
          </div>
        </header>

        <section className="mt-8 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.9fr]">
            <div>
              <div
                className={cn(
                  "mb-3 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase",
                  toneClass[brief.sentiment.tone],
                )}
              >
                Market Sentiment
              </div>
              <h2 className="text-lg font-semibold leading-6 text-gray-950">
                {brief.sentiment.label}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                {brief.sentiment.summary}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {brief.indices.map((index) => (
                <div
                  key={index.symbol}
                  className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-3"
                >
                  <p className="font-mono text-sm font-semibold text-gray-950">
                    {index.symbol}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-gray-500">
                    {index.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-gray-950">
                    {index.price === null ? "-" : `$${formatNumber(index.price)}`}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-xs font-semibold",
                      (index.changePercent ?? 0) > 0
                        ? "text-emerald-700"
                        : (index.changePercent ?? 0) < 0
                          ? "text-rose-700"
                          : "text-gray-500",
                    )}
                  >
                    {formatPercent(index.changePercent)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
              Lead Story
            </p>
            <h2 className="text-lg font-semibold leading-6 text-gray-950">
              {brief.leadStory.headline}
            </h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              {brief.leadStory.summary}
            </p>
            <p className="mt-4 text-xs font-medium text-gray-500">
              {brief.leadStory.source}
            </p>
          </article>

          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase text-gray-500">
              Market Notes
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {secondaryNews.slice(0, 4).map((item) => (
                <article
                  key={item.id}
                  className="rounded-lg border border-gray-100 bg-gray-50/70 p-3"
                >
                  <h3 className="text-sm font-semibold leading-5 text-gray-950">
                    {item.headline}
                  </h3>
                  <p className="mt-2 line-clamp-1 text-xs leading-5 text-gray-500">
                    {item.summary}
                  </p>
                  <p className="mt-3 text-[11px] font-medium text-gray-500">
                    {item.source}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ScreenerTable
            title="Top Gainers"
            items={brief.screeners.gainers}
            tone="positive"
          />
          <ScreenerTable
            title="Top Losers"
            items={brief.screeners.losers}
            tone="negative"
          />
          <ScreenerTable
            title="Most Active"
            items={brief.screeners.active}
            tone="neutral"
          />
        </section>

        <section className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600">
            <span className="font-semibold uppercase text-gray-500">Macro Tape</span>
            {brief.macro.map((item) => (
              <span key={item.symbol}>
                {item.name}:{" "}
                <span className="font-semibold text-gray-950">
                  {item.value === null ? "-" : `${formatNumber(item.value)}${item.unit}`}
                </span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

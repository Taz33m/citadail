'use client';

import { FormEvent, useMemo, useState } from "react";

import {
  coverageDeskItems,
  filterCoverageDeskItems,
  getCoverageDeskSectionItems,
  type CoverageDeskItem,
  type CoverageDeskState,
} from "@/lib/coverage-desk-data";
import { cn } from "@/lib/utils";

const sectionMeta: Record<
  CoverageDeskState,
  { title: string; subtitle: string; accent: string }
> = {
  covered: {
    title: "Current Coverage",
    subtitle: "Active names with a maintained house view.",
    accent: "bg-blue-600",
  },
  watchlist: {
    title: "Watchlist",
    subtitle: "Names queued for research or catalyst review.",
    accent: "bg-slate-500",
  },
  flagged: {
    title: "Flagged Names",
    subtitle: "Coverage items that need an analyst check.",
    accent: "bg-amber-500",
  },
};

const recommendationClass: Record<CoverageDeskItem["recommendation"], string> = {
  BUY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HOLD: "bg-amber-50 text-amber-700 border-amber-200",
  SELL: "bg-rose-50 text-rose-700 border-rose-200",
  UNRATED: "bg-gray-50 text-gray-600 border-gray-200",
};

const statusClass: Record<CoverageDeskItem["status"], string> = {
  intact: "text-emerald-700",
  watching: "text-blue-700",
  flagged: "text-amber-700",
  stale: "text-rose-700",
};

const sectionOrder: CoverageDeskState[] = ["covered", "watchlist", "flagged"];

interface CoverageDeskProps {
  selectedTicker?: string | null;
  onSetTicker?: (ticker: string) => void;
}

const DeskSection = ({
  state,
  items,
  onSelect,
}: {
  state: CoverageDeskState;
  items: CoverageDeskItem[];
  onSelect: (item: CoverageDeskItem) => void;
}) => {
  const meta = sectionMeta[state];

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50/80 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", meta.accent)} />
              <h2 className="truncate text-sm font-semibold text-gray-900">
                {meta.title}
              </h2>
            </div>
            <p className="mt-1 text-xs text-gray-500">{meta.subtitle}</p>
          </div>
          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {items.length}
          </span>
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {items.map((item) => (
          <button
            key={item.ticker}
            type="button"
            onClick={() => onSelect(item)}
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none active:bg-white"
          >
            <span className="min-w-0">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-gray-900">
                  {item.ticker}
                </span>
                <span className="truncate text-sm text-gray-700">
                  {item.companyName}
                </span>
              </span>
              <span className="mt-1 block truncate text-xs text-gray-500">
                {item.summary}
              </span>
              <span className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-gray-500">
                <span>{item.sector}</span>
                <span className="text-gray-300">/</span>
                <span>{item.lastCheck}</span>
                <span className="text-gray-300">/</span>
                <span className={cn("font-medium", statusClass[item.status])}>
                  {item.flagReason ?? item.status}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-2">
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  recommendationClass[item.recommendation],
                )}
              >
                {item.recommendation}
              </span>
              <span className="text-[11px] text-gray-500">
                {item.conviction}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default function CoverageDesk({
  selectedTicker: controlledSelectedTicker,
  onSetTicker,
}: CoverageDeskProps) {
  const [query, setQuery] = useState("");
  const [localSelectedTicker, setLocalSelectedTicker] = useState<string | null>(
    null,
  );
  const selectedTicker = controlledSelectedTicker ?? localSelectedTicker;

  const matches = useMemo(
    () => filterCoverageDeskItems(coverageDeskItems, query).slice(0, 6),
    [query],
  );

  const sections = useMemo(
    () =>
      sectionOrder.map((state) => ({
        state,
        items: getCoverageDeskSectionItems(coverageDeskItems, state),
      })),
    [],
  );

  const selectedItem =
    coverageDeskItems.find((item) => item.ticker === selectedTicker) ?? null;

  const setTicker = (ticker: string) => {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!normalizedTicker) return;

    setLocalSelectedTicker(normalizedTicker);
    setQuery(normalizedTicker);
    onSetTicker?.(normalizedTicker);
  };

  const handleSelect = (item: CoverageDeskItem) => {
    setTicker(item.ticker);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const firstMatch = matches[0];
    if (firstMatch) {
      handleSelect(firstMatch);
      return;
    }

    const ticker = query.trim().toUpperCase();
    if (ticker) {
      setTicker(ticker);
    }
  };

  return (
    <div className="min-h-full bg-gray-50 px-6 pb-32 pt-16 text-gray-900">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase text-gray-500">
            Equity Coverage
          </p>
          <h1 className="mt-3 text-xl font-semibold text-gray-950">
            Coverage Desk
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
            Search a ticker, then work from maintained coverage, watchlist, or
            flagged research names.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative mx-auto mt-8 max-w-2xl">
          <label htmlFor="coverage-search" className="sr-only">
            Search ticker or company
          </label>
          <div className="flex items-center rounded-lg border border-gray-200 bg-white shadow-sm">
            <span className="border-r border-gray-200 px-3 text-xs font-medium uppercase text-gray-400">
              Ticker
            </span>
            <input
              id="coverage-search"
              aria-label="Search ticker or company"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value.toUpperCase())}
              placeholder="AAPL, Microsoft, Semiconductors"
              className="h-12 min-w-0 flex-1 rounded-none bg-transparent px-3 text-sm font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:none] [-webkit-appearance:none]"
              style={{ boxShadow: "none", outline: "none" }}
              autoComplete="off"
            />
            <button
              type="submit"
              className="mr-1 rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-gray-800"
            >
              Set
            </button>
          </div>

          {query.trim() ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
              {matches.length ? (
                <div className="divide-y divide-gray-100">
                  {matches.map((item) => (
                    <button
                      key={item.ticker}
                      type="button"
                      onMouseDown={() => handleSelect(item)}
                      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:outline-none active:bg-white"
                    >
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {item.ticker}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-800">
                          {item.companyName}
                        </span>
                        <span className="block truncate text-xs text-gray-500">
                          {item.sector}
                        </span>
                      </span>
                      <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                        {sectionMeta[item.state].title}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-gray-500">
                  No local coverage match. Press Set to hold the ticker in this
                  workspace.
                </p>
              )}
            </div>
          ) : null}
        </form>

        {selectedTicker ? (
          <div className="mx-auto mt-4 max-w-2xl rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase text-gray-400">
                  Selected
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {selectedItem
                    ? `${selectedItem.ticker} / ${selectedItem.companyName}`
                    : selectedTicker}
                </p>
              </div>
              {selectedItem ? (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    recommendationClass[selectedItem.recommendation],
                  )}
                >
                  {selectedItem.recommendation}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {sections.map((section) => (
            <DeskSection
              key={section.state}
              state={section.state}
              items={section.items}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

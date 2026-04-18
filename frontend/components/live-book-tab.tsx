"use client";

import { useMemo } from "react";

import EquityLineChart from "@/components/equity-line-chart";
import { buildPortfolioPnlSeries } from "@/lib/equity-chart-data";
import { buildLiveBookSnapshot } from "@/lib/equity-live-book";
import { cn } from "@/lib/utils";
import type {
  LiveBookPositionRow,
  LiveBookRiskBucket,
  LiveBookThesisRow,
} from "@/lib/equity-live-book";
import type { ShellSession } from "@/types/session";

interface LiveBookTabProps {
  activeSessionId: string;
  onOpenSession: (sessionId: string) => void;
  sessions: ShellSession[];
}

const fmtMoney = (value: number) =>
  value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  });

const fmtPrice = (value: number) => value.toFixed(2);

const fmtPct = (value: number) =>
  `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

const fmtDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "n/a";
  return parsed.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function LiveBookTab({
  activeSessionId,
  onOpenSession,
  sessions,
}: LiveBookTabProps) {
  const book = useMemo(() => buildLiveBookSnapshot(sessions), [sessions]);
  const paperPositions = useMemo(
    () =>
      sessions.flatMap((session) =>
        session.snapshot.paperPosition ? [session.snapshot.paperPosition] : [],
      ),
    [sessions],
  );
  const portfolioSeries = useMemo(
    () => buildPortfolioPnlSeries(paperPositions),
    [paperPositions],
  );
  const hasBook =
    book.openPositions.length > 0 ||
    book.closedPositions.length > 0 ||
    book.thesisPipeline.length > 0;
  const hasRiskExposure = book.sideBuckets.length > 0 || book.sectorBuckets.length > 0;

  return (
    <div className="min-h-full bg-[#f6f7f9] px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-6xl bg-white px-7 py-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Live Book
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#061b33]">
              Active theses, paper positions, and attention list.
            </h1>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
            Portfolio monitor
          </span>
        </div>

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <Metric label="Open Positions" value={`${book.totals.openPositions}`} />
          <Metric label="Gross Notional" value={fmtMoney(book.totals.grossNotional)} />
          <Metric
            label="Net Paper P&L"
            tone={book.totals.netPnl >= 0 ? "positive" : "negative"}
            value={fmtMoney(book.totals.netPnl)}
          />
        </section>

        {paperPositions.length ? (
          <section className="mt-5">
            <EquityLineChart
              title="Portfolio Paper P&L"
              series={portfolioSeries}
              formatValue={fmtMoney}
            />
          </section>
        ) : null}

        {!hasBook ? (
          <div className="mt-6 border-t border-slate-200 py-16 text-center">
            <p className="text-sm font-semibold text-[#061b33]">
              No active book yet.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Build a thesis, pass PM Review and Risk Gate, then open a paper
              trade from Desk.
            </p>
          </div>
        ) : (
          <>
            {book.openPositions.length ? (
              <section className="border-t border-slate-200 py-5">
                <SectionHeader
                  title="Open Paper Positions"
                  detail="Single-position Desk remains the detail view."
                />
                <div className="mt-3 overflow-hidden border border-slate-200">
                  {book.openPositions.map((position) => (
                    <PositionRow
                      key={`${position.sessionId}-${position.ticker}`}
                      activeSessionId={activeSessionId}
                      onOpenSession={onOpenSession}
                      position={position}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section
              className={cn(
                "grid gap-5 border-t border-slate-200 py-5",
                hasRiskExposure && "lg:grid-cols-[1.2fr_0.8fr]",
              )}
            >
              <div>
                <SectionHeader
                  title="Thesis Pipeline"
                  detail="Research packets that exist across sessions."
                />
                <div className="mt-3 overflow-hidden border border-slate-200">
                  {book.thesisPipeline.map((thesis) => (
                    <ThesisRow
                      key={`${thesis.sessionId}-${thesis.ticker}`}
                      onOpenSession={onOpenSession}
                      thesis={thesis}
                    />
                  ))}
                </div>
              </div>

              {hasRiskExposure ? (
                <div>
                  <SectionHeader
                    title="Risk Concentration"
                    detail="Paper notional by side and sector."
                  />
                  <div className="mt-3 grid gap-3">
                    <BucketPanel title="Side" buckets={book.sideBuckets} />
                    <BucketPanel title="Sector" buckets={book.sectorBuckets} />
                  </div>
                </div>
              ) : null}
            </section>

            {book.closedPositions.length ? (
              <section className="border-t border-slate-200 pt-5">
                <SectionHeader
                  title="Closed Positions"
                  detail="Recent paper positions removed from active risk."
                />
                <div className="mt-3 overflow-hidden border border-slate-200">
                  {book.closedPositions.slice(0, 5).map((position) => (
                    <PositionRow
                      key={`${position.sessionId}-${position.ticker}-closed`}
                      activeSessionId={activeSessionId}
                      onOpenSession={onOpenSession}
                      position={position}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

const SectionHeader = ({
  detail,
  title,
}: {
  detail: string;
  title: string;
}) => (
  <div>
    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
      {title}
    </h2>
    <p className="mt-1 text-sm text-slate-500">{detail}</p>
  </div>
);

const Metric = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "positive" | "negative";
  value: string;
}) => (
  <div className="border border-slate-200 px-4 py-3">
    <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
    <p
      className={cn(
        "mt-1 text-xl font-semibold text-[#061b33]",
        tone === "positive" && "text-emerald-700",
        tone === "negative" && "text-red-700",
      )}
    >
      {value}
    </p>
  </div>
);

const PositionRow = ({
  activeSessionId,
  onOpenSession,
  position,
}: {
  activeSessionId: string;
  onOpenSession: (sessionId: string) => void;
  position: LiveBookPositionRow;
}) => (
  <button
    type="button"
    onClick={() => onOpenSession(position.sessionId)}
    className="grid w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 lg:grid-cols-[1fr_90px_90px_110px_110px_120px_auto]"
  >
    <span className="min-w-0">
      <span className="flex min-w-0 items-center gap-2">
        <span className="font-mono text-sm font-semibold text-[#061b33]">
          {position.ticker}
        </span>
        <span className="truncate text-sm text-slate-700">
          {position.companyName}
        </span>
      </span>
      <span className="mt-1 block truncate text-xs text-slate-500">
        {position.nextCatalyst}
      </span>
    </span>
    <Cell label="Side" value={position.side} />
    <Cell label="Entry" value={fmtPrice(position.entryPrice)} />
    <Cell label="Current" value={fmtPrice(position.currentPrice)} />
    <Cell label="Size" value={fmtMoney(position.size)} />
    <Cell
      label="P&L"
      tone={position.pnl >= 0 ? "positive" : "negative"}
      value={`${fmtMoney(position.pnl)} ${fmtPct(position.returnPct)}`}
    />
    <span className="flex items-center justify-between gap-3 lg:justify-end">
      <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold capitalize text-slate-600">
        {position.thesisStatus}
      </span>
      <span className="text-xs font-semibold text-slate-400">
        {position.sessionId === activeSessionId ? "Desk" : fmtDate(position.openedAt)}
      </span>
    </span>
  </button>
);

const ThesisRow = ({
  onOpenSession,
  thesis,
}: {
  onOpenSession: (sessionId: string) => void;
  thesis: LiveBookThesisRow;
}) => (
  <button
    type="button"
    onClick={() => onOpenSession(thesis.sessionId)}
    className="grid w-full gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_120px_120px]"
  >
    <span className="min-w-0">
      <span className="flex min-w-0 items-center gap-2">
        <span className="font-mono text-sm font-semibold text-[#061b33]">
          {thesis.ticker}
        </span>
        <span className="truncate text-sm text-slate-700">
          {thesis.recommendation}
        </span>
      </span>
      <span className="mt-1 block truncate text-xs text-slate-500">
        {thesis.oneLineThesis}
      </span>
    </span>
    <Cell
      label="Conviction"
      value={thesis.conviction ? `${thesis.conviction.toFixed(1)}/10` : "n/a"}
    />
    <span>
      <span className="block text-[11px] font-semibold uppercase text-slate-400">
        Stage
      </span>
      <span className="mt-1 block text-sm font-semibold text-[#061b33]">
        {thesis.stage}
      </span>
      <span className="mt-1 block text-xs text-slate-500">{thesis.status}</span>
    </span>
  </button>
);

const Cell = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "positive" | "negative";
  value: string;
}) => (
  <span>
    <span className="block text-[11px] font-semibold uppercase text-slate-400">
      {label}
    </span>
    <span
      className={cn(
        "mt-1 block text-sm font-semibold text-[#061b33]",
        tone === "positive" && "text-emerald-700",
        tone === "negative" && "text-red-700",
      )}
    >
      {value}
    </span>
  </span>
);

const BucketPanel = ({
  buckets,
  title,
}: {
  buckets: LiveBookRiskBucket[];
  title: string;
}) => {
  const total = buckets.reduce((sum, bucket) => sum + bucket.exposure, 0);

  return (
    <div className="border border-slate-200 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase text-slate-400">
        {title}
      </p>
      <div className="mt-3 grid gap-3">
        {buckets.length ? (
          buckets.map((bucket) => {
            const width = total ? Math.max(6, (bucket.exposure / total) * 100) : 0;
            return (
              <div key={bucket.label}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-semibold text-[#061b33]">
                    {bucket.label}
                  </span>
                  <span className="text-slate-500">
                    {fmtMoney(bucket.exposure)} / {bucket.count}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden bg-slate-100">
                  <div
                    className="h-full bg-[#061b33]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-slate-500">No open exposure.</p>
        )}
      </div>
    </div>
  );
};

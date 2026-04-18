"use client";

import { useMemo } from "react";

import EquityLineChart from "@/components/equity-line-chart";
import { buildTickerPriceSeries } from "@/lib/equity-chart-data";
import {
  buildTradeDeskTicket,
  positionPnl,
} from "@/lib/equity-trade-desk";
import { cn } from "@/lib/utils";
import type {
  EquityPaperPosition,
  EquityPmReview,
  EquityProject,
  EquityRiskGate,
} from "@/types/session";

interface TradeDeskTabProps {
  onPositionAction: (action: "open" | "add" | "trim" | "exit" | "recheck") => void;
  pmReview: EquityPmReview | null;
  position: EquityPaperPosition | null;
  project: EquityProject | null;
  riskGate: EquityRiskGate | null;
}

const fmtMoney = (value: number) =>
  value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "USD",
  });

const fmtPrice = (value: number) => value.toFixed(2);

const fmtChartPrice = (value: number) =>
  `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;

const fmtPct = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

export default function TradeDeskTab({
  onPositionAction,
  pmReview,
  position,
  project,
  riskGate,
}: TradeDeskTabProps) {
  const ticket = useMemo(
    () => buildTradeDeskTicket(project, pmReview, riskGate),
    [pmReview, project, riskGate],
  );

  if (!ticket) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f6f7f9] px-6 text-center text-sm text-slate-500">
        Trade Desk opens after Risk approves the idea to Desk.
      </div>
    );
  }

  const livePosition = position?.projectId === project?.id ? position : null;
  const display = livePosition ?? {
    ticker: ticket.ticker,
    side: ticket.side,
    entryPrice: ticket.entryPrice,
    currentPrice: ticket.currentPrice,
    size: ticket.size,
    status: "pending" as const,
    thesisStatus: ticket.thesisStatus,
    nextAction: "Open" as const,
  };
  const pnl = livePosition ? positionPnl(livePosition) : { pnl: 0, returnPct: 0 };
  const isOpen = livePosition?.status === "open";
  const chartPosition: EquityPaperPosition =
    livePosition ?? {
      id: "ticket-preview",
      projectId: project?.id ?? "ticket",
      ticker: ticket.ticker,
      side: ticket.side,
      entryPrice: ticket.entryPrice,
      currentPrice: ticket.currentPrice,
      size: Math.round(ticket.size),
      status: "open",
      openedAt: project?.createdAt ?? "1970-01-01T00:00:00.000Z",
      closedAt: null,
      rationale: ticket.rationale,
      thesisStatus: ticket.thesisStatus,
      nextCatalyst: ticket.nextCatalyst,
      nextAction: "Open",
      history: [],
    };
  const tickerSeries = buildTickerPriceSeries(chartPosition);

  return (
    <div className="min-h-full bg-[#f6f7f9] px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl bg-white px-7 py-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Trade Desk
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#061b33]">
              Position, action, and thesis discipline.
            </h1>
          </div>
          <span
            className={cn(
              "rounded border px-3 py-1 text-xs font-semibold capitalize",
              livePosition?.status === "open"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : livePosition?.status === "closed"
                  ? "border-slate-300 bg-slate-50 text-slate-700"
                  : "border-amber-200 bg-amber-50 text-amber-700",
            )}
          >
            {livePosition?.status ?? "ticket"}
          </span>
        </div>

        <section className="mt-6 border-t border-slate-200 py-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="border border-slate-200 px-5 py-4">
              <p className="text-3xl font-semibold text-[#061b33]">
                {display.ticker} — {display.side.toUpperCase()}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric label="Entry" value={fmtPrice(display.entryPrice)} />
                <Metric label="Current" value={fmtPrice(display.currentPrice)} />
                <Metric label="Size" value={fmtMoney(display.size)} />
                <Metric
                  label="P&L"
                  value={`${fmtMoney(pnl.pnl)} (${fmtPct(pnl.returnPct)})`}
                  tone={pnl.pnl >= 0 ? "positive" : "negative"}
                />
              </div>
            </div>
            <div className="grid gap-3">
              <MetricBlock label="Thesis" value={display.thesisStatus} />
              <MetricBlock label="Action" value={display.nextAction} />
              <MetricBlock label="Next Catalyst" value={ticket.nextCatalyst} />
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 py-5">
          <EquityLineChart
            title={`${ticket.ticker} Paper Price Path`}
            series={tickerSeries}
            formatValue={fmtChartPrice}
          />
        </section>

        <section className="border-t border-slate-200 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
            Actions
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onPositionAction("open")}
              disabled={Boolean(livePosition)}
              className="rounded-md bg-[#061b33] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0d2b4c] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              Open Paper Trade
            </button>
            <DeskButton disabled={!isOpen} onClick={() => onPositionAction("add")}>
              Add
            </DeskButton>
            <DeskButton disabled={!isOpen} onClick={() => onPositionAction("trim")}>
              Trim
            </DeskButton>
            <DeskButton disabled={!isOpen} onClick={() => onPositionAction("exit")}>
              Exit
            </DeskButton>
            <DeskButton
              disabled={!isOpen}
              onClick={() => onPositionAction("recheck")}
            >
              Re-check Thesis
            </DeskButton>
          </div>
        </section>

        <section className="border-t border-slate-200 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
            Trade Rationale
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <RationaleCard title="Why Enter" text={ticket.rationale} />
            <RationaleCard title="Must Be True" text={ticket.mustBeTrue} />
            <RationaleCard title="Breaks Trade" text={ticket.breaksTrade} />
          </div>
        </section>

        <section className="border-t border-slate-200 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
            Catalyst / Trigger View
          </p>
          <div className="mt-3 grid gap-2">
            {ticket.triggers.map((trigger, index) => (
              <div key={trigger} className="border border-slate-200 px-4 py-3">
                <p className="text-sm leading-6 text-slate-700">
                  {index + 1}. {trigger}
                </p>
              </div>
            ))}
          </div>
        </section>

        {livePosition?.history.length ? (
          <section className="border-t border-slate-200 pt-5">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
              Trade History
            </p>
            <div className="mt-3 divide-y divide-slate-100 border border-slate-200">
              {livePosition.history.slice().reverse().map((event) => (
                <div key={event.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[90px_110px_1fr]">
                  <p className="font-semibold capitalize text-[#061b33]">
                    {event.type}
                  </p>
                  <p className="text-slate-500">{fmtPrice(event.price)}</p>
                  <p className="text-slate-700">{event.note}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

const Metric = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "positive" | "negative";
  value: string;
}) => (
  <div>
    <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
    <p
      className={cn(
        "mt-1 text-lg font-semibold text-[#061b33]",
        tone === "positive" && "text-emerald-700",
        tone === "negative" && "text-red-700",
      )}
    >
      {value}
    </p>
  </div>
);

const MetricBlock = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-slate-200 px-4 py-3">
    <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-semibold capitalize leading-6 text-[#061b33]">
      {value}
    </p>
  </div>
);

const RationaleCard = ({ text, title }: { text: string; title: string }) => (
  <div className="border border-slate-200 bg-slate-50 px-4 py-3">
    <p className="text-[11px] font-semibold uppercase text-slate-400">{title}</p>
    <p className="mt-2 text-sm leading-6 text-slate-700">{text}</p>
  </div>
);

const DeskButton = ({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
  >
    {children}
  </button>
);

"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { buildRiskGatePacket } from "@/lib/equity-risk-gate";
import { cn } from "@/lib/utils";
import type {
  EquityPmReview,
  EquityProject,
  EquityRiskGate,
  EquityRiskGateDecision,
} from "@/types/session";

interface RiskGateTabProps {
  gate: EquityRiskGate | null;
  onDecision: (decision: EquityRiskGateDecision, note: string) => void;
  pmReview: EquityPmReview | null;
  project: EquityProject | null;
}

const decisionLabel: Record<EquityRiskGateDecision, string> = {
  pending: "Pending",
  approved_to_desk: "Approved to Desk",
  reduce_size: "Reduce Size",
  monitor_first: "Monitor First",
  rejected: "Rejected",
};

const validationLabel = (value: number | null, kind: "pct" | "count") => {
  if (value === null) return "n/a";
  if (kind === "pct") return `${(value * 100).toFixed(1)}%`;
  return `${value}`;
};

const Section = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="border-t border-slate-200 py-5">
    <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-400">
      {title}
    </h2>
    <div className="mt-3">{children}</div>
  </section>
);

const ActionButton = ({
  children,
  tone,
  onClick,
}: {
  children: string;
  tone: "approve" | "reduce" | "monitor" | "reject";
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-md px-4 py-2 text-sm font-semibold transition-colors",
      tone === "approve" && "bg-[#061b33] text-white hover:bg-[#0d2b4c]",
      tone === "reduce" &&
        "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      tone === "monitor" &&
        "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
      tone === "reject" &&
        "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    )}
  >
    {children}
  </button>
);

export default function RiskGateTab({
  gate,
  onDecision,
  pmReview,
  project,
}: RiskGateTabProps) {
  const [note, setNote] = useState(gate?.note ?? "");
  const packet = useMemo(
    () => buildRiskGatePacket(project, pmReview),
    [pmReview, project],
  );

  if (!packet) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f6f7f9] px-6 text-center text-sm text-slate-500">
        Risk Gate opens after PM approves the idea to Risk.
      </div>
    );
  }

  const decision = gate?.decision ?? "pending";

  return (
    <div className="min-h-full bg-[#f6f7f9] px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl bg-white px-7 py-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Risk Gate
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#061b33]">
              How much of it can we afford?
            </h1>
          </div>
          <span
            className={cn(
              "rounded border px-3 py-1 text-xs font-semibold",
              decision === "approved_to_desk" &&
                "border-emerald-200 bg-emerald-50 text-emerald-700",
              decision === "reduce_size" &&
                "border-slate-300 bg-slate-50 text-slate-700",
              decision === "monitor_first" &&
                "border-amber-200 bg-amber-50 text-amber-700",
              decision === "rejected" &&
                "border-red-200 bg-red-50 text-red-700",
              decision === "pending" &&
                "border-slate-200 bg-slate-50 text-slate-600",
            )}
          >
            {decisionLabel[decision]}
          </span>
        </div>

        <Section title="Position Frame">
          <div className="grid gap-4 md:grid-cols-[1fr_180px_180px]">
            <div className="border border-slate-200 px-4 py-3">
              <p className="text-2xl font-semibold text-[#061b33]">
                {packet.ticker} — {packet.recommendation}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {packet.proposedTrade}
              </p>
            </div>
            <div className="border border-slate-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-slate-400">
                Conviction
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#061b33]">
                {packet.conviction.toFixed(1)}/10
              </p>
            </div>
            <div className="border border-slate-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-slate-400">
                Risk Score
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#061b33]">
                {packet.riskScore}/100
              </p>
            </div>
          </div>
        </Section>

        {packet.validation ? (
          <Section title="Prior-Window Validation">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Verdict", packet.validation.status],
                ["Lookback", `${packet.validation.lookbackDays}d`],
                ["Observations", validationLabel(packet.validation.observationCount, "count")],
                ["Median Return", validationLabel(packet.validation.medianForwardReturn, "pct")],
                ["Win Rate", validationLabel(packet.validation.winRate, "pct")],
                ["Max Drawdown", validationLabel(packet.validation.maxDrawdown, "pct")],
              ].map(([label, value]) => (
                <div key={label} className="border border-slate-200 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-400">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#061b33]">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-700">
              {packet.validation.verdict}
            </p>
          </Section>
        ) : null}

        <Section title="Risk Check">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Key Risks
              </p>
              <div className="mt-2 space-y-2">
                {packet.keyRisks.map((risk, index) => (
                  <div key={risk} className="border border-slate-200 px-4 py-3">
                    <p className="text-sm leading-6 text-slate-700">
                      {index + 1}. {risk}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Invalidation Triggers
              </p>
              <div className="mt-2 space-y-2">
                {packet.invalidationTriggers.map((trigger, index) => (
                  <div key={trigger} className="border border-slate-200 px-4 py-3">
                    <p className="text-sm leading-6 text-slate-700">
                      {index + 1}. {trigger}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Sizing">
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border border-slate-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-slate-400">
                Suggested Action
              </p>
              <p className="mt-2 text-xl font-semibold text-[#061b33]">
                {packet.suggestedAction}
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {packet.suggestedSize}
              </p>
            </div>
            <div className="border border-slate-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-slate-400">
                Major Objections
              </p>
              <div className="mt-2 space-y-2">
                {packet.majorObjections.map((objection) => (
                  <p key={objection} className="text-sm leading-6 text-slate-700">
                    {objection}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <section className="border-t border-slate-200 pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Actions
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Risk note: approve starter only, reduce to 1%, monitor first, reject on liquidity/event risk..."
            className="mt-3 min-h-24 w-full resize-y border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-[#061b33]"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              tone="approve"
              onClick={() => onDecision("approved_to_desk", note)}
            >
              Approve to Desk
            </ActionButton>
            <ActionButton
              tone="reduce"
              onClick={() => onDecision("reduce_size", note)}
            >
              Reduce Size
            </ActionButton>
            <ActionButton
              tone="monitor"
              onClick={() => onDecision("monitor_first", note)}
            >
              Monitor First
            </ActionButton>
            <ActionButton
              tone="reject"
              onClick={() => onDecision("rejected", note)}
            >
              Reject
            </ActionButton>
          </div>
        </section>
      </div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { buildPmReviewPacket } from "@/lib/equity-pm-review";
import { cn } from "@/lib/utils";
import type {
  EquityPmReview,
  EquityPmReviewDecision,
  EquityProject,
} from "@/types/session";

interface PmReviewTabProps {
  project: EquityProject | null;
  review: EquityPmReview | null;
  onDecision: (decision: EquityPmReviewDecision, note: string) => void;
}

const decisionLabel: Record<EquityPmReviewDecision, string> = {
  pending: "Pending",
  approved_to_risk: "Approved to Risk",
  revise: "Sent Back",
  rejected: "Rejected",
};

const ActionButton = ({
  children,
  tone,
  onClick,
}: {
  children: string;
  tone: "approve" | "revise" | "reject";
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-md px-4 py-2 text-sm font-semibold transition-colors",
      tone === "approve" && "bg-[#061b33] text-white hover:bg-[#0d2b4c]",
      tone === "revise" &&
        "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
      tone === "reject" &&
        "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
    )}
  >
    {children}
  </button>
);

const Section = ({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  title: string;
}) => (
  <section className="border-t border-slate-200 py-6">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
      {eyebrow}
    </p>
    <h2 className="mt-2 text-lg font-semibold text-[#061b33]">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
);

export default function PmReviewTab({
  onDecision,
  project,
  review,
}: PmReviewTabProps) {
  const [note, setNote] = useState(review?.note ?? "");
  const packet = useMemo(() => buildPmReviewPacket(project), [project]);

  if (!packet) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#f6f7f9] px-6 text-center text-sm text-slate-500">
        PM Review is available after the analyst package is ready.
      </div>
    );
  }

  const decision = review?.decision ?? "pending";

  return (
    <div className="min-h-full bg-[#f6f7f9] px-6 py-6 text-slate-950">
      <div className="mx-auto max-w-5xl bg-white px-7 py-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              PM Review
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#061b33]">
              Is this idea good enough to deserve capital?
            </h1>
          </div>
          <span
            className={cn(
              "rounded border px-3 py-1 text-xs font-semibold",
              decision === "approved_to_risk" &&
                "border-emerald-200 bg-emerald-50 text-emerald-700",
              decision === "revise" &&
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

        <Section eyebrow="1" title="Thesis Snapshot">
          <div className="grid gap-5 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-3xl font-semibold text-[#061b33]">
                {packet.ticker} — {packet.recommendation.toUpperCase()}
              </p>
              <p className="mt-4 text-base leading-7 text-slate-700">
                {packet.oneLineThesis}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
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
                  Time Horizon
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  {packet.timeHorizon}
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section eyebrow="2" title="Variant View">
          <div className="grid gap-3">
            {[
              ["Market believes", packet.marketBelieves],
              ["We believe", packet.weBelieve],
              ["Why now", packet.whyNow],
            ].map(([label, value]) => (
              <div
                key={label}
                className="grid gap-3 border border-slate-200 px-4 py-3 md:grid-cols-[160px_1fr]"
              >
                <p className="text-xs font-semibold uppercase text-slate-400">
                  {label}
                </p>
                <p className="text-sm leading-6 text-slate-700">{value}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="3" title="Kill Conditions">
          <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
            <div className="space-y-2">
              {packet.killConditions.map((condition, index) => (
                <div
                  key={condition}
                  className="flex gap-3 border border-slate-200 px-4 py-3"
                >
                  <span className="text-xs font-semibold text-slate-400">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-slate-700">
                    {condition}
                  </p>
                </div>
              ))}
            </div>
            <div className="border border-slate-200 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase text-slate-400">
                Load-bearing assumption
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {packet.loadBearingAssumption}
              </p>
            </div>
          </div>
        </Section>

        <Section eyebrow="4" title="PM Challenge">
          <div className="grid gap-2 md:grid-cols-3">
            {packet.challengeQuestions.map((question) => (
              <div
                key={question}
                className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium leading-6 text-slate-700"
              >
                {question}
              </div>
            ))}
          </div>
        </Section>

        <section className="border-t border-slate-200 pt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Actions
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Decision note: downside too loose, peer set weak, approved for risk sizing..."
            className="mt-3 min-h-24 w-full resize-y border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-800 outline-none focus:border-[#061b33]"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              tone="approve"
              onClick={() => onDecision("approved_to_risk", note)}
            >
              Approve to Risk
            </ActionButton>
            <ActionButton tone="revise" onClick={() => onDecision("revise", note)}>
              Send Back
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

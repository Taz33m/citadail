'use client';

import { type KeyboardEvent, useEffect, useRef } from "react";

import type {
  EquityProject,
  ThesisDraft,
  ThesisRecommendation,
} from "@/types/session";
import { cn } from "@/lib/utils";

const recommendationOptions: Array<{
  id: ThesisRecommendation;
  label: string;
  detail: string;
}> = [
  {
    id: "buy-long",
    label: "Buy / Long",
    detail: "Positive initial view.",
  },
  {
    id: "hold-neutral",
    label: "Hold / Neutral",
    detail: "Balanced or incomplete setup.",
  },
  {
    id: "sell-short",
    label: "Sell / Short",
    detail: "Negative initial view.",
  },
];

interface ThesisTabProps {
  draft: ThesisDraft | null;
  onChange: (draft: ThesisDraft) => void;
  onSubmit?: (draft: ThesisDraft & { recommendation: ThesisRecommendation }) => void;
  project?: EquityProject | null;
}

export default function ThesisTab({
  draft,
  onChange,
  onSubmit,
  project,
}: ThesisTabProps) {
  const rationaleRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = rationaleRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(textarea.scrollHeight, 144)}px`;
  }, [draft?.rationale]);

  if (!draft) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-50 px-6 text-center">
        <div>
          <p className="text-sm font-semibold text-gray-900">No ticker set.</p>
          <p className="mt-2 text-sm text-gray-500">
            Set a name from Coverage Desk to open a thesis.
          </p>
        </div>
      </div>
    );
  }

  const updateDraft = (patch: Partial<ThesisDraft>) => {
    onChange({
      ...draft,
      ...patch,
    });
  };
  const canSend = Boolean(draft.recommendation && draft.rationale.trim());

  const sendRationale = () => {
    if (!canSend) return;

    const submittedDraft = {
      ...draft,
      rationale: draft.rationale.trim(),
      submittedAt: new Date().toISOString(),
    } as ThesisDraft & { recommendation: ThesisRecommendation };

    onChange(submittedDraft);
    onSubmit?.(submittedDraft);
  };

  const handleRationaleKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    sendRationale();
  };

  return (
    <div className="min-h-full bg-gray-50 px-6 pb-32 pt-16 text-gray-900">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-xs font-semibold uppercase text-gray-500">
          Initial Thesis
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-mono text-2xl font-semibold text-gray-950">
              {draft.ticker}
            </h1>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Set the first house view. Evidence comes next.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
          {recommendationOptions.map((option) => {
            const isSelected = draft.recommendation === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => updateDraft({ recommendation: option.id })}
                className={cn(
                  "rounded-lg border bg-white px-4 py-4 text-left shadow-sm transition-colors focus-visible:outline-none",
                  isSelected
                    ? "border-gray-950 text-gray-950"
                    : "border-gray-200 text-gray-700 hover:border-gray-300",
                )}
              >
                <span className="block text-sm font-semibold">
                  {option.label}
                </span>
                <span className="mt-2 block text-xs leading-5 text-gray-500">
                  {option.detail}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label
            htmlFor="thesis-rationale"
            className="text-sm font-semibold text-gray-900"
          >
            Rationale
          </label>
          <textarea
            id="thesis-rationale"
            ref={rationaleRef}
            value={draft.rationale}
            onChange={(event) =>
              updateDraft({
                rationale: event.target.value,
                submittedAt: null,
              })
            }
            onKeyDown={handleRationaleKeyDown}
            placeholder="Write the initial reason for this stance."
            className="mt-3 min-h-36 w-full resize-none overflow-hidden rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-900 outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            style={{ boxShadow: "none", outline: "none" }}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span aria-hidden="true" />
            <button
              type="button"
              onClick={sendRationale}
              disabled={!canSend}
              className={cn(
                "rounded-md px-3 py-2 text-xs font-semibold transition-colors",
                canSend
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "cursor-not-allowed bg-gray-100 text-gray-400",
              )}
            >
              Send
            </button>
          </div>
          {project?.status === "generating" ? (
            <p className="mt-2 text-xs font-medium text-gray-600">
              Generating analyst package...
            </p>
          ) : project?.status === "ready" ? (
            <p className="mt-2 text-xs font-medium text-emerald-700">
              Analyst package ready. Memo, Model, and Deck tabs are available.
            </p>
          ) : project?.status === "failed" ? (
            <p className="mt-2 text-xs font-medium text-red-700">
              Package failed: {project.error}
            </p>
          ) : draft.submittedAt ? (
            <p className="mt-2 text-xs font-medium text-gray-600">
              Rationale sent.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface SignalToast {
  id: string;
  title: string;
  detail?: string;
  tone?: "navy" | "green" | "amber";
}

const toneClass: Record<NonNullable<SignalToast["tone"]>, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  navy: "border-[#b9c7da] bg-[#eef3fb] text-[#0a2259]",
};

const dotClass: Record<NonNullable<SignalToast["tone"]>, string> = {
  amber: "bg-amber-500",
  green: "bg-emerald-600",
  navy: "bg-[#0a2259]",
};

export default function SignalToastStack({
  className,
  signals,
}: {
  className?: string;
  signals: SignalToast[];
}) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => new Set());
  const visibleSignals = useMemo(
    () => signals.filter((signal) => !dismissedIds.has(signal.id)).slice(0, 4),
    [dismissedIds, signals],
  );

  if (!visibleSignals.length) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-5 top-5 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col items-end gap-2",
        className,
      )}
    >
      <AnimatePresence initial={false}>
        {visibleSignals.map((signal, index) => {
          const tone = signal.tone ?? "navy";
          return (
            <motion.div
              key={signal.id}
              className={cn(
                "pointer-events-auto w-fit max-w-full border px-3 py-2 shadow-sm backdrop-blur",
                toneClass[tone],
              )}
              initial={{ opacity: 0, x: 18, y: -6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 18, y: -4 }}
              transition={{
                delay: index * 0.06,
                duration: 0.2,
                ease: "easeOut",
              }}
            >
              <div className="flex min-w-0 items-start gap-2">
                <span
                  aria-hidden
                  className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass[tone])}
                />
                <div className="min-w-0">
                  <p className="truncate pr-5 text-xs font-semibold uppercase tracking-[0.14em]">
                    {signal.title}
                  </p>
                  {signal.detail ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 opacity-75">
                      {signal.detail}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label={`Dismiss ${signal.title}`}
                  className="ml-1 -mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center text-sm font-semibold leading-none opacity-55 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a2259]/25"
                  onClick={() => {
                    setDismissedIds((current) => {
                      const next = new Set(current);
                      next.add(signal.id);
                      return next;
                    });
                  }}
                >
                  x
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

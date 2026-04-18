import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown from "react-markdown";

import type { SessionTranscriptEntry } from "@/types/session";
import { cn } from "@/lib/utils";

interface SessionTranscriptPanelProps {
  entries: SessionTranscriptEntry[];
  preview?: SessionTranscriptEntry | null;
}

function TranscriptBubble({
  entry,
  isPreview = false,
}: {
  entry: SessionTranscriptEntry;
  isPreview?: boolean;
}) {
  return (
    <motion.div
      initial={isPreview ? { opacity: 0.72, y: 6 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "w-full rounded-[18px] border px-4 py-3",
        entry.role === "assistant"
          ? isPreview
            ? "border-amber-200/70 bg-amber-50/60"
            : "border-amber-200/80 bg-amber-50/75"
          : isPreview
            ? "border-slate-200/80 bg-slate-50/85"
            : "border-slate-200 bg-slate-50",
      )}
    >
      <div className="text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">
        <ReactMarkdown
          skipHtml
          components={{
            p: ({ children }) => (
              <p className="whitespace-pre-wrap">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-slate-900">
                {children}
              </strong>
            ),
          }}
        >
          {entry.text.replace(/\n/g, "  \n")}
        </ReactMarkdown>
      </div>
    </motion.div>
  );
}

export function SessionTranscriptPanel({
  entries,
  preview,
}: SessionTranscriptPanelProps) {
  const visibleEntries = entries.filter((entry) => entry.role !== "system");
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  const handleScroll = useCallback(() => {
    const element = scrollBodyRef.current;
    if (!element) {
      return;
    }

    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 28;
  }, []);

  useEffect(() => {
    const element = scrollBodyRef.current;
    if (!element) {
      return;
    }

    const canOverflow = element.scrollHeight > element.clientHeight + 1;
    if (!canOverflow || stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [preview?.id, preview?.role, preview?.text, visibleEntries]);

  if (visibleEntries.length === 0 && !preview) {
    return null;
  }

  return (
    <aside className="w-[25rem] max-w-[calc(100vw-2rem)] min-h-[112px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur">
      <div
        ref={scrollBodyRef}
        onScroll={handleScroll}
        className="min-h-[112px] max-h-[260px] overflow-y-auto overflow-x-hidden p-3 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {visibleEntries.map((entry) => (
              <TranscriptBubble key={entry.id} entry={entry} />
            ))}

            {preview ? (
              <TranscriptBubble key={preview.id} entry={preview} isPreview />
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}

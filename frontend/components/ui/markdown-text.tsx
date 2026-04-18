import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

interface MarkdownTextProps {
  children: string;
  className?: string;
  inline?: boolean;
}

export const MarkdownText = ({
  children,
  className,
  inline = false,
}: MarkdownTextProps) => {
  const normalized = children.trim();
  if (!normalized) {
    return null;
  }

  if (inline) {
    return (
      <ReactMarkdown
        skipHtml
        components={{
          p: ({ children: content }) => (
            <span className={cn("whitespace-pre-wrap", className)}>
              {content as ReactNode}
            </span>
          ),
          strong: ({ children: content }) => (
            <strong className="font-semibold text-slate-900">
              {content as ReactNode}
            </strong>
          ),
          em: ({ children: content }) => <em>{content as ReactNode}</em>,
          code: ({ children: content }) => (
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800">
              {content as ReactNode}
            </code>
          ),
        }}
      >
        {normalized.replace(/\n/g, "  \n")}
      </ReactMarkdown>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown
        skipHtml
        components={{
          p: ({ children: content }) => (
            <p className="whitespace-pre-wrap">{content as ReactNode}</p>
          ),
          strong: ({ children: content }) => (
            <strong className="font-semibold text-slate-900">
              {content as ReactNode}
            </strong>
          ),
          em: ({ children: content }) => <em>{content as ReactNode}</em>,
          ul: ({ children: content }) => (
            <ul className="list-disc space-y-1 pl-5">{content as ReactNode}</ul>
          ),
          ol: ({ children: content }) => (
            <ol className="list-decimal space-y-1 pl-5">{content as ReactNode}</ol>
          ),
          li: ({ children: content }) => <li>{content as ReactNode}</li>,
          code: ({ children: content }) => (
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800">
              {content as ReactNode}
            </code>
          ),
        }}
      >
        {normalized.replace(/\n/g, "  \n")}
      </ReactMarkdown>
    </div>
  );
};


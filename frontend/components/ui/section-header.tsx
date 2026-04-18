import type { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}

export const SectionHeader = ({ title, subtitle, right }: SectionHeaderProps) => {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          {title}
        </p>
        {subtitle ? (
          <div className="mt-0.5 text-[11px] text-slate-500">{subtitle}</div>
        ) : null}
      </div>
      {right}
    </div>
  );
};

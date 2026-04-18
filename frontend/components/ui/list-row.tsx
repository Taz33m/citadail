import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ListRowProps {
  children: ReactNode;
  active?: boolean;
  className?: string;
}

export const ListRow = ({ children, active = false, className }: ListRowProps) => {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-2 transition-colors",
        active ? "border-slate-900" : "hover:border-slate-300",
        className,
      )}
    >
      {children}
    </div>
  );
};

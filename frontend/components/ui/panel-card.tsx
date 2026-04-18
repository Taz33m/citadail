import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelCardProps {
  children: ReactNode;
  className?: string;
}

export const PanelCard = ({ children, className }: PanelCardProps) => {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
};

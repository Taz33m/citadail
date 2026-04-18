import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PrimaryActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "neutral" | "accent";
};

export const PrimaryAction = ({
  className,
  tone = "neutral",
  ...props
}: PrimaryActionProps) => {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300",
        "disabled:cursor-not-allowed disabled:opacity-50",
        tone === "accent"
          ? "bg-amber-500 text-white hover:bg-amber-400"
          : "bg-slate-900 text-white hover:bg-slate-700",
        className,
      )}
    />
  );
};

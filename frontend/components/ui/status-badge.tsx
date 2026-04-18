import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "active" | "ended" | "idle";
  className?: string;
}

const statusLabel: Record<StatusBadgeProps["status"], string> = {
  active: "Live",
  ended: "Ended",
  idle: "Idle",
};

export const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
        status === "active"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-200 text-slate-600",
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
};

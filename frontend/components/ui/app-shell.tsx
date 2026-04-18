import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  nav: ReactNode;
  side?: ReactNode;
  main: ReactNode;
  sideClassName?: string;
  mainClassName?: string;
}

export const AppShell = ({
  nav,
  side,
  main,
  sideClassName,
  mainClassName,
}: AppShellProps) => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      {nav}
      {side ? (
        <aside
          className={cn(
            "h-full w-[360px] overflow-y-auto border-r border-slate-200 bg-white",
            sideClassName,
          )}
        >
          {side}
        </aside>
      ) : null}
      <main className={cn("min-w-0 flex-1", mainClassName)}>{main}</main>
    </div>
  );
};

import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface NavRailItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}

interface NavRailProps {
  items: NavRailItem[];
  bottomItems?: NavRailItem[];
}

export const NavRail = ({ items, bottomItems = [] }: NavRailProps) => {
  return (
    <aside className="flex h-full w-16 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-center border-b border-slate-100">
        <Image
          src="/favicon.png"
          alt="Citadail"
          width={30}
          height={30}
          className="rounded-lg border border-slate-200 object-cover"
        />
      </div>

      <nav className="flex-1 space-y-2 px-2 py-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={item.onClick}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors",
              item.active ? "bg-slate-900 text-white" : "hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            {item.icon}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-slate-100 px-2 py-3">
        {bottomItems.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.label}
            onClick={item.onClick}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors",
              item.active ? "bg-slate-900 text-white" : "hover:bg-slate-100 hover:text-slate-800",
            )}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </aside>
  );
};

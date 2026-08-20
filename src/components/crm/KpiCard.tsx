import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "light",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "light" | "ink" | "gold";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5",
        tone === "ink" && "ink-panel",
        tone === "gold" && "border border-gold/40 bg-gold-soft text-gold-foreground shadow-soft",
        tone === "light" && "panel",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.14em]",
            tone === "ink" ? "text-ink-muted" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-xl",
              tone === "ink" ? "bg-gold/20 text-gold" : "bg-gold/15 text-gold-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
      {hint ? (
        <p className={cn("mt-1 text-xs", tone === "ink" ? "text-ink-muted" : "text-muted-foreground")}>{hint}</p>
      ) : null}
    </div>
  );
}

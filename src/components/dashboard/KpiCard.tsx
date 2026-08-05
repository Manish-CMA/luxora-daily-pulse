import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "success" | "warning";
  className?: string;
}) {
  const tones = {
    default: "bg-secondary text-secondary-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
  } as const;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 shadow-soft",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl",
              tones[tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

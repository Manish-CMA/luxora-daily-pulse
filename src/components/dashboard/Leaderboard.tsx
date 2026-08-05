import {
  Phone,
  PhoneCall,
  ClipboardList,
  ArrowRightLeft,
  Star,
  type LucideIcon,
} from "lucide-react";
import { leader, type Agent, type NumericField } from "@/lib/dashboard";

const ITEMS: { field: NumericField; title: string; icon: LucideIcon }[] = [
  { field: "callsMade", title: "Most Calls Made", icon: Phone },
  { field: "callsPicked", title: "Most Calls Picked", icon: PhoneCall },
  { field: "preTc", title: "Most Pre-TCs", icon: ClipboardList },
  { field: "preTcToTc", title: "Most Pre-TC → TC", icon: ArrowRightLeft },
  { field: "directTc", title: "Most Direct TCs", icon: Star },
];

export function Leaderboard({ agents }: { agents: Agent[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ITEMS.map(({ field, title, icon: Icon }) => {
        const winner = leader(agents, field);
        return (
          <div
            key={field}
            className="min-h-[112px] rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Icon className="size-4 text-primary" />
              {title}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3">
              <p className="break-words text-lg font-semibold tracking-tight">
                {winner ? winner.name : "—"}
              </p>
              <p className="shrink-0 text-lg font-semibold tabular-nums text-primary">
                {winner ? winner[field] : 0}
              </p>
            </div>
          </div>

        );
      })}
    </div>
  );
}

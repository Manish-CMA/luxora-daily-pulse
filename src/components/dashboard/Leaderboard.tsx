import {
  ArrowRightLeft,
  ClipboardList,
  Phone,
  PhoneCall,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import {
  agentTcsLinedUp,
  leader,
  topPerformers,
  type Agent,
  type NumericField,
} from "@/lib/dashboard";

const ITEMS: { field: NumericField; title: string; icon: LucideIcon }[] = [
  { field: "callsMade", title: "Most Calls Made", icon: Phone },
  { field: "callsPicked", title: "Most Calls Picked", icon: PhoneCall },
  { field: "preTc", title: "Most Pre-TCs", icon: ClipboardList },
  { field: "preTcToTc", title: "Most Pre-TC → TC", icon: ArrowRightLeft },
  { field: "directTc", title: "Most Direct TCs", icon: Star },
];

const RANK_STYLES = [
  "border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/20",
  "border-slate-300 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/30",
  "border-orange-300 bg-orange-50/80 dark:border-orange-900/60 dark:bg-orange-950/20",
];

export function Leaderboard({ agents }: { agents: Agent[] }) {
  const rankedAgents = topPerformers(agents, 3);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Overall Performance Ranking
        </h3>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => {
            const agent = rankedAgents[index];

            return (
              <div
                key={agent?.id ?? `empty-${index}`}
                className={`rounded-2xl border p-5 shadow-soft ${RANK_STYLES[index]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Rank {index + 1}
                    </p>
                    <p className="mt-1 truncate text-xl font-semibold tracking-tight">
                      {agent?.name ?? "Awaiting data"}
                    </p>
                  </div>

                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background/80">
                    <Trophy
                      className={
                        index === 0
                          ? "size-5 text-amber-500"
                          : index === 1
                            ? "size-5 text-slate-500"
                            : "size-5 text-orange-600"
                      }
                    />
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      TCs Lined Up
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {agent ? agentTcsLinedUp(agent) : 0}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Pre-TC → TC
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {agent?.preTcToTc ?? 0}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">Direct TC</dt>
                    <dd className="font-semibold tabular-nums">
                      {agent?.directTc ?? 0}
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Calls Picked
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {agent?.callsPicked ?? 0}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Metric Leaders
        </h3>

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
                    {winner?.name ?? "—"}
                  </p>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-primary">
                    {winner?.[field] ?? 0}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

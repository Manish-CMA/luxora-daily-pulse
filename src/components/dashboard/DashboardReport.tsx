import { forwardRef } from "react";
import { Trophy, Users, Percent, PhoneCall, Target, Sparkles } from "lucide-react";
import {
  COLUMNS,
  computeTotals,
  fmtDate,
  fmtPct,
  leader,
  topPerformer,
  topPerformers,
  agentTcsLinedUp,
  type DashboardState,
  type NumericField,
} from "@/lib/dashboard";

const LEADER_ITEMS: { field: NumericField; title: string }[] = [
  { field: "callsMade", title: "Most Calls Made" },
  { field: "callsPicked", title: "Most Calls Picked" },
  { field: "preTc", title: "Most Pre-TCs" },
  { field: "preTcToTc", title: "Most Pre-TC → TC" },
  { field: "directTc", title: "Most Direct TCs" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}

export const DashboardReport = forwardRef<HTMLDivElement, { state: DashboardState }>(
  function DashboardReport({ state }, ref) {
    const totals = computeTotals(state.agents);
    const top = topPerformer(state.agents);
    const podium = topPerformers(state.agents, 3);
    const rows = state.agents.filter((a) => a.name.trim().length > 0);
    const mostPicked = leader(state.agents, "callsPicked");
    const mostDirect = leader(state.agents, "directTc");
    const generatedAt = new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div ref={ref} className="w-full bg-background p-8">
        <header className="rounded-2xl bg-primary p-6 text-primary-foreground">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
                Operations Report
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                CureMe Abroad Operations Report
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider opacity-80">Date</p>
              <p className="text-lg font-semibold">{fmtDate(state.date)}</p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
  <Stat label="Total TCs Lined Up" value={totals.totalTcsLinedUp} />
  <Stat label="Total Calls Made" value={totals.callsMade} />
  <Stat label="Total Calls Picked Up" value={totals.callsPicked} />
  <Stat label="Pending Pre-TCs" value={totals.pendingPreTc} />
</section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-4 text-primary" /> Daily Highlights
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Total Calls Made", String(totals.callsMade)],
              ["Total Calls Picked", String(totals.callsPicked)],
              ["Pickup Rate", fmtPct(totals.pickupRate)],
              ["Total TCs Lined Up", String(totals.totalTcsLinedUp)],
              [
                "Top Performer",
                top ? `${top.name} · ${agentTcsLinedUp(top)} TCs` : "—",
              ],
              [
                "Highest Calls Picked",
                mostPicked ? `${mostPicked.name} · ${mostPicked.callsPicked}` : "—",
              ],
              [
                "Most Direct TCs",
                mostDirect ? `${mostDirect.name} · ${mostDirect.directTc}` : "—",
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-border bg-secondary/40 p-4"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className="mt-1 text-base font-semibold tracking-tight">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Agent Performance
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-secondary text-left">
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Agent
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {c.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    TCs Lined Up
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const isTop = top?.id === a.id;
                  return (
                    <tr
                      key={a.id}
                      className={`border-t border-border ${
                        isTop ? "bg-warning-soft" : "bg-card"
                      }`}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        {isTop ? "🏆 " : ""}
                        {a.name}
                      </td>
                      {COLUMNS.map((c) => (
                        <td
                          key={c.key}
                          className="px-3 py-2.5 text-right tabular-nums"
                        >
                          {a[c.key]}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                        {agentTcsLinedUp(a)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-border bg-primary-soft font-semibold">
                  <td className="px-4 py-3">Team Total</td>
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className="px-3 py-3 text-right tabular-nums text-primary"
                    >
                      {totals[c.key]}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right tabular-nums text-primary">
                    {totals.totalTcsLinedUp}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="size-4 text-primary" /> Team Summary
            </h2>
            <dl className="mt-4 space-y-2 text-sm">
  {[
    ["Calls Made", totals.callsMade],
    ["Calls Picked", totals.callsPicked],
    ["Pickup Rate", fmtPct(totals.pickupRate)],
    ["AI Bot Pre-TCs", totals.preTc],
    ["Pre-TC → TC", totals.preTcToTc],
    ["Pending Pre-TCs", totals.pendingPreTc],
    ["Direct TC", totals.directTc],
    ["Total TCs Lined Up", totals.totalTcsLinedUp],
    ["Active Agents", rows.length],
  ].map(([k, v]) => (
                <div
                  key={String(k)}
                  className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0"
                >
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Percent className="size-4 text-primary" /> Conversion Rates
            </h2>
            <div className="mt-4 space-y-4">
              {[
                { label: "Pickup Rate", value: totals.pickupRate, tone: "bg-primary" },
                {
                  label: "Pre-TC → TC",
                  value: totals.preTcToTcRate,
                  tone: "bg-success",
                },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-semibold tabular-nums">
                      {fmtPct(r.value)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={`h-full rounded-full ${r.tone}`}
                      style={{ width: `${Math.min(100, r.value)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Trophy className="size-4 text-warning" /> Top 3 Podium
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => {
              const a = podium[i];
              return (
                <div
                  key={i}
                  className={`rounded-2xl border border-border p-5 ${
                    i === 0 ? "bg-warning-soft" : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl leading-none">{MEDALS[i]}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Rank {i + 1}
                      </p>
                      <p className="text-lg font-semibold tracking-tight">
                        {a ? a.name : "—"}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">
                        <Target className="mr-1 inline size-3.5" />
                        TCs Lined Up
                      </dt>
                      <dd className="font-semibold tabular-nums">
                        {a ? agentTcsLinedUp(a) : 0}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">
                        <PhoneCall className="mr-1 inline size-3.5" />
                        Calls Picked
                      </dt>
                      <dd className="font-semibold tabular-nums">
                        {a ? a.callsPicked : 0}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">Pre-TC → TC</dt>
                      <dd className="font-semibold tabular-nums">
                        {a ? a.preTcToTc : 0}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Daily Leaderboard
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEADER_ITEMS.map(({ field, title }) => {
              const w = leader(state.agents, field);
              return (
                <div
                  key={field}
                  className="min-h-[104px] rounded-xl border border-border bg-card p-5"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {title}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="break-words font-semibold">
                      {w ? w.name : "—"}
                    </span>
                    <span className="shrink-0 text-lg font-semibold tabular-nums text-primary">
                      {w ? w[field] : 0}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Generated by CureMe Abroad Operations Hub · {generatedAt} · Confidential
          internal report
        </footer>
      </div>
    );
  },
);

import { forwardRef } from "react";
import {
  Percent,
  PhoneCall,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";

import {
  COLUMNS,
  agentTcsLinedUp,
  activeHumanAgents,
  computeTotals,
  fmtDate,
  fmtPct,
  leader,
  topPerformer,
  topPerformers,
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

export const DashboardReport = forwardRef<
  HTMLDivElement,
  { state: DashboardState }
>(function DashboardReport({ state }, ref) {
  const totals = computeTotals(state.agents, state.tcScheduled, state.tcDone);
  const top = topPerformer(state.agents);
  const podium = topPerformers(state.agents, 3);
  const rows = state.agents.filter((agent) => agent.name.trim().length > 0);
  const activeAgents = activeHumanAgents(state.agents);

  const reportDate = new Date(`${state.date}T00:00:00`);
  const shortDate = Number.isNaN(reportDate.getTime())
    ? state.date
    : reportDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });

  const generatedAt = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const highlights: Array<[string, string]> = [
    ["Total Calls Made", String(totals.callsMade)],
    ["Total Calls Picked", String(totals.callsPicked)],
    ["Pickup Rate", fmtPct(totals.pickupRate)],
    ["Total Pre-TCs", String(totals.preTc)],
    ["Pre-TC → TC", String(totals.preTcToTc)],
    ["Pending Pre-TCs", String(totals.pendingPreTc)],
    ["Direct TCs", String(totals.directTc)],
    [`TC Scheduled on ${shortDate}`, String(totals.totalTcScheduled)],
    ["TC Done", String(totals.totalTcDone)],
    ["TC Completion Rate", fmtPct(totals.tcCompletionRate)],
    [
      "Top Performer",
      top ? `${top.name} · ${agentTcsLinedUp(top)} TCs lined up` : "—",
    ],
  ];

  return (
    <div ref={ref} className="w-full bg-background p-8">
      <header className="rounded-2xl bg-primary p-6 text-primary-foreground">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">
              Operations Report
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              CureMeAbroad Operations Report
            </h1>
          </div>

          <div className="text-right">
            <p className="text-xs uppercase tracking-wider opacity-80">Date</p>
            <p className="text-lg font-semibold">{fmtDate(state.date)}</p>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`TCs Lined Up on ${shortDate}`}
          value={totals.totalTcsLinedUp}
        />
        <Stat label="TC Scheduled" value={totals.totalTcScheduled} />
        <Stat label="TC Done" value={totals.totalTcDone} />
        <Stat
          label="TC Completion Rate"
          value={fmtPct(totals.tcCompletionRate)}
        />
      </section>

      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-4 text-primary" />
          Daily Highlights
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map(([label, value]) => (
            <div
              key={label}
              className={
                label === "Pending Pre-TCs"
                  ? "rounded-xl border border-red-200 bg-red-50 p-4"
                  : "rounded-xl border border-border bg-secondary/40 p-4"
              }
            >
              <p
                className={`text-[11px] font-medium uppercase tracking-wider ${
                  label === "Pending Pre-TCs"
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </p>
              <p
                className={`mt-1 text-base font-semibold tracking-tight ${
                  label === "Pending Pre-TCs" ? "text-red-700" : ""
                }`}
              >
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
          <table className="w-full table-fixed border-collapse text-xs">
            <thead>
              <tr className="bg-secondary text-left">
                <th className="w-32 px-3 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Agent
                </th>

                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    className="px-2 py-3 text-right text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground"
                  >
                    {column.label}
                  </th>
                ))}

                <th className="px-2 py-3 text-right text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                  TCs Lined Up
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((agent) => {
                const isTop = top?.id === agent.id;

                return (
                  <tr
                    key={agent.id}
                    className={`border-t border-border ${
                      isTop ? "bg-warning-soft" : "bg-card"
                    }`}
                  >
                    <td className="px-3 py-2.5 font-medium">
                      {isTop ? "🏆 " : ""}
                      {agent.name}
                    </td>

                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className="px-2 py-2.5 text-right tabular-nums"
                      >
                        {agent[column.key] ?? 0}
                      </td>
                    ))}

                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-primary">
                      {agentTcsLinedUp(agent)}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr className="border-t border-border bg-card">
                  <td
                    colSpan={COLUMNS.length + 2}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No agent performance data available.
                  </td>
                </tr>
              ) : null}

              <tr className="border-t-2 border-border bg-primary-soft font-semibold">
                <td className="px-3 py-3">Team Total</td>

                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="px-2 py-3 text-right tabular-nums text-primary"
                  >
                    {totals[column.key]}
                  </td>
                ))}

                <td className="px-2 py-3 text-right tabular-nums text-primary">
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
            <Users className="size-4 text-primary" />
            Team Summary
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
              [`TCs Lined Up on ${shortDate}`, totals.totalTcsLinedUp],
              ["TC Scheduled", totals.totalTcScheduled],
              ["TC Done", totals.totalTcDone],
              ["TC Completion Rate", fmtPct(totals.tcCompletionRate)],
              ["Active Agents", activeAgents.length],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <Percent className="size-4 text-primary" />
            Conversion Rates
          </h2>

          <div className="mt-4 space-y-4">
            {[
              {
                label: "Pickup Rate",
                value: totals.pickupRate,
                tone: "bg-primary",
              },
              {
                label: "Pre-TC → TC",
                value: totals.preTcToTcRate,
                tone: "bg-success",
              },
              {
                label: "TC Completion Rate",
                value: totals.tcCompletionRate,
                tone: "bg-success",
              },
            ].map((rate) => (
              <div key={rate.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{rate.label}</span>
                  <span className="font-semibold tabular-nums">
                    {fmtPct(rate.value)}
                  </span>
                </div>

                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full ${rate.tone}`}
                    style={{ width: `${Math.min(100, rate.value)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Trophy className="size-4 text-warning" />
          Top 3 Podium
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {podium.map((agent, index) => {
            return (
              <div
                key={index}
                className={`rounded-2xl border border-border p-5 ${
                  index === 0 ? "bg-warning-soft" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl leading-none">{MEDALS[index]}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Rank {index + 1}
                    </p>
                    <p className="truncate text-lg font-semibold tracking-tight">
                      {agent.name}
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
                      {agentTcsLinedUp(agent)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Pre-TC → TC</dt>
                    <dd className="font-semibold tabular-nums">
                      {agent.preTcToTc}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Direct TC</dt>
                    <dd className="font-semibold tabular-nums">
                      {agent.directTc}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">
                      <PhoneCall className="mr-1 inline size-3.5" />
                      Calls Picked
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {agent.callsPicked}
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
            const winner = leader(state.agents, field);

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
                    {winner ? winner.name : "—"}
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums text-primary">
                    {winner ? (winner[field] ?? 0) : 0}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-muted-foreground">
        Generated by CureMeAbroad Operations Hub · {generatedAt} IST ·
        Confidential internal report
      </footer>
    </div>
  );
});

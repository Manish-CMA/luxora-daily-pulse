import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CalendarIcon,
  Phone,
  PhoneCall,
  ClipboardList,
  ArrowRightLeft,
  Percent,
  Target,
  Trophy,
  CalendarDays,
  CheckCircle2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import {
  COLUMNS,
  agentTcsLinedUp,
  activeHumanAgents,
  aggregateAgents,
  computeTotals,
  fmtDate,
  fmtPct,
  todayIso,
  topPerformer,
} from "@/lib/dashboard";
import { getReports, onStoreChange, type SavedReport } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports | CureMeAbroad TC Dashboard" },
      {
        name: "description",
        content:
          "Daily, weekly, monthly and custom-range teleconsultation reports with team summaries, conversion rates and leaderboards.",
      },
      { property: "og:title", content: "Reports — CureMeAbroad TC Dashboard" },
      {
        property: "og:description",
        content:
          "Analyse TC performance across any period with automatic totals and leaderboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

type Preset = "daily" | "weekly" | "monthly" | "custom";

const shift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
};

const csvCell = (value: string | number) =>
  `"${String(value).replace(/"/g, '""')}"`;

function downloadPeriodCsv(reports: SavedReport[], from: string, to: string) {
  const headers = [
    "Date",
    "Reports Included",
    "Calls Made",
    "Calls Picked",
    "Pickup Rate",
    "TCs Aligned",
    "TCs Lined Up",
    "TC Scheduled",
    "TC Done",
    "TC Completion Rate",
  ];

  const dataRows = [...reports]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((report) => {
      const totals = computeTotals(
        report.agents,
        report.tcScheduled,
        report.tcDone,
      );

      return [
        format(new Date(`${report.date}T00:00:00`), "dd/MM/yyyy"),
        1,
        totals.callsMade,
        totals.callsPicked,
        fmtPct(totals.pickupRate),
        totals.directTc,
        totals.totalTcsLinedUp,
        totals.totalTcScheduled,
        totals.totalTcDone,
        fmtPct(totals.tcCompletionRate),
      ];
    });

  const csv = [headers, ...dataRows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `CureMe-Abroad-Reports-${from}-to-${to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DatePick({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (iso: string) => void;
  label: string;
}) {
  const d = value ? new Date(`${value}T00:00:00`) : undefined;
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start rounded-xl text-left font-normal",
              !d && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4" />
            {d ? format(d, "PPP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={d}
            onSelect={(nd) => nd && onChange(format(nd, "yyyy-MM-dd"))}
            initialFocus
            className={cn("pointer-events-auto p-3")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReportsPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [preset, setPreset] = useState<Preset>("daily");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());

  useEffect(() => {
    setReports(getReports());
    return onStoreChange(() => setReports(getReports()));
  }, []);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const today = todayIso();
    if (p === "daily") {
      setFrom(today);
      setTo(today);
    } else if (p === "weekly") {
      setFrom(shift(today, -6));
      setTo(today);
    } else if (p === "monthly") {
      setFrom(shift(today, -29));
      setTo(today);
    }
  };

  const range = useMemo(() => {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    return reports.filter((r) => r.date >= lo && r.date <= hi);
  }, [reports, from, to]);

  const periodAgents = useMemo(
    () => aggregateAgents(range.map((r) => r.agents)),
    [range],
  );
  const totals = useMemo(
    () =>
      computeTotals(
        periodAgents,
        range.reduce((sum, report) => sum + (report.tcScheduled || 0), 0),
        range.reduce((sum, report) => sum + (report.tcDone || 0), 0),
      ),
    [periodAgents, range],
  );
  const overallTop = useMemo(() => topPerformer(periodAgents), [periodAgents]);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const selected =
    range.find((r) => r.date === selectedDate) ?? range[0] ?? undefined;
  const dayTop = useMemo(
    () => (selected ? topPerformer(selected.agents) : null),
    [selected],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        actions={
          <Button
            variant="outline"
            className="rounded-xl"
            disabled={range.length === 0}
            onClick={() => downloadPeriodCsv(range, from, to)}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        }
      />
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reports</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {range.length} submitted report{range.length === 1 ? "" : "s"} in
            the selected period.
          </p>
        </div>

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft lg:grid-cols-[auto_1fr_1fr_1fr]">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Period
            </Label>
            <div className="flex flex-wrap gap-2">
              {(["daily", "weekly", "monthly", "custom"] as Preset[]).map(
                (p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? "default" : "outline"}
                    className="rounded-xl capitalize"
                    onClick={() => applyPreset(p)}
                  >
                    {p === "custom" ? "Custom Range" : p}
                  </Button>
                ),
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Selected Report
            </Label>
            <select
              value={selected?.date ?? ""}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              {range.length === 0 ? <option value="">No reports</option> : null}
              {range.map((r) => (
                <option key={r.date} value={r.date}>
                  {fmtDate(r.date)}
                </option>
              ))}
            </select>
          </div>
          <DatePick
            label="From"
            value={from}
            onChange={(v) => {
              setFrom(v);
              setPreset("custom");
            }}
          />
          <DatePick
            label="To"
            value={to}
            onChange={(v) => {
              setTo(v);
              setPreset("custom");
            }}
          />
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            label="Total Calls Made"
            value={totals.callsMade}
            icon={Phone}
            tone="primary"
          />
          <KpiCard
            label="Calls Picked"
            value={totals.callsPicked}
            icon={PhoneCall}
            tone="primary"
          />
          <KpiCard label="TCs Aligned" value={totals.directTc} icon={Target} tone="success" />
          <KpiCard
            label="Total TCs Lined Up"
            value={totals.totalTcsLinedUp}
            icon={Target}
            tone="default"
          />
          <KpiCard
            label="TC Scheduled"
            value={totals.totalTcScheduled}
            icon={CalendarDays}
            tone="primary"
          />
          <KpiCard
            label="TC Done"
            value={totals.totalTcDone}
            icon={CheckCircle2}
            tone="success"
          />
          <KpiCard
            label="Pickup Rate"
            value={fmtPct(totals.pickupRate)}
            icon={Percent}
            tone="primary"
          />
          <KpiCard
            label="TC Completion Rate"
            value={fmtPct(totals.tcCompletionRate)}
            icon={Percent}
            tone="success"
          />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Team Summary
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Reports Included", range.length],
                ["TCs Aligned", totals.directTc],
                ["Total TCs Lined Up", totals.totalTcsLinedUp],
                ["TC Scheduled", totals.totalTcScheduled],
                ["TC Done", totals.totalTcDone],
                ["TC Completion Rate", fmtPct(totals.tcCompletionRate)],
                ["Active Agents", activeHumanAgents(periodAgents).length],
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

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Conversion Rates
            </h3>
            <div className="mt-4 space-y-4">
              {[
                {
                  label: "Pickup Rate",
                  value: totals.pickupRate,
                  tone: "bg-primary",
                },
                {
                  label: "TC Completion Rate",
                  value: totals.tcCompletionRate,
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

        <section className="grid gap-6 lg:grid-cols-2">
          {[
            {
              title: "Top Performer (Selected Report)",
              sub: selected ? fmtDate(selected.date) : "No report in range",
              agent: dayTop,
            },
            {
              title: "Overall Top Performer",
              sub: `${fmtDate(from)} → ${fmtDate(to)}`,
              agent: overallTop,
            },
          ].map((c) => (
            <div
              key={c.title}
              className="flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-card p-6 shadow-lift"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-warning-soft">
                <Trophy className="size-7 text-warning" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">
                  {c.title}
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {c.agent ? c.agent.name : "—"}
                </p>
                <p className="text-xs text-muted-foreground">{c.sub}</p>
                {c.agent ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    TCs Lined Up:{" "}
                    <b className="text-foreground">
                      {agentTcsLinedUp(c.agent)}
                    </b>
                    {" · "}Calls Picked:{" "}
                    <b className="text-foreground">{c.agent.callsPicked}</b>
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Period Leaderboard
          </h3>
          <Leaderboard agents={periodAgents} />
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Agent Totals
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
            <table className="w-full min-w-[1400px] border-collapse text-sm">
              <thead>
                <tr className="bg-secondary/60 text-left">
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
                {periodAgents.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-4 py-2.5 font-medium">{a.name}</td>
                    {COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className="px-3 py-2.5 text-right tabular-nums"
                      >
                        {a[c.key]}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
                      {agentTcsLinedUp(a)}
                    </td>
                  </tr>
                ))}
                {periodAgents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 2}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      No submitted reports in this period.
                    </td>
                  </tr>
                ) : null}
                {periodAgents.length > 0 ? (
                  <tr className="border-t-2 border-border bg-secondary/70 font-semibold">
                    <td className="px-4 py-3">Team Total</td>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.key}
                        className="px-3 py-3 text-right tabular-nums text-primary"
                      >
                        {totals[column.key]}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right tabular-nums text-primary">
                      {totals.totalTcsLinedUp}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

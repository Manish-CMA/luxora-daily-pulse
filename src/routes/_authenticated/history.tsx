import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { computeTotals, fmtDate } from "@/lib/dashboard";
import {
  deleteReport,
  getReports,
  onStoreChange,
  reportStatus,
  STATUS_LABEL,
  type SavedReport,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Report History | CureMe Abroad Operations Hub" },
      {
        name: "description",
        content:
          "Browse every submitted daily TC report with status, submitter, editor and totals, filtered by date or search.",
      },
      {
        property: "og:title",
        content: "Report History — CureMe Abroad Operations Hub",
      },
      {
        property: "og:description",
        content:
          "Searchable history of daily teleconsultation reports with submission and edit audit details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function StatusBadge({ report }: { report: SavedReport }) {
  const status = reportStatus(report);
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "submitted" && "bg-success-soft text-success",
        status === "edited" && "bg-warning-soft text-warning",
        status === "draft" && "bg-secondary text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function HistoryPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    setReports(getReports());
    return onStoreChange(() => setReports(getReports()));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports
      .filter((r) => (from ? r.date >= from : true))
      .filter((r) => (to ? r.date <= to : true))
      .filter((r) => {
        if (!q) return true;
        return [
          r.date,
          r.submittedBy ?? "",
          r.lastEditedBy ?? "",
          STATUS_LABEL[reportStatus(r)],
          ...r.agents.map((a) => a.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .map((r) => ({ report: r, totals: computeTotals(r.agents) }));
  }, [reports, query, from, to]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-red-600">
  REPORT HISTORY TEST 123
</h2>
          <p className="text-sm text-muted-foreground">
            Every saved daily report with its status and audit trail.
          </p>
        </div>

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:grid-cols-3">
          <div className="space-y-2">
            <Label
              htmlFor="history-search"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Search
            </Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="history-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Date, status, submitter, agent…"
                className="h-10 rounded-xl pl-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="history-from"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              From
            </Label>
            <Input
              id="history-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="history-to"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              To
            </Label>
            <Input
              id="history-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="bg-secondary/60 text-left">
                  {[
  "Date",
  "Status",
  "Submitted By",
  "Submitted Time",
  "Last Edited By",
  "Last Edited Time",
  "Total Calls",
  "TCs Lined Up",
  "Actions",
].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ report, totals }) => (
                  <tr
                    key={report.date}
                    className="border-t border-border transition-colors hover:bg-secondary/40"
                  >
                    <td className="px-4 py-3 font-medium">
                      {fmtDate(report.date)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge report={report} />
                    </td>
                    <td className="px-4 py-3">{report.submittedBy || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {report.submittedAt
                        ? format(new Date(report.submittedAt), "PPp")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{report.lastEditedBy || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {report.lastEditedAt
                        ? format(new Date(report.lastEditedAt), "PPp")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
  {totals.callsMade}
</td>

<td className="px-4 py-3 font-semibold tabular-nums text-primary">
  {totals.totalTcsLinedUp}
</td>

<td className="px-4 py-3">
  <button
    onClick={() => {
      if (
        window.confirm(
          `Delete the report for ${fmtDate(report.date)}? This cannot be undone.`,
        )
      ) {
        deleteReport(report.date);
      }
    }}
    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-white hover:bg-red-700"
  >
    <Trash2 className="size-4" />
    Delete
  </button>
</td>
</tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      No reports match the current filters.
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

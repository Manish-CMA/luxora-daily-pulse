import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { fmtDate } from "@/lib/dashboard";
import {
  clearAllData,
  deleteReport,
  getReports,
  onStoreChange,
  type SavedReport,
} from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings | CureMeAbroad TC Dashboard" },
      {
        name: "description",
        content:
          "Review submitted daily report history and manage shared CureMeAbroad dashboard data.",
      },
      { property: "og:title", content: "Settings — CureMeAbroad TC Dashboard" },
      {
        property: "og:description",
        content: "Manage shared reports and dashboard data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);

  useEffect(() => {
    setReports(getReports());
    return onStoreChange(() => setReports(getReports()));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <AppHeader />
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All data is stored securely in the cloud and shared across your team.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <Database className="size-4 text-primary" /> Submitted Reports
            </h3>
            <span className="text-xs text-muted-foreground">{reports.length} stored</span>
          </div>
          <ul className="divide-y divide-border">
            {reports.map((r) => (
              <li key={r.date} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{fmtDate(r.date)}</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted {new Date(r.submittedAt).toLocaleString("en-GB")}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete report for ${r.date}`}
                  className="size-9 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    deleteReport(r.date);
                    toast.success("Report deleted");
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
            {reports.length === 0 ? (
              <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                No reports submitted yet.
              </li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-destructive/30 bg-card p-5 shadow-soft">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-destructive">
            Danger Zone
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear all submitted reports and the current draft. Agents are kept.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="mt-4 rounded-xl">
                <Trash2 className="size-4" /> Clear All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all report data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes every submitted report and the current draft from this
                  browser.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    clearAllData();
                    toast.success("All report data cleared");
                  }}
                >
                  Clear
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>
      </main>
    </div>
  );
}

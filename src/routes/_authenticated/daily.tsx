import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  CalendarIcon,
  Phone,
  PhoneCall,
  ClipboardList,
  ArrowRightLeft,
  Star,
  Percent,
  Trophy,
  LayoutDashboard,
  Download,
  FileText,
  Copy,
  Printer,
  Target,
  Save,
  Pencil,
  FilePen,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AgentTable } from "@/components/dashboard/AgentTable";
import { Leaderboard } from "@/components/dashboard/Leaderboard";
import { DashboardReport } from "@/components/dashboard/DashboardReport";
import {
  agentTcsLinedUp,
  computeTotals,
  defaultState,
  fmtDate,
  fmtPct,
  topPerformer,
  type Agent,
  type DashboardState,
} from "@/lib/dashboard";
import {
  DRAFT_KEY,
  getReportByDate,
  getRoster,
  getSubmitterName,
  onStoreChange,
  reportStatus,
  saveReport,
  STATUS_LABEL,
  syncAgentsWithRoster,
  validateReport,
  type SavedReport,
} from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/daily")({
  head: () => ({
    meta: [
      { title: "New Daily Report | CureMeAbroad TC Dashboard" },
      {
        name: "description",
        content:
          "Enter daily teleconsultation coordinator performance, submit the report and generate a shareable operations dashboard.",
      },
      {
        property: "og:title",
        content: "New Daily Report — CureMeAbroad TC Dashboard",
      },
      {
        property: "og:description",
        content:
          "Daily TC performance entry with automatic KPIs, conversion rates and leaderboards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DailyPage,
});

function DailyPage() {
  const [state, setState] = useState<DashboardState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<SavedReport | null>(null);
  const [submittedBy, setSubmittedBy] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const applySaved = useCallback((existing: SavedReport | undefined) => {
    setSaved(existing ?? null);
    setSubmitted(Boolean(existing));
    setLocked(Boolean(existing));
    setEditing(false);
  }, []);

  // Hydrate draft + roster
  useEffect(() => {
    let draft = defaultState();
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DashboardState;
        if (parsed && Array.isArray(parsed.agents)) {
          draft = {
            ...defaultState(),
            ...parsed,
            agents: parsed.agents,
            tcScheduled: Number(parsed.tcScheduled) || 0,
            tcDone: Number(parsed.tcDone) || 0,
          };
        }
      }
    } catch {
      /* ignore */
    }
    const existing = getReportByDate(draft.date);
    if (existing) {
      setState(existing);
    } else {
      draft.agents = syncAgentsWithRoster(getRoster(), draft.agents);
      setState(draft);
    }
    applySaved(existing);
    setSubmittedBy(existing?.submittedBy ?? getSubmitterName());
    setHydrated(true);
  }, [applySaved]);

  // Keep entry table in sync with the roster
  useEffect(() => {
    if (!hydrated) return;
    return onStoreChange(() => {
      if (locked) return;
      setState((s) => ({
        ...s,
        agents: syncAgentsWithRoster(getRoster(), s.agents),
      }));
    });
  }, [hydrated, locked]);

  useEffect(() => {
    if (!hydrated || locked) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  }, [state, hydrated, locked]);

  const totals = useMemo(
    () => computeTotals(state.agents, state.tcScheduled, state.tcDone),
    [state.agents, state.tcScheduled, state.tcDone],
  );
  const top = useMemo(() => topPerformer(state.agents), [state.agents]);
  const status = submitted ? reportStatus(saved) : "draft";

  const updateAgent = useCallback((id: string, patch: Partial<Agent>) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const updateTcTotal = useCallback(
    (field: "tcScheduled" | "tcDone", rawValue: string) => {
      const digits = rawValue.replace(/\D/g, "");
      const value = Number(digits || 0);
      setState((current) => ({
        ...current,
        [field]: Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER,
      }));
    },
    [],
  );

  const commit = (mode: "submit" | "edit") => {
    saveReport(state, submittedBy, mode);
    applySaved(getReportByDate(state.date));
    toast.success(
      mode === "edit"
        ? `Report updated for ${fmtDate(state.date)}`
        : `Report submitted for ${fmtDate(state.date)}`,
    );
  };

  const openExisting = () => {
    const existing = getReportByDate(state.date);
    setConfirmOverwrite(false);
    if (!existing) return;
    setState(existing);
    setSubmittedBy(existing.submittedBy ?? submittedBy);
    applySaved(existing);
    toast.info(`Opened existing report for ${fmtDate(existing.date)}`);
  };

  const submitReport = () => {
    const errors = validateReport(state);
    if (!submittedBy.trim()) {
      toast.error("Please enter your name in \u201cSubmitted by\u201d.");
      return;
    }
    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }
    const existing = getReportByDate(state.date);
    if (existing && !editing) {
      setConfirmOverwrite(true);
      return;
    }
    commit(editing ? "edit" : "submit");
  };

  const startEditing = () => {
    setConfirmEdit(false);
    setLocked(false);
    setEditing(true);
    setState((current) => ({
      ...current,
      agents: syncAgentsWithRoster(getRoster(), current.agents),
    }));
    toast.info("Report unlocked for editing.");
  };

  const canvasOf = async () => {
    const node = reportRef.current;
    if (!node) throw new Error("Report not ready");
    const { default: html2canvas } = await import("html2canvas-pro");
    return html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
  };

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      toast.error("Something went wrong while exporting.");
    } finally {
      setBusy(null);
    }
  };

  const fileBase = `CureMe-Abroad-TC-Dashboard-${state.date}`;

  const downloadPng = () =>
    withBusy("png", async () => {
      const canvas = await canvasOf();
      const link = document.createElement("a");
      link.download = `${fileBase}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("PNG downloaded");
    });

  const downloadPdf = () =>
    withBusy("pdf", async () => {
      const canvas = await canvasOf();
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      const img = canvas.toDataURL("image/png");
      let remaining = imgH;
      let position = 0;
      while (remaining > 0) {
        pdf.addImage(img, "PNG", 0, position, pw, imgH);
        remaining -= ph;
        if (remaining > 0) {
          position -= ph;
          pdf.addPage();
        }
      }
      pdf.save(`${fileBase}.pdf`);
      toast.success("PDF downloaded");
    });

  const copyDashboard = () =>
    withBusy("copy", async () => {
      const canvas = await canvasOf();
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/png"),
      );
      if (!blob) throw new Error("No image");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      toast.success("Dashboard copied to clipboard");
    });

  const printDashboard = () => window.print();

  const selectedDate = state.date
    ? new Date(`${state.date}T00:00:00`)
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      <AppHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {locked ? (
              <Button
                onClick={() => setConfirmEdit(true)}
                variant="outline"
                className="rounded-xl"
              >
                <Pencil className="size-4" /> Edit Report
              </Button>
            ) : (
              <Button onClick={submitReport} className="rounded-xl shadow-soft">
                <Save className="size-4" />{" "}
                {editing ? "Save Changes" : "Submit Daily Report"}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!submitted}
              onClick={() => setOpen(true)}
              className="rounded-xl"
            >
              <LayoutDashboard className="size-4" /> Generate Dashboard
            </Button>
          </div>
        }
      />

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                status === "submitted" && "bg-success-soft text-success",
                status === "edited" && "bg-warning-soft text-warning",
                status === "draft" && "bg-secondary text-muted-foreground",
              )}
            >
              {status === "draft" ? (
                <FilePen className="size-3.5" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {STATUS_LABEL[status]}
            </span>
            {submitted ? (
              <p className="text-sm font-medium text-success">
                Report Submitted Successfully
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Draft — not submitted yet.
              </p>
            )}
            {locked ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="size-3.5" /> Locked
              </span>
            ) : null}
          </div>
          {saved ? (
            <div className="grid gap-x-8 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
              <span>
                Submitted by{" "}
                <b className="text-foreground">{saved.submittedBy || "—"}</b>
              </span>
              <span>
                Submitted{" "}
                <b className="text-foreground">
                  {format(new Date(saved.submittedAt), "PPp")}
                </b>
              </span>
              <span>
                Last edited by{" "}
                <b className="text-foreground">{saved.lastEditedBy || "—"}</b>
              </span>
              <span>
                Last edited{" "}
                <b className="text-foreground">
                  {saved.lastEditedAt
                    ? format(new Date(saved.lastEditedAt), "PPp")
                    : "—"}
                </b>
              </span>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start rounded-xl text-left font-normal",
                    !selectedDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="size-4" />
                  {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (!d) return;
                    const date = format(d, "yyyy-MM-dd");
                    const existing = getReportByDate(date);
                    if (existing) {
                      setState({
                        ...existing,
                        agents: syncAgentsWithRoster(
                          getRoster(),
                          existing.agents,
                        ),
                      });
                      setSubmittedBy(existing.submittedBy ?? submittedBy);
                    } else {
                      setState({
                        date,
                        agents: syncAgentsWithRoster(getRoster(), []),
                        tcScheduled: 0,
                        tcDone: 0,
                      });
                    }
                    applySaved(existing);
                  }}
                  initialFocus
                  className={cn("pointer-events-auto p-3")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="submitted-by"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Submitted By
            </Label>
            <Input
              id="submitted-by"
              value={submittedBy}
              maxLength={60}
              disabled={locked}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="Your name"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Total TCs Lined Up (auto)
            </Label>
            <div className="flex h-10 items-center rounded-xl border border-border bg-secondary/50 px-3 text-sm font-semibold tabular-nums">
              {totals.totalTcsLinedUp}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Pre-TC → TC + Direct TC
              </span>
            </div>
          </div>
        </section>

        <AgentTable
          agents={state.agents}
          onChange={updateAgent}
          readOnly={locked}
        />

        <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Daily TC Totals
            </h2>
            <p className="text-xs text-muted-foreground">
              Enter one total for the entire team. No agent assignment.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="tc-scheduled-total">TC Scheduled</Label>
              <Input
                id="tc-scheduled-total"
                inputMode="numeric"
                pattern="[0-9]*"
                min={0}
                readOnly={locked}
                value={String(state.tcScheduled ?? 0)}
                onChange={(event) =>
                  updateTcTotal("tcScheduled", event.target.value)
                }
                className="h-12 rounded-xl text-center text-lg font-semibold tabular-nums"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tc-done-total">TC Done</Label>
              <Input
                id="tc-done-total"
                inputMode="numeric"
                pattern="[0-9]*"
                min={0}
                readOnly={locked}
                value={String(state.tcDone ?? 0)}
                onChange={(event) =>
                  updateTcTotal("tcDone", event.target.value)
                }
                className="h-12 rounded-xl text-center text-lg font-semibold tabular-nums"
              />
            </div>
          </div>
        </section>

        {/* KPIs */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Key Metrics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Total Calls Made"
              value={totals.callsMade}
              icon={Phone}
              tone="primary"
            />
            <KpiCard
              label="Calls Picked Up"
              value={totals.callsPicked}
              icon={PhoneCall}
              tone="primary"
            />
            <KpiCard
              label="Total Pre-TCs"
              value={totals.preTc}
              icon={ClipboardList}
              tone="default"
            />
            <KpiCard
              label="Pending Pre-TC"
              value={totals.pendingPreTc}
              sub="Pre-TC not yet converted"
              icon={ClipboardList}
              tone="warning"
            />
            <KpiCard
              label="Pre-TC → TC"
              value={totals.preTcToTc}
              icon={ArrowRightLeft}
              tone="success"
            />
            <KpiCard
              label="Direct TC"
              value={totals.directTc}
              icon={Star}
              tone="warning"
            />
            <KpiCard
              label="Total TCs Lined Up"
              value={totals.totalTcsLinedUp}
              sub="Pre-TC → TC + Direct TC"
              icon={Target}
              tone="default"
            />
            <KpiCard
              label="TC Scheduled"
              value={totals.totalTcScheduled}
              sub="Appointments scheduled"
              icon={CalendarIcon}
              tone="primary"
            />
            <KpiCard
              label="TC Done"
              value={totals.totalTcDone}
              sub="Completed teleconsultations"
              icon={CheckCircle2}
              tone="success"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label="Pickup Rate"
              value={fmtPct(totals.pickupRate)}
              sub="Calls Picked / Calls Made"
              icon={Percent}
              tone="primary"
            />
            <KpiCard
              label="Pre-TC → TC Rate"
              value={fmtPct(totals.preTcToTcRate)}
              sub="Pre-TC→TC / Pre-TC"
              icon={Percent}
              tone="success"
            />
            <KpiCard
              label="TC Completion Rate"
              value={fmtPct(totals.tcCompletionRate)}
              sub="TC Done / TC Scheduled"
              icon={Percent}
              tone="success"
            />
          </div>
        </section>

        {/* Top performer */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
          <div className="flex flex-wrap items-center gap-5 p-6">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-warning-soft">
              <Trophy className="size-8 text-warning" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-warning">
                Top Performer (Selected Day)
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {top ? top.name : "Awaiting data"}
              </p>
              {top ? (
                <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span>
                    <Target className="mr-1 inline size-3.5" />
                    TCs Lined Up:{" "}
                    <b className="text-foreground">{agentTcsLinedUp(top)}</b>
                  </span>
                  <span>
                    Pre-TC → TC:{" "}
                    <b className="text-foreground">{top.preTcToTc}</b>
                  </span>
                  <span>
                    <PhoneCall className="mr-1 inline size-3.5" />
                    Calls Picked:{" "}
                    <b className="text-foreground">{top.callsPicked}</b>
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter agent performance to reveal today's top performer.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Leaderboard */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Daily Leaderboard
          </h2>
          <Leaderboard agents={state.agents} />
        </section>
      </main>

      <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Report already exists</AlertDialogTitle>
            <AlertDialogDescription>
              A report for {fmtDate(state.date)} has already been submitted.
              Open the existing report, or overwrite it with the current data?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={openExisting}
            >
              Open Existing Report
            </Button>
            <AlertDialogAction onClick={() => commit("submit")}>
              Overwrite Report
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmEdit} onOpenChange={setConfirmEdit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit submitted report?</AlertDialogTitle>
            <AlertDialogDescription>
              This report is locked. Unlocking allows changes — after saving,
              the status becomes “Edited After Submission”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={startEditing}>
              Unlock &amp; Edit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto rounded-2xl p-0">
          <DialogTitle className="sr-only">
            CureMeAbroad Operations Hub — {fmtDate(state.date)}
          </DialogTitle>

          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/95 px-6 py-4 backdrop-blur print:hidden">
            <p className="text-sm font-semibold tracking-tight">
              Dashboard Preview
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={busy === "png"}
                onClick={downloadPng}
              >
                <Download className="size-4" /> Download PNG
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={busy === "pdf"}
                onClick={downloadPdf}
              >
                <FileText className="size-4" /> Download PDF
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={busy === "copy"}
                onClick={copyDashboard}
              >
                <Copy className="size-4" /> Copy Dashboard
              </Button>
              <Button size="sm" className="rounded-xl" onClick={printDashboard}>
                <Printer className="size-4" /> Print
              </Button>
            </div>
          </div>

          <div data-report>
            <DashboardReport ref={reportRef} state={state} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

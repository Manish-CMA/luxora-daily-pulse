import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Eye,
  FileDiff,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRoundCheck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { TcShiftShareCard } from "@/components/dashboard/TcShiftShareCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { todayIso } from "@/lib/dashboard";
import {
  bookingEndTimestamp,
  bookingTimestamp,
  compareTcShiftSnapshots,
  computeTcShiftMetrics,
  effectiveBookings,
  firstName,
  fmtIstTimestamp,
  maskCaseId,
  parseTcBookings,
  type TcBooking,
  type TcBookingStatus,
  type TcImportResult,
} from "@/lib/tc-shift";
import {
  deleteTcShiftSnapshot,
  loadTcShiftSnapshots,
  saveTcShiftSnapshot,
  type TcShiftSnapshot,
  type TcSnapshotPhase,
} from "@/lib/tc-shift-storage";

export const Route = createFileRoute("/_authenticated/tc-scheduler")({
  head: () => ({
    meta: [
      { title: "TC Shift Monitor | CureMeAbroad Operations Hub" },
      {
        name: "description",
        content:
          "Paste CRM TC bookings, monitor the live shift and compare opening and closing outcomes.",
      },
    ],
  }),
  component: TcShiftMonitorPage,
});

const emptyResult = (): TcImportResult => ({
  bookings: [],
  warnings: [],
  detectedFilterDate: "",
  crmAlignedCount: null,
  crmScheduledCount: null,
  totalBlocks: 0,
});

const statusTone: Record<TcBookingStatus, string> = {
  Done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "No-show": "border-red-200 bg-red-50 text-red-700",
  "No Photos": "border-amber-200 bg-amber-50 text-amber-700",
  Rescheduled: "border-violet-200 bg-violet-50 text-violet-700",
  Scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  Unknown: "border-border bg-secondary text-muted-foreground",
};

type MetricFilter = "all" | "aligned" | "done" | "no-show" | "rescheduled" | "pending" | "overdue";

const metricFilterLabel: Record<MetricFilter, string> = {
  all: "All active TCs",
  aligned: "Aligned today",
  done: "Done TCs",
  "no-show": "No-show TCs",
  rescheduled: "Reschedule events",
  pending: "Pending TCs",
  overdue: "Overdue — status not marked",
};

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const formatCountdown = (milliseconds: number) => {
  if (milliseconds <= 0) return "Due now";
  const totalMinutes = Math.ceil(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

type PhotoStatus = "yes" | "no";
type PhotoStatusMap = Record<string, PhotoStatus>;

const photoStorageKey = (shiftDate: string) => `luxora.tc-photo-status.${shiftDate}`;

const readPhotoStatuses = (shiftDate: string): PhotoStatusMap => {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(photoStorageKey(shiftDate));
    return value ? (JSON.parse(value) as PhotoStatusMap) : {};
  } catch {
    return {};
  }
};

type ClashTone = { row: string; badge: string; label: string };

const clashTones: ClashTone[] = [
  {
    row: "border-red-200 bg-red-50/70",
    badge: "border-red-200 bg-red-100 text-red-700",
    label: "Clash A",
  },
  {
    row: "border-amber-200 bg-amber-50/70",
    badge: "border-amber-200 bg-amber-100 text-amber-800",
    label: "Clash B",
  },
  {
    row: "border-violet-200 bg-violet-50/70",
    badge: "border-violet-200 bg-violet-100 text-violet-700",
    label: "Clash C",
  },
  {
    row: "border-cyan-200 bg-cyan-50/70",
    badge: "border-cyan-200 bg-cyan-100 text-cyan-800",
    label: "Clash D",
  },
];

/** Assign one colour to every group of two or more TCs with the same IST start time. */
function clashToneByFingerprint(bookings: TcBooking[]): Map<string, ClashTone> {
  const byStartTime = new Map<number, TcBooking[]>();
  bookings.forEach((booking) => {
    const start = bookingTimestamp(booking);
    byStartTime.set(start, [...(byStartTime.get(start) ?? []), booking]);
  });

  const toneByFingerprint = new Map<string, ClashTone>();
  [...byStartTime.entries()]
    .filter(([, group]) => group.length > 1)
    .sort(([first], [second]) => first - second)
    .forEach(([, group], index) => {
      const tone = clashTones[index % clashTones.length]!;
      group.forEach((booking) => toneByFingerprint.set(booking.fingerprint, tone));
    });
  return toneByFingerprint;
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tone = "text-primary",
  onClick,
  active = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const content = (
    <>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
        {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      <span className="flex size-9 items-center justify-center rounded-xl bg-secondary">
        <Icon className={`size-4 ${tone}`} />
      </span>
    </>
  );

  const className = `rounded-2xl border bg-card p-4 text-left shadow-soft transition-all ${
    active ? "border-primary ring-2 ring-primary/20" : "border-border"
  } ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <div className="flex items-start justify-between gap-3">{content}</div>
      </button>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">{content}</div>
    </div>
  );
}

function BookingTable({
  bookings,
  privacyMode,
  now,
  preserveRows = false,
  showPhotos = false,
  photoStatuses = {},
  onPhotoChange,
}: {
  bookings: TcBooking[];
  privacyMode: boolean;
  now: number;
  preserveRows?: boolean;
  showPhotos?: boolean;
  photoStatuses?: PhotoStatusMap;
  onPhotoChange?: (caseId: string, status: PhotoStatus) => void;
}) {
  const rows = preserveRows ? bookings : effectiveBookings(bookings);
  const clashTonesByFingerprint = clashToneByFingerprint(rows);
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        No parsed bookings to preview.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
      <table className="w-full min-w-[1150px] border-collapse text-sm">
        <thead>
          <tr className="bg-secondary/60 text-left">
            {[
              "IST",
              "Patient",
              "Case ID",
              "Doctor",
              "Discovery",
              "Closure",
              "Created by",
              "Status",
              ...(showPhotos ? ["Photos received"] : []),
            ].map((label) => (
              <th
                key={label}
                className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((booking) => {
            const overdue = booking.status === "Scheduled" && bookingEndTimestamp(booking) <= now;
            const clashTone = clashTonesByFingerprint.get(booking.fingerprint);
            return (
              <tr
                key={booking.fingerprint}
                className={
                  clashTone
                    ? `border-t ${clashTone.row}`
                    : overdue
                      ? "border-t border-red-200 bg-red-50/60"
                      : "border-t border-border"
                }
              >
                <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-primary">
                  {booking.istTime}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">IST</span>
                  {clashTone ? (
                    <Badge variant="outline" className={`ml-2 text-[10px] ${clashTone.badge}`}>
                      {clashTone.label}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-medium">
                  {privacyMode ? firstName(booking.patientName) : booking.patientName}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                  {privacyMode ? maskCaseId(booking.caseId) : booking.caseId}
                </td>
                <td className="px-3 py-3">{booking.doctor}</td>
                <td className="px-3 py-3">{booking.discoveryAgent || "—"}</td>
                <td className="px-3 py-3">{booking.closureAgent || "—"}</td>
                <td className="px-3 py-3">{booking.createdBy || "—"}</td>
                <td className="px-3 py-3">
                  <Badge
                    variant="outline"
                    className={overdue ? statusTone["No Photos"] : statusTone[booking.status]}
                  >
                    {overdue ? "Awaiting outcome" : booking.status}
                  </Badge>
                </td>
                {showPhotos ? (
                  <td className="px-3 py-3">
                    <div className="flex min-w-32 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPhotoChange?.(booking.caseId, "yes")}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          photoStatuses[booking.caseId] === "yes"
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                            : "border-border bg-card text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => onPhotoChange?.(booking.caseId, "no")}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          photoStatuses[booking.caseId] === "no"
                            ? "border-red-300 bg-red-100 text-red-800"
                            : "border-border bg-card text-muted-foreground hover:bg-red-50 hover:text-red-700"
                        }`}
                      >
                        No
                      </button>
                      {!photoStatuses[booking.caseId] ? (
                        <span className="ml-1 text-[11px] text-muted-foreground">Not marked</span>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TcShiftMonitorPage() {
  const { fullName } = useAuth();
  const shareRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLElement>(null);
  const [shiftDate, setShiftDate] = useState(todayIso());
  const [phase, setPhase] = useState<TcSnapshotPhase>("opening");
  const [scheduledRaw, setScheduledRaw] = useState("");
  const [alignedRaw, setAlignedRaw] = useState("");
  const [scheduledResult, setScheduledResult] = useState(emptyResult);
  const [alignedResult, setAlignedResult] = useState(emptyResult);
  const [opening, setOpening] = useState<TcShiftSnapshot | null>(null);
  const [closing, setClosing] = useState<TcShiftSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [doctorFilter, setDoctorFilter] = useState("all");
  const [createdByFilter, setCreatedByFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [photoStatuses, setPhotoStatuses] = useState<PhotoStatusMap>(() =>
    readPhotoStatuses(todayIso()),
  );
  const [metricFilter, setMetricFilter] = useState<MetricFilter>("all");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState("import");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadTcShiftSnapshots(shiftDate)
      .then((result) => {
        if (cancelled) return;
        setOpening(result.opening);
        setClosing(result.closing);
        setCloudAvailable(result.cloudAvailable);
        setStorageWarning(result.warning);
        const preferred = result.opening ?? result.closing;
        setPhase(preferred?.phase ?? "opening");
        setScheduledRaw(preferred?.scheduledRaw ?? "");
        setAlignedRaw(preferred?.alignedRaw ?? "");
        setScheduledResult(
          preferred ? { ...emptyResult(), bookings: preferred.scheduledBookings } : emptyResult(),
        );
        setAlignedResult(
          preferred ? { ...emptyResult(), bookings: preferred.alignedBookings } : emptyResult(),
        );
      })
      .catch((error) => {
        if (!cancelled) setStorageWarning(String(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shiftDate]);

  useEffect(() => {
    setPhotoStatuses(readPhotoStatuses(shiftDate));
  }, [shiftDate]);

  const updatePhotoStatus = (caseId: string, status: PhotoStatus) => {
    setPhotoStatuses((current) => {
      const next = { ...current, [caseId]: status };
      window.localStorage.setItem(photoStorageKey(shiftDate), JSON.stringify(next));
      return next;
    });
  };

  const switchPhase = (next: TcSnapshotPhase) => {
    setPhase(next);
    const snapshot = next === "opening" ? opening : closing;
    setScheduledRaw(snapshot?.scheduledRaw ?? "");
    setAlignedRaw(snapshot?.alignedRaw ?? "");
    setScheduledResult(
      snapshot ? { ...emptyResult(), bookings: snapshot.scheduledBookings } : emptyResult(),
    );
    setAlignedResult(
      snapshot ? { ...emptyResult(), bookings: snapshot.alignedBookings } : emptyResult(),
    );
  };

  const parseNow = () => {
    const schedule = parseTcBookings(scheduledRaw, "scheduled");
    const aligned = parseTcBookings(alignedRaw, "aligned");
    setScheduledResult(schedule);
    setAlignedResult(aligned);
    if (!schedule.bookings.length) {
      toast.error(schedule.warnings[0] || "No scheduled TC rows were found.");
      return false;
    }
    const mismatched = [schedule.detectedFilterDate, aligned.detectedFilterDate].filter(
      (date) => date && date !== shiftDate,
    );
    if (mismatched.length) {
      toast.warning(`The pasted CRM filter date does not match ${dateLabel(shiftDate)}.`);
    } else {
      toast.success(
        `Parsed ${schedule.bookings.length} schedule rows and ${aligned.bookings.length} alignment rows.`,
      );
    }
    return true;
  };

  const saveSnapshot = async () => {
    const schedule = parseTcBookings(scheduledRaw, "scheduled");
    const aligned = parseTcBookings(alignedRaw, "aligned");
    setScheduledResult(schedule);
    setAlignedResult(aligned);
    if (!schedule.bookings.length) {
      toast.error(schedule.warnings[0] || "Paste and parse the scheduled TC list first.");
      return;
    }

    setSaving(true);
    try {
      const result = await saveTcShiftSnapshot({
        shiftDate,
        phase,
        scheduledRaw,
        alignedRaw,
        scheduledBookings: schedule.bookings,
        alignedBookings: aligned.bookings,
        importedByName: fullName,
      });
      if (phase === "opening") setOpening(result.snapshot);
      else setClosing(result.snapshot);
      setCloudAvailable(result.cloudSaved || cloudAvailable);
      if (result.warning) toast.warning(result.warning);
      else toast.success(`${phase === "opening" ? "Opening" : "Closing"} snapshot saved to cloud.`);
      setActiveTab(phase === "closing" ? "comparison" : "live");
    } catch (error) {
      console.error(error);
      toast.error("Snapshot could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSnapshot = async () => {
    const label = phase === "opening" ? "Opening" : "Closing";
    if (
      !window.confirm(
        `Delete the saved ${label.toLowerCase()} snapshot for ${dateLabel(shiftDate)}?`,
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteTcShiftSnapshot(shiftDate, phase);
      if (phase === "opening") setOpening(null);
      else setClosing(null);
      setScheduledRaw("");
      setAlignedRaw("");
      setScheduledResult(emptyResult());
      setAlignedResult(emptyResult());
      if (result.warning) toast.warning(result.warning);
      else toast.success(`${label} snapshot deleted.`);
    } catch (error) {
      console.error(error);
      toast.error("Snapshot could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  const latest = useMemo(() => {
    if (scheduledResult.bookings.length) {
      return {
        bookings: scheduledResult.bookings,
        aligned: alignedResult.bookings,
        updatedAt: undefined as string | undefined,
      };
    }
    const snapshot = closing ?? opening;
    return {
      bookings: snapshot?.scheduledBookings ?? [],
      aligned: snapshot?.alignedBookings ?? [],
      updatedAt: snapshot?.updatedAt,
    };
  }, [scheduledResult.bookings, alignedResult.bookings, opening, closing]);

  const metrics = useMemo(
    () => computeTcShiftMetrics(latest.bookings, now),
    [latest.bookings, now],
  );
  const alignedRows = useMemo(() => effectiveBookings(latest.aligned), [latest.aligned]);
  const alignedForShift = alignedRows.filter((booking) => booking.istDate === shiftDate).length;
  const alignedFuture = alignedRows.length - alignedForShift;
  const effective = useMemo(() => effectiveBookings(latest.bookings), [latest.bookings]);
  const doctors = useMemo(
    () => [...new Set(effective.map((booking) => booking.doctor))].sort(),
    [effective],
  );
  const createdByOptions = useMemo(
    () =>
      [...new Set(effective.map((booking) => booking.createdBy).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [effective],
  );
  const metricRows = useMemo(() => {
    if (metricFilter === "aligned") return alignedRows;
    if (metricFilter === "rescheduled") {
      return latest.bookings.filter((booking) => booking.status === "Rescheduled");
    }
    if (metricFilter === "done") {
      return effective.filter((booking) => booking.status === "Done");
    }
    if (metricFilter === "no-show") {
      return effective.filter((booking) => booking.status === "No-show");
    }
    if (metricFilter === "pending") {
      return effective.filter((booking) => booking.status === "Scheduled");
    }
    if (metricFilter === "overdue") {
      return effective.filter(
        (booking) => booking.status === "Scheduled" && bookingEndTimestamp(booking) <= now,
      );
    }
    return effective;
  }, [alignedRows, effective, latest.bookings, metricFilter, now]);
  const filtered = metricRows.filter((booking) => {
    if (doctorFilter !== "all" && booking.doctor !== doctorFilter) return false;
    if (createdByFilter !== "all" && booking.createdBy !== createdByFilter) return false;
    if (statusFilter !== "all" && booking.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const haystack =
      `${booking.patientName} ${booking.caseId} ${booking.discoveryAgent} ${booking.closureAgent}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  });
  const nextBooking = effective.find(
    (booking) => booking.status === "Scheduled" && bookingTimestamp(booking) >= now,
  );
  const currentBooking = effective.find(
    (booking) =>
      booking.status === "Scheduled" &&
      bookingTimestamp(booking) <= now &&
      bookingEndTimestamp(booking) > now,
  );
  const comparison = useMemo(
    () =>
      opening && closing
        ? compareTcShiftSnapshots(
            opening.scheduledBookings,
            closing.scheduledBookings,
            opening.alignedBookings,
            closing.alignedBookings,
          )
        : null,
    [opening, closing],
  );

  const applyMetricFilter = (next: MetricFilter) => {
    setMetricFilter(next);
    setStatusFilter("all");
    setCreatedByFilter("all");
    setSearch("");
    setActiveTab("live");
    window.setTimeout(() => {
      timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const whatsappText = useMemo(() => {
    const lines = effective.map((booking) => {
      const patient = privacyMode ? firstName(booking.patientName) : booking.patientName;
      const caseId = privacyMode ? maskCaseId(booking.caseId) : booking.caseId;
      return `${booking.istTime} IST — ${patient} (${caseId}) — ${booking.doctor} — ${booking.status}`;
    });
    return [
      `*CureMeAbroad TC Shift Update — ${dateLabel(shiftDate)}*`,
      `Active TCs: ${metrics.totalUnique} | Aligned today: ${alignedRows.length}`,
      `Done: ${metrics.done} | No-show: ${metrics.noShow} | Pending: ${metrics.scheduled} | Reschedule events: ${metrics.rescheduleEvents}`,
      "",
      ...lines,
      "",
      `_Last refreshed: ${latest.updatedAt ? fmtIstTimestamp(latest.updatedAt) : "Preview"}_`,
    ].join("\n");
  }, [effective, privacyMode, shiftDate, metrics, alignedRows.length, latest.updatedAt]);

  const copyWhatsApp = async () => {
    await navigator.clipboard.writeText(whatsappText);
    toast.success("WhatsApp update copied.");
  };

  const downloadImage = async () => {
    if (!shareRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const canvas = await html2canvas(shareRef.current, {
        scale: 2,
        backgroundColor: "#f8fafc",
        useCORS: true,
      });
      const link = document.createElement("a");
      link.download = `CureMeAbroad-TC-Shift-${shiftDate}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("WhatsApp image downloaded.");
    } catch (error) {
      console.error(error);
      toast.error("Image could not be generated.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <AppHeader />

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <CalendarClock className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">TC Shift Monitor</h1>
                <p className="text-sm text-muted-foreground">
                  Paste CRM snapshots, track the live shift and create WhatsApp updates.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="shift-date"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Shift date
              </Label>
              <Input
                id="shift-date"
                type="date"
                value={shiftDate}
                onChange={(event) => setShiftDate(event.target.value)}
                className="h-10 w-44 rounded-xl"
              />
            </div>
            <Badge
              variant="outline"
              className={
                cloudAvailable
                  ? "h-10 gap-2 rounded-xl border-emerald-200 bg-emerald-50 px-3 text-emerald-700"
                  : "h-10 gap-2 rounded-xl px-3"
              }
            >
              {cloudAvailable ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
              {cloudAvailable ? "Cloud snapshots" : "Browser storage"}
            </Badge>
          </div>
        </section>

        {storageWarning ? (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{storageWarning}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-80 items-center justify-center rounded-2xl border border-border bg-card">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="h-auto flex-wrap rounded-xl bg-secondary/70 p-1">
              <TabsTrigger value="import" className="gap-2 rounded-lg px-4 py-2">
                <Upload className="size-4" /> Import & Preview
              </TabsTrigger>
              <TabsTrigger value="live" className="gap-2 rounded-lg px-4 py-2">
                <Video className="size-4" /> Live Shift Board
              </TabsTrigger>
              <TabsTrigger value="comparison" className="gap-2 rounded-lg px-4 py-2">
                <FileDiff className="size-4" /> Closing Comparison
              </TabsTrigger>
              <TabsTrigger value="share" className="gap-2 rounded-lg px-4 py-2">
                <Eye className="size-4" /> WhatsApp Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="import" className="mt-6 space-y-6">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-semibold">Choose snapshot</h2>
                    <p className="text-xs text-muted-foreground">
                      Save the opening view at shift start and closing view at shift end.
                    </p>
                  </div>
                  <div className="flex rounded-xl bg-secondary p-1">
                    <Button
                      size="sm"
                      variant={phase === "opening" ? "default" : "ghost"}
                      className="rounded-lg"
                      onClick={() => switchPhase("opening")}
                    >
                      Opening Snapshot {opening ? "✓" : ""}
                    </Button>
                    <Button
                      size="sm"
                      variant={phase === "closing" ? "default" : "ghost"}
                      className="rounded-lg"
                      onClick={() => switchPhase("closing")}
                    >
                      Closing Snapshot {closing ? "✓" : ""}
                    </Button>
                  </div>
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">1. Today’s Schedule</h2>
                      <p className="text-xs text-muted-foreground">
                        CRM filter: Call From / Call To
                      </p>
                    </div>
                    {scheduledResult.bookings.length ? (
                      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                        {scheduledResult.bookings.length} rows parsed
                      </Badge>
                    ) : null}
                  </div>
                  <Textarea
                    value={scheduledRaw}
                    onChange={(event) => setScheduledRaw(event.target.value)}
                    placeholder="Paste the complete Scheduled CRM text here…"
                    className="mt-4 min-h-72 resize-y rounded-xl font-mono text-xs leading-relaxed"
                  />
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">2. Aligned Today</h2>
                      <p className="text-xs text-muted-foreground">
                        CRM filter: Booked From / Booked To
                      </p>
                    </div>
                    {alignedResult.bookings.length ? (
                      <Badge
                        variant="outline"
                        className="border-indigo-200 bg-indigo-50 text-indigo-700"
                      >
                        {alignedResult.bookings.length} rows parsed
                      </Badge>
                    ) : null}
                  </div>
                  <Textarea
                    value={alignedRaw}
                    onChange={(event) => setAlignedRaw(event.target.value)}
                    placeholder="Paste the complete Aligned CRM text here…"
                    className="mt-4 min-h-72 resize-y rounded-xl font-mono text-xs leading-relaxed"
                  />
                </div>
              </section>

              <div className="flex flex-wrap justify-end gap-3">
                {(phase === "opening" && opening) || (phase === "closing" && closing) ? (
                  <Button
                    variant="outline"
                    className="rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={deleteSnapshot}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                    Delete saved {phase} snapshot
                  </Button>
                ) : null}
                <Button variant="outline" className="rounded-xl" onClick={parseNow}>
                  <RefreshCw className="size-4" /> Parse Preview
                </Button>
                <Button className="rounded-xl" onClick={saveSnapshot} disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Save {phase === "opening" ? "Opening" : "Closing"} Snapshot
                </Button>
              </div>

              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi
                  label="CRM schedule rows"
                  value={scheduledResult.totalBlocks || scheduledResult.bookings.length}
                  icon={Clipboard}
                />
                <Kpi
                  label="Unique active TCs"
                  value={computeTcShiftMetrics(scheduledResult.bookings, now).totalUnique}
                  icon={Video}
                />
                <Kpi
                  label="Aligned rows"
                  value={alignedResult.bookings.length}
                  icon={UserRoundCheck}
                  tone="text-indigo-600"
                />
                <Kpi
                  label="Parser warnings"
                  value={scheduledResult.warnings.length + alignedResult.warnings.length}
                  icon={AlertTriangle}
                  tone="text-amber-600"
                />
              </section>

              <BookingTable
                bookings={scheduledResult.bookings}
                privacyMode={privacyMode}
                now={now}
              />
            </TabsContent>

            <TabsContent value="live" className="mt-6 space-y-6">
              <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Kpi
                  label="Active TCs"
                  value={metrics.totalUnique}
                  icon={Video}
                  active={metricFilter === "all"}
                  onClick={() => applyMetricFilter("all")}
                />
                <Kpi
                  label="Aligned today"
                  value={alignedRows.length}
                  sub={`${alignedForShift} today · ${alignedFuture} future`}
                  icon={UserRoundCheck}
                  tone="text-indigo-600"
                  active={metricFilter === "aligned"}
                  onClick={() => applyMetricFilter("aligned")}
                />
                <Kpi
                  label="Done"
                  value={metrics.done}
                  icon={CheckCircle2}
                  tone="text-emerald-600"
                  active={metricFilter === "done"}
                  onClick={() => applyMetricFilter("done")}
                />
                <Kpi
                  label="No-show"
                  value={metrics.noShow}
                  icon={Users}
                  tone="text-red-600"
                  active={metricFilter === "no-show"}
                  onClick={() => applyMetricFilter("no-show")}
                />
                <Kpi
                  label="Reschedule events"
                  value={metrics.rescheduleEvents}
                  icon={RefreshCw}
                  tone="text-violet-600"
                  active={metricFilter === "rescheduled"}
                  onClick={() => applyMetricFilter("rescheduled")}
                />
                <Kpi
                  label="Pending"
                  value={metrics.scheduled}
                  icon={Clock3}
                  tone="text-blue-600"
                  active={metricFilter === "pending"}
                  onClick={() => applyMetricFilter("pending")}
                />
                <Kpi
                  label="Overdue — mark status"
                  value={metrics.overdue}
                  sub="TC time passed"
                  icon={AlertTriangle}
                  tone="text-red-600"
                  active={metricFilter === "overdue"}
                  onClick={() => applyMetricFilter("overdue")}
                />
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl border border-primary/20 bg-primary-soft p-5 shadow-soft">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Current / due now
                  </p>
                  {currentBooking ? (
                    <div className="mt-3">
                      <p className="text-xl font-semibold">
                        {privacyMode
                          ? firstName(currentBooking.patientName)
                          : currentBooking.patientName}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentBooking.istTime}–
                        {new Date(bookingEndTimestamp(currentBooking)).toLocaleTimeString("en-GB", {
                          timeZone: "Asia/Kolkata",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })}{" "}
                        IST · {currentBooking.doctor} ·{" "}
                        {currentBooking.discoveryAgent || "No discovery agent"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No TC is currently in progress.
                    </p>
                  )}
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Next TC
                  </p>
                  {nextBooking ? (
                    <div className="mt-3 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xl font-semibold">
                          {privacyMode
                            ? firstName(nextBooking.patientName)
                            : nextBooking.patientName}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {nextBooking.istTime} IST · {nextBooking.doctor} · Closure:{" "}
                          {nextBooking.closureAgent || "—"}
                        </p>
                      </div>
                      <Badge className="rounded-full px-3 py-1.5">
                        in {formatCountdown(bookingTimestamp(nextBooking) - now)}
                      </Badge>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No upcoming scheduled TC in this snapshot.
                    </p>
                  )}
                </div>
              </section>

              <section ref={timelineRef} className="scroll-mt-6 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">Live TC Timeline</h2>
                      {metricFilter !== "all" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 rounded-lg px-2 text-xs"
                          onClick={() => applyMetricFilter("all")}
                        >
                          Showing: {metricFilterLabel[metricFilter]} ×
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Based on the last pasted snapshot ·{" "}
                      {latest.updatedAt ? fmtIstTimestamp(latest.updatedAt) : "unsaved preview"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search patient or Case ID"
                      className="h-9 w-56 rounded-xl"
                    />
                    <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                      <SelectTrigger className="h-9 w-44 rounded-xl">
                        <SelectValue placeholder="All doctors" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All doctors</SelectItem>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor} value={doctor}>
                            {doctor}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
                      <SelectTrigger className="h-9 w-44 rounded-xl">
                        <SelectValue placeholder="Created by" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Created by: all</SelectItem>
                        {createdByOptions.map((createdBy) => (
                          <SelectItem key={createdBy} value={createdBy}>
                            {createdBy}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-40 rounded-xl">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {(
                          [
                            "Scheduled",
                            "Done",
                            "No-show",
                            "No Photos",
                            "Rescheduled",
                          ] as TcBookingStatus[]
                        ).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <BookingTable
                  bookings={filtered}
                  privacyMode={privacyMode}
                  now={now}
                  preserveRows={metricFilter === "rescheduled"}
                  showPhotos
                  photoStatuses={photoStatuses}
                  onPhotoChange={updatePhotoStatus}
                />
              </section>
            </TabsContent>

            <TabsContent value="comparison" className="mt-6 space-y-6">
              {!comparison ? (
                <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
                  <FileDiff className="mx-auto size-10 text-muted-foreground" />
                  <h2 className="mt-4 font-semibold">Opening and closing snapshots required</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save the opening snapshot at shift start, then paste and save the closing
                    snapshot at shift end.
                  </p>
                </div>
              ) : (
                <>
                  <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Kpi
                      label="Opening active TCs"
                      value={computeTcShiftMetrics(opening?.scheduledBookings ?? []).totalUnique}
                      icon={Video}
                    />
                    <Kpi
                      label="New TCs added"
                      value={comparison.added.length}
                      icon={UserRoundCheck}
                      tone="text-emerald-600"
                    />
                    <Kpi
                      label="Changed bookings"
                      value={comparison.changed.length}
                      icon={RefreshCw}
                      tone="text-violet-600"
                    />
                    <Kpi
                      label="New alignments"
                      value={comparison.newlyAligned.length}
                      icon={CalendarClock}
                      tone="text-indigo-600"
                    />
                  </section>

                  <section className="grid gap-5 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                      <h2 className="font-semibold">New TCs added during shift</h2>
                      <div className="mt-4 space-y-2">
                        {comparison.added.length ? (
                          comparison.added.map((booking) => (
                            <div
                              key={booking.fingerprint}
                              className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3 text-sm"
                            >
                              <div>
                                <p className="font-medium">{booking.patientName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {booking.caseId} · {booking.doctor}
                                </p>
                              </div>
                              <Badge variant="outline">{booking.istTime} IST</Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No new TCs were added.</p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                      <h2 className="font-semibold">Newly aligned during shift</h2>
                      <div className="mt-4 space-y-2">
                        {comparison.newlyAligned.length ? (
                          comparison.newlyAligned.map((booking) => (
                            <div
                              key={booking.fingerprint}
                              className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3 text-sm"
                            >
                              <div>
                                <p className="font-medium">{booking.patientName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {booking.caseId} · TC on {booking.istDate}
                                </p>
                              </div>
                              <Badge variant="outline">{booking.istTime} IST</Badge>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No new alignments were detected.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                    <h2 className="font-semibold">Status, time and assignment changes</h2>
                    <div className="mt-4 space-y-3">
                      {comparison.changed.length ? (
                        comparison.changed.map((change) => (
                          <div key={change.caseId} className="rounded-xl border border-border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-medium">{change.patientName}</p>
                                <p className="text-xs text-muted-foreground">{change.caseId}</p>
                              </div>
                              <Badge variant="outline" className={statusTone[change.after.status]}>
                                {change.after.status}
                              </Badge>
                            </div>
                            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                              {change.changes.map((item) => (
                                <li key={item}>• {item}</li>
                              ))}
                            </ul>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No booking changes were detected.
                        </p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </TabsContent>

            <TabsContent value="share" className="mt-6 space-y-5">
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div>
                  <h2 className="font-semibold">WhatsApp-ready shift update</h2>
                  <p className="text-xs text-muted-foreground">
                    Copy text or download the complete timeline as an image.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
                    <ShieldCheck className="size-4 text-primary" />
                    <Label htmlFor="privacy-mode" className="text-sm">
                      Privacy mode
                    </Label>
                    <Switch
                      id="privacy-mode"
                      checked={privacyMode}
                      onCheckedChange={setPrivacyMode}
                    />
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={copyWhatsApp}
                    disabled={!effective.length}
                  >
                    <Copy className="size-4" /> Copy WhatsApp Text
                  </Button>
                  <Button
                    className="rounded-xl"
                    onClick={downloadImage}
                    disabled={!effective.length}
                  >
                    <Download className="size-4" /> Download Image
                  </Button>
                </div>
              </section>

              <div className="overflow-x-auto rounded-2xl border border-border bg-secondary/40 p-4">
                <TcShiftShareCard
                  ref={shareRef}
                  shiftDate={shiftDate}
                  bookings={latest.bookings}
                  alignedToday={alignedRows.length}
                  privacyMode={privacyMode}
                  {...(latest.updatedAt ? { importedAt: latest.updatedAt } : {})}
                />
              </div>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <h2 className="font-semibold">WhatsApp text preview</h2>
                <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-secondary p-4 text-xs leading-relaxed">
                  {whatsappText}
                </pre>
              </section>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

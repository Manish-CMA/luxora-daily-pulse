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
  Plus,
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
  Cancelled: "border-slate-200 bg-slate-100 text-slate-700",
  Scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  Unknown: "border-border bg-secondary text-muted-foreground",
};

type MetricFilter = "all" | "aligned" | "done" | "no-show" | "rescheduled" | "cancelled" | "pending" | "overdue";

const metricFilterLabel: Record<MetricFilter, string> = {
  all: "All active TCs",
  aligned: "Aligned today",
  done: "Done TCs",
  "no-show": "No-show TCs",
  rescheduled: "Reschedule events",
  cancelled: "Cancelled TCs",
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
type ConfirmationStatus = "confirmed" | "not-coming" | "no-response";
type ConfirmationStatusMap = Record<string, ConfirmationStatus>;
type ReportTimezone = "Asia/Kolkata" | "Asia/Karachi";
type AssignmentOverrides = Record<
  string,
  Pick<TcBooking, "createdBy" | "closureAgent">
>;

const TEAM_AGENTS = ["Manav", "Meenu", "Shubhi", "Abhishek", "Pranshu", "Deepanshu"];

type ManualTcForm = {
  patientName: string;
  caseId: string;
  istDate: string;
  istTime: string;
  doctor: string;
  createdBy: string;
  closureAgent: string;
  meetingUrl: string;
  status: TcBookingStatus;
  countAsAligned: boolean;
};

const manualFormForDate = (istDate: string): ManualTcForm => ({
  patientName: "",
  caseId: "",
  istDate,
  istTime: "",
  doctor: "",
  createdBy: "",
  closureAgent: "",
  meetingUrl: "",
  status: "Scheduled",
  countAsAligned: true,
});

const mergeBookings = (...groups: TcBooking[][]) =>
  [...new Map(groups.flat().map((booking) => [booking.fingerprint, booking])).values()];

const assignmentOverridesFromSaved = (parsedBookings: TcBooking[], savedBookings: TcBooking[]) => {
  const savedByFingerprint = new Map(savedBookings.map((booking) => [booking.fingerprint, booking]));
  return Object.fromEntries(
    parsedBookings.flatMap((booking) => {
      const saved = savedByFingerprint.get(booking.fingerprint);
      if (!saved) return [];
      return saved.createdBy !== booking.createdBy || saved.closureAgent !== booking.closureAgent
        ? [[booking.fingerprint, { createdBy: saved.createdBy, closureAgent: saved.closureAgent }]]
        : [];
    }),
  ) as AssignmentOverrides;
};

const displayBookingTime = (booking: TcBooking, timezone: ReportTimezone) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(`${booking.istDate}T${booking.istTime}:00+05:30`));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { time: `${read("hour")}:${read("minute")}`, date: `${read("day")} ${read("month")}` };
};

const photoStorageKey = (shiftDate: string) => `luxora.tc-photo-status.${shiftDate}`;
const confirmationStorageKey = (shiftDate: string) =>
  `luxora.tc-confirmation-status.${shiftDate}`;

const readPhotoStatuses = (shiftDate: string): PhotoStatusMap => {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(photoStorageKey(shiftDate));
    return value ? (JSON.parse(value) as PhotoStatusMap) : {};
  } catch {
    return {};
  }
};

const readConfirmationStatuses = (shiftDate: string): ConfirmationStatusMap => {
  if (typeof window === "undefined") return {};
  try {
    const value = window.localStorage.getItem(confirmationStorageKey(shiftDate));
    return value ? (JSON.parse(value) as ConfirmationStatusMap) : {};
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

function AgentNameInput({
  value,
  options,
  onSave,
  disabled = false,
  label,
  listId,
}: {
  value: string;
  options: string[];
  onSave?: (value: string) => void;
  disabled?: boolean;
  label: string;
  listId: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  const save = () => {
    const next = draft.trim();
    if (next !== value) onSave?.(next);
  };

  return (
    <>
      <Input
        value={draft}
        list={listId}
        disabled={disabled}
        aria-label={label}
        placeholder="Type or select agent"
        className="h-8 min-w-32 bg-card text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <datalist id={listId}>
        {options.map((agent) => <option key={agent} value={agent} />)}
      </datalist>
    </>
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
  confirmationStatuses = {},
  onConfirmationChange,
  onStatusChange,
  agentOptions,
  onCreatedByChange,
  onClosureAgentChange,
  showPktTime = true,
}: {
  bookings: TcBooking[];
  privacyMode: boolean;
  now: number;
  preserveRows?: boolean;
  showPhotos?: boolean;
  photoStatuses?: PhotoStatusMap;
  onPhotoChange?: (caseId: string, status: PhotoStatus) => void;
  confirmationStatuses?: ConfirmationStatusMap;
  onConfirmationChange?: (caseId: string, status?: ConfirmationStatus) => void;
  onStatusChange?: (booking: TcBooking, status: TcBookingStatus) => void;
  agentOptions?: string[];
  onCreatedByChange?: (booking: TcBooking, createdBy: string) => void;
  onClosureAgentChange?: (booking: TcBooking, closureAgent: string) => void;
  showPktTime?: boolean;
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
      <table className="w-full min-w-[1240px] border-collapse text-sm">
        <thead>
          <tr className="bg-secondary/60 text-left">
            {[
              "IST",
              ...(showPktTime ? ["PKT"] : []),
              "Patient",
              "Case ID",
              "Doctor",
              "Created by",
              "Closure",
              "Status",
              ...(showPhotos ? ["Photos received"] : []),
              ...(showPhotos ? ["TC confirmation"] : []),
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
            const istTime = displayBookingTime(booking, "Asia/Kolkata");
            const pktTime = displayBookingTime(booking, "Asia/Karachi");
            const istDate = new Date(`${booking.istDate}T00:00:00`).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
            });
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
                  {istTime.time}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">IST</span>
                  {clashTone ? (
                    <Badge variant="outline" className={`ml-2 text-[10px] ${clashTone.badge}`}>
                      {clashTone.label}
                    </Badge>
                  ) : null}
                </td>
                {showPktTime ? (
                  <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-primary">
                    {pktTime.time}
                    <span className="ml-1 text-[10px] font-normal text-muted-foreground">PKT</span>
                    {pktTime.date !== istDate ? (
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">{pktTime.date}</span>
                    ) : null}
                  </td>
                ) : null}
                <td className="px-3 py-3 font-medium">
                  {privacyMode ? firstName(booking.patientName) : booking.patientName}
                  {booking.source === "manual" ? (
                    <span className="ml-2 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                      Manual
                    </span>
                  ) : null}
                  {booking.meetingUrl ? (
                    <a
                      href={booking.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-xs font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Open meeting link
                    </a>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-muted-foreground">
                  {privacyMode ? maskCaseId(booking.caseId) : booking.caseId}
                </td>
                <td className="px-3 py-3">{booking.doctor}</td>
                <td className="px-3 py-3">
                  <AgentNameInput
                    value={booking.createdBy}
                    options={agentOptions ?? []}
                    disabled={!onCreatedByChange}
                    label="Created by"
                    listId={`created-by-${booking.fingerprint}`}
                    onSave={(createdBy) => onCreatedByChange?.(booking, createdBy)}
                  />
                </td>
                <td className="px-3 py-3">
                  <AgentNameInput
                    value={booking.closureAgent}
                    options={agentOptions ?? []}
                    disabled={!onClosureAgentChange}
                    label="Closure agent"
                    listId={`closure-${booking.fingerprint}`}
                    onSave={(closureAgent) => onClosureAgentChange?.(booking, closureAgent)}
                  />
                </td>
                <td className="px-3 py-3">
                  <Select
                    value={booking.status}
                    onValueChange={(value) => onStatusChange?.(booking, value as TcBookingStatus)}
                  >
                    <SelectTrigger
                      className={`h-8 min-w-36 text-xs font-semibold ${
                        overdue ? statusTone["No Photos"] : statusTone[booking.status]
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Scheduled">Scheduled</SelectItem>
                      <SelectItem value="Done">Done</SelectItem>
                      <SelectItem value="No-show">No-show</SelectItem>
                      <SelectItem value="No Photos">No Photos</SelectItem>
                      <SelectItem value="Rescheduled">Rescheduled</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
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
                {showPhotos ? (
                  <td className="px-3 py-3">
                    <select
                      aria-label={`TC confirmation for ${booking.patientName}`}
                      value={confirmationStatuses[booking.caseId] ?? "pending"}
                      onChange={(event) => {
                        const value = event.target.value;
                        onConfirmationChange?.(
                          booking.caseId,
                          value === "pending" ? undefined : (value as ConfirmationStatus),
                        );
                      }}
                      className={`h-9 min-w-44 rounded-lg border px-2.5 text-xs font-semibold outline-none transition-colors focus:ring-2 focus:ring-primary/20 ${
                        confirmationStatuses[booking.caseId] === "confirmed"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : confirmationStatuses[booking.caseId] === "not-coming"
                            ? "border-red-300 bg-red-50 text-red-800"
                            : confirmationStatuses[booking.caseId] === "no-response"
                              ? "border-amber-300 bg-amber-50 text-amber-800"
                              : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      <option value="pending">Pending confirmation</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="not-coming">Not coming</option>
                      <option value="no-response">No response</option>
                    </select>
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
  const [manualBookings, setManualBookings] = useState<TcBooking[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, TcBookingStatus>>({});
  const [assignmentOverrides, setAssignmentOverrides] = useState<AssignmentOverrides>({});
  const [manualForm, setManualForm] = useState<ManualTcForm>(() => manualFormForDate(todayIso()));
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
  const [showPktTime, setShowPktTime] = useState(true);
  const [photoStatuses, setPhotoStatuses] = useState<PhotoStatusMap>(() =>
    readPhotoStatuses(todayIso()),
  );
  const [confirmationStatuses, setConfirmationStatuses] = useState<ConfirmationStatusMap>(() =>
    readConfirmationStatuses(todayIso()),
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
        setManualBookings(
          preferred?.scheduledBookings.filter((booking) => booking.source === "manual") ?? [],
        );
        const savedBookings = preferred?.scheduledBookings ?? [];
        const parsedBookings = parseTcBookings(preferred?.scheduledRaw ?? "", "scheduled").bookings;
        const savedByFingerprint = new Map(savedBookings.map((booking) => [booking.fingerprint, booking]));
        setStatusOverrides(
          Object.fromEntries(
            parsedBookings.flatMap((booking) => {
              const saved = savedByFingerprint.get(booking.fingerprint);
              return saved && saved.status !== booking.status ? [[booking.fingerprint, saved.status]] : [];
            }),
          ),
        );
        setAssignmentOverrides(assignmentOverridesFromSaved(parsedBookings, savedBookings));
        setManualForm(manualFormForDate(shiftDate));
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
    setConfirmationStatuses(readConfirmationStatuses(shiftDate));
  }, [shiftDate]);

  const updatePhotoStatus = (caseId: string, status: PhotoStatus) => {
    setPhotoStatuses((current) => {
      const next = { ...current, [caseId]: status };
      window.localStorage.setItem(photoStorageKey(shiftDate), JSON.stringify(next));
      return next;
    });
  };

  const updateConfirmationStatus = (caseId: string, status?: ConfirmationStatus) => {
    setConfirmationStatuses((current) => {
      const next = { ...current };
      if (status) next[caseId] = status;
      else delete next[caseId];
      window.localStorage.setItem(confirmationStorageKey(shiftDate), JSON.stringify(next));
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
    setManualBookings(snapshot?.scheduledBookings.filter((booking) => booking.source === "manual") ?? []);
    const savedBookings = snapshot?.scheduledBookings ?? [];
    const parsedBookings = parseTcBookings(snapshot?.scheduledRaw ?? "", "scheduled").bookings;
    const savedByFingerprint = new Map(savedBookings.map((booking) => [booking.fingerprint, booking]));
    setStatusOverrides(
      Object.fromEntries(
        parsedBookings.flatMap((booking) => {
          const saved = savedByFingerprint.get(booking.fingerprint);
          return saved && saved.status !== booking.status ? [[booking.fingerprint, saved.status]] : [];
        }),
      ),
    );
    setAssignmentOverrides(assignmentOverridesFromSaved(parsedBookings, savedBookings));
  };

  const applyBookingOverrides = (bookings: TcBooking[]) =>
    bookings.map((booking) =>
      ({
        ...booking,
        ...(statusOverrides[booking.fingerprint] ? { status: statusOverrides[booking.fingerprint] } : {}),
        ...(assignmentOverrides[booking.fingerprint] ?? {}),
      }),
    );

  const parseNow = () => {
    const schedule = parseTcBookings(scheduledRaw, "scheduled");
    const aligned = parseTcBookings(alignedRaw, "aligned");
    const scheduleWithOverrides = applyBookingOverrides(schedule.bookings);
    const alignedWithOverrides = applyBookingOverrides(aligned.bookings);
    setScheduledResult({ ...schedule, bookings: mergeBookings(scheduleWithOverrides, manualBookings) });
    setAlignedResult({
      ...aligned,
      bookings: mergeBookings(
        alignedWithOverrides,
        manualBookings.filter((booking) => booking.source === "manual"),
      ),
    });
    if (!schedule.bookings.length && !manualBookings.length) {
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
        `Parsed ${schedule.bookings.length} schedule rows, ${aligned.bookings.length} alignment rows and ${manualBookings.length} manual rows.`,
      );
    }
    return true;
  };

  const saveSnapshot = async () => {
    const schedule = parseTcBookings(scheduledRaw, "scheduled");
    const aligned = parseTcBookings(alignedRaw, "aligned");
    const combinedScheduled = mergeBookings(applyBookingOverrides(schedule.bookings), manualBookings);
    const combinedAligned = mergeBookings(applyBookingOverrides(aligned.bookings), manualBookings);
    setScheduledResult({ ...schedule, bookings: combinedScheduled });
    setAlignedResult({ ...aligned, bookings: combinedAligned });
    if (!combinedScheduled.length) {
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
        scheduledBookings: combinedScheduled,
        alignedBookings: combinedAligned,
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

  const persistManualChanges = async (
    nextManualBookings: TcBooking[],
    nextStatusOverrides: Record<string, TcBookingStatus>,
    nextAssignmentOverrides: AssignmentOverrides,
  ) => {
    const applyOverrides = (bookings: TcBooking[]) =>
      bookings.map((booking) =>
        ({
          ...booking,
          ...(nextStatusOverrides[booking.fingerprint]
            ? { status: nextStatusOverrides[booking.fingerprint] }
            : {}),
          ...(nextAssignmentOverrides[booking.fingerprint] ?? {}),
        }),
      );
    const schedule = parseTcBookings(scheduledRaw, "scheduled");
    const aligned = parseTcBookings(alignedRaw, "aligned");
    const scheduledBookings = mergeBookings(applyOverrides(schedule.bookings), nextManualBookings);
    const alignedBookings = mergeBookings(applyOverrides(aligned.bookings), nextManualBookings);

    try {
      const result = await saveTcShiftSnapshot({
        shiftDate,
        phase,
        scheduledRaw,
        alignedRaw,
        scheduledBookings,
        alignedBookings,
        importedByName: fullName,
      });
      if (phase === "opening") setOpening(result.snapshot);
      else setClosing(result.snapshot);
      setCloudAvailable(result.cloudSaved || cloudAvailable);
      if (result.warning) toast.warning(result.warning);
    } catch (error) {
      console.error(error);
      toast.error("Your change is visible, but it could not be saved. Please use Save Snapshot.");
    }
  };

  const addManualTc = async () => {
    const patientName = manualForm.patientName.trim();
    const istTime = manualForm.istTime.trim();
    if (!patientName || !manualForm.istDate || !/^\d{2}:\d{2}$/.test(istTime)) {
      toast.error("Enter the patient name, TC date and IST time (HH:MM).");
      return;
    }
    if (manualForm.meetingUrl.trim() && !/^https?:\/\//i.test(manualForm.meetingUrl.trim())) {
      toast.error("Meeting link must begin with https:// or http://.");
      return;
    }

    const suppliedCaseId = manualForm.caseId.trim();
    const caseId = suppliedCaseId || `MANUAL-${Date.now().toString().slice(-8)}`;
    const fingerprint = [caseId, manualForm.istDate, istTime, manualForm.doctor || "manual"]
      .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ""))
      .join("|");
    const booking: TcBooking = {
      source: "manual",
      scheduleLabel: "Manual TC entry",
      scheduleDate: manualForm.istDate,
      istDate: manualForm.istDate,
      patientTime: istTime,
      patientTimezone: "IST",
      istTime,
      status: manualForm.status,
      patientName,
      caseId,
      doctor: manualForm.doctor.trim() || "Doctor not assigned",
      doctorEmail: "",
      meetingUrl: manualForm.meetingUrl.trim() || undefined,
      discoveryAgent: "",
      closureAgent: manualForm.closureAgent.trim(),
      createdBy: manualForm.createdBy.trim() || fullName || "Manual entry",
      joiners: 0,
      isPast: false,
      fingerprint,
    };

    const nextManual = mergeBookings(manualBookings, [booking]);
    setManualBookings(nextManual);
    setScheduledResult((current) => ({ ...current, bookings: mergeBookings(current.bookings, [booking]) }));
    if (manualForm.countAsAligned) {
    setAlignedResult((current) => ({ ...current, bookings: mergeBookings(current.bookings, [booking]) }));
    }
    setManualForm(manualFormForDate(shiftDate));
    await persistManualChanges(nextManual, statusOverrides, assignmentOverrides);
    toast.success("Manual TC added and saved.");
  };

  const removeManualTc = async (fingerprint: string) => {
    const nextManual = manualBookings.filter((booking) => booking.fingerprint !== fingerprint);
    setManualBookings(nextManual);
    setScheduledResult((current) => ({
      ...current,
      bookings: current.bookings.filter((booking) => booking.fingerprint !== fingerprint),
    }));
    setAlignedResult((current) => ({
      ...current,
      bookings: current.bookings.filter((booking) => booking.fingerprint !== fingerprint),
    }));
    await persistManualChanges(nextManual, statusOverrides, assignmentOverrides);
    toast.success("Manual TC removed and saved.");
  };

  const updateTcStatus = async (booking: TcBooking, status: TcBookingStatus) => {
    const fingerprint = booking.fingerprint;
    const update = (booking: TcBooking) =>
      booking.fingerprint === fingerprint ? { ...booking, status } : booking;
    const nextManual = booking.source === "manual" ? manualBookings.map(update) : manualBookings;
    const nextOverrides =
      booking.source === "manual" ? statusOverrides : { ...statusOverrides, [fingerprint]: status };
    if (booking.source === "manual") setManualBookings(nextManual);
    else setStatusOverrides(nextOverrides);
    setScheduledResult((current) => ({ ...current, bookings: current.bookings.map(update) }));
    setAlignedResult((current) => ({ ...current, bookings: current.bookings.map(update) }));
    await persistManualChanges(nextManual, nextOverrides, assignmentOverrides);
    toast.success(`TC marked ${status} and saved.`);
  };

  const updateTcAssignment = async (
    booking: TcBooking,
    field: "createdBy" | "closureAgent",
    value: string,
  ) => {
    const fingerprint = booking.fingerprint;
    const update = (row: TcBooking) => row.fingerprint === fingerprint ? { ...row, [field]: value } : row;
    const nextManual = booking.source === "manual" ? manualBookings.map(update) : manualBookings;
    const currentOverride = assignmentOverrides[fingerprint] ?? {
      createdBy: booking.createdBy,
      closureAgent: booking.closureAgent,
    };
    const nextAssignments = booking.source === "manual"
      ? assignmentOverrides
      : { ...assignmentOverrides, [fingerprint]: { ...currentOverride, [field]: value } };
    if (booking.source === "manual") setManualBookings(nextManual);
    else setAssignmentOverrides(nextAssignments);
    setScheduledResult((current) => ({ ...current, bookings: current.bookings.map(update) }));
    setAlignedResult((current) => ({ ...current, bookings: current.bookings.map(update) }));
    await persistManualChanges(nextManual, statusOverrides, nextAssignments);
    toast.success(`${field === "createdBy" ? "Created by" : "Closure"} updated and saved.`);
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
      [...new Set([...TEAM_AGENTS, ...effective.map((booking) => booking.createdBy), ...effective.map((booking) => booking.closureAgent)].filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [effective],
  );
  const metricRows = useMemo(() => {
    if (metricFilter === "aligned") return alignedRows;
    if (metricFilter === "rescheduled") {
      return latest.bookings.filter((booking) => booking.status === "Rescheduled");
    }
    if (metricFilter === "cancelled") {
      return effective.filter((booking) => booking.status === "Cancelled");
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
      `${booking.patientName} ${booking.caseId} ${booking.createdBy} ${booking.closureAgent}`.toLowerCase();
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
      const photos = photoStatuses[booking.caseId] === "yes" ? "Yes" : photoStatuses[booking.caseId] === "no" ? "No" : "Not marked";
      const confirmation = confirmationStatuses[booking.caseId] === "confirmed" ? "Confirmed" : confirmationStatuses[booking.caseId] === "not-coming" ? "Not coming" : confirmationStatuses[booking.caseId] === "no-response" ? "No response" : "Pending";
      return `${booking.istTime} IST — ${patient} (${caseId}) — ${booking.doctor} — ${booking.status} | Photos: ${photos} | TC confirmation: ${confirmation}`;
    });
    return [
      `*CureMeAbroad TC Shift Update — ${dateLabel(shiftDate)}*`,
      `Active TCs: ${metrics.totalUnique} | Aligned today: ${alignedRows.length}`,
      `Done: ${metrics.done} | No-show: ${metrics.noShow} | Scheduled: ${metrics.scheduled} | Reschedule events: ${metrics.rescheduleEvents}`,
      "",
      ...lines,
      "",
      `_Last refreshed: ${latest.updatedAt ? fmtIstTimestamp(latest.updatedAt) : "Preview"}_`,
    ].join("\n");
  }, [effective, privacyMode, shiftDate, metrics, alignedRows.length, latest.updatedAt, photoStatuses, confirmationStatuses]);

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

              <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-violet-950">3. Add a manual TC</h2>
                    <p className="mt-1 text-xs text-violet-800">
                      Use this when a meeting link was sent directly and the CRM has no booking. A manual entry counts as both a Scheduled TC and TC Aligned.
                    </p>
                  </div>
                  <Badge variant="outline" className="border-violet-200 bg-white text-violet-700">
                    {manualBookings.length} manual {manualBookings.length === 1 ? "entry" : "entries"}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5 xl:col-span-2">
                    <Label htmlFor="manual-patient">Patient name *</Label>
                    <Input
                      id="manual-patient"
                      value={manualForm.patientName}
                      onChange={(event) => setManualForm((current) => ({ ...current, patientName: event.target.value }))}
                      placeholder="Patient name"
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-case-id">Case ID (optional)</Label>
                    <Input
                      id="manual-case-id"
                      value={manualForm.caseId}
                      onChange={(event) => setManualForm((current) => ({ ...current, caseId: event.target.value }))}
                      placeholder="CMA-..."
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-status">Current status</Label>
                    <Select
                      value={manualForm.status}
                      onValueChange={(value) => setManualForm((current) => ({ ...current, status: value as TcBookingStatus }))}
                    >
                      <SelectTrigger id="manual-status" className="bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Scheduled">Scheduled</SelectItem>
                        <SelectItem value="Done">Done</SelectItem>
                        <SelectItem value="No-show">No-show</SelectItem>
                        <SelectItem value="No Photos">No Photos</SelectItem>
                        <SelectItem value="Rescheduled">Rescheduled</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-date">TC date *</Label>
                    <Input
                      id="manual-date"
                      type="date"
                      value={manualForm.istDate}
                      onChange={(event) => setManualForm((current) => ({ ...current, istDate: event.target.value }))}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-time">IST time *</Label>
                    <Input
                      id="manual-time"
                      type="time"
                      value={manualForm.istTime}
                      onChange={(event) => setManualForm((current) => ({ ...current, istTime: event.target.value }))}
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-doctor">Doctor</Label>
                    <Input
                      id="manual-doctor"
                      value={manualForm.doctor}
                      onChange={(event) => setManualForm((current) => ({ ...current, doctor: event.target.value }))}
                      placeholder="Dr. Shumail"
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-created-by">Created by</Label>
                    <Input
                      id="manual-created-by"
                      value={manualForm.createdBy}
                      list="manual-created-by-suggestions"
                      onChange={(event) => setManualForm((current) => ({ ...current, createdBy: event.target.value }))}
                      placeholder={fullName || "Type or select agent"}
                      className="bg-white"
                    />
                    <datalist id="manual-created-by-suggestions">
                      {createdByOptions.map((agent) => <option key={agent} value={agent} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-closure">Closure agent</Label>
                    <Input
                      id="manual-closure"
                      value={manualForm.closureAgent}
                      list="manual-closure-suggestions"
                      onChange={(event) => setManualForm((current) => ({ ...current, closureAgent: event.target.value }))}
                      placeholder="Type or select agent"
                      className="bg-white"
                    />
                    <datalist id="manual-closure-suggestions">
                      {createdByOptions.map((agent) => <option key={agent} value={agent} />)}
                    </datalist>
                  </div>
                  <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="manual-link">Meeting link (optional)</Label>
                    <Input
                      id="manual-link"
                      type="url"
                      value={manualForm.meetingUrl}
                      onChange={(event) => setManualForm((current) => ({ ...current, meetingUrl: event.target.value }))}
                      placeholder="https://meet.google.com/..."
                      className="bg-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full bg-violet-700 hover:bg-violet-800" onClick={addManualTc}>
                      <Plus className="size-4" /> Add manual TC
                    </Button>
                  </div>
                </div>

                {manualBookings.length ? (
                  <div className="mt-4 space-y-2 border-t border-violet-200 pt-4">
                    {manualBookings.map((booking) => (
                      <div key={booking.fingerprint} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm">
                        <span>
                          <strong>{booking.patientName}</strong> · {booking.istDate} {booking.istTime} IST · {booking.status}
                        </span>
                        <Button variant="ghost" size="sm" className="text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => removeManualTc(booking.fingerprint)}>
                          <Trash2 className="size-4" /> Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                agentOptions={createdByOptions}
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
                  label="Cancelled"
                  value={metrics.cancelled}
                  icon={Trash2}
                  tone="text-slate-600"
                  active={metricFilter === "cancelled"}
                  onClick={() => applyMetricFilter("cancelled")}
                />
                <Kpi
                  label="Scheduled"
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
                        {currentBooking.createdBy || "Created by not assigned"}
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
                            "Cancelled",
                          ] as TcBookingStatus[]
                        ).map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3">
                      <Label htmlFor="show-pkt-time" className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Show PKT time
                      </Label>
                      <Switch
                        id="show-pkt-time"
                        checked={showPktTime}
                        onCheckedChange={setShowPktTime}
                        aria-label="Show Pakistan time column"
                      />
                    </div>
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
                  confirmationStatuses={confirmationStatuses}
                  onConfirmationChange={updateConfirmationStatus}
                  onStatusChange={updateTcStatus}
                  agentOptions={createdByOptions}
                  onCreatedByChange={(booking, createdBy) => updateTcAssignment(booking, "createdBy", createdBy)}
                  onClosureAgentChange={(booking, closureAgent) => updateTcAssignment(booking, "closureAgent", closureAgent)}
                  showPktTime={showPktTime}
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
                  photoStatuses={photoStatuses}
                  confirmationStatuses={confirmationStatuses}
                  showPktTime={showPktTime}
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

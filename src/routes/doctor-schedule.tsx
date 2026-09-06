import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Stethoscope,
  Users,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { todayIso } from "@/lib/dashboard";
import {
  bookingEndTimestamp,
  bookingTimestamp,
  computeTcShiftMetrics,
  effectiveBookings,
  type TcBookingStatus,
} from "@/lib/tc-shift";
import { loadDoctorSchedule, type DoctorScheduleBooking } from "@/lib/tc-shift-storage";

export const Route = createFileRoute("/doctor-schedule")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Doctor TC Schedule | CureMeAbroad" },
      {
        name: "description",
        content:
          "Read-only live teleconsultation schedule for the CureMeAbroad in-house doctor team.",
      },
    ],
  }),
  component: DoctorSchedulePage,
});

const statusTone: Record<TcBookingStatus, string> = {
  Done: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "No-show": "border-red-200 bg-red-50 text-red-700",
  "No Photos": "border-amber-200 bg-amber-50 text-amber-700",
  Rescheduled: "border-violet-200 bg-violet-50 text-violet-700",
  Scheduled: "border-blue-200 bg-blue-50 text-blue-700",
  Unknown: "border-border bg-secondary text-muted-foreground",
};

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof Video;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
        </div>
        <span className="flex size-9 items-center justify-center rounded-xl bg-secondary">
          <Icon className={`size-4 ${tone}`} />
        </span>
      </div>
    </div>
  );
}

function DoctorSchedulePage() {
  const [shiftDate, setShiftDate] = useState(todayIso());
  const [bookings, setBookings] = useState<DoctorScheduleBooking[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const schedule = await loadDoctorSchedule(shiftDate);
        if (cancelled) return;
        setBookings(schedule.bookings);
        setUpdatedAt(schedule.updatedAt);
        setError("");
      } catch (cause) {
        if (!cancelled) {
          setBookings([]);
          setError(cause instanceof Error ? cause.message : "The schedule could not be loaded.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [shiftDate]);

  const rows = useMemo(
    () =>
      effectiveBookings(bookings as unknown as import("@/lib/tc-shift").TcBooking[]).filter(
        (booking) => booking.istDate === shiftDate,
      ),
    [bookings, shiftDate],
  );
  const metrics = useMemo(() => computeTcShiftMetrics(rows, now), [rows, now]);
  const current = rows.find(
    (booking) =>
      booking.status === "Scheduled" &&
      bookingTimestamp(booking) <= now &&
      bookingEndTimestamp(booking) > now,
  );
  const next = rows.find(
    (booking) => booking.status === "Scheduled" && bookingTimestamp(booking) >= now,
  );

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-5 rounded-3xl bg-primary px-7 py-6 text-primary-foreground shadow-lift">
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
              <Stethoscope className="size-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                CureMeAbroad In-house Team
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Live TC Schedule</h1>
              <p className="mt-1 text-sm text-blue-100">
                Read-only schedule · refreshes every 30 seconds
              </p>
            </div>
          </div>
          <div className="min-w-52 space-y-1.5">
            <label
              htmlFor="doctor-schedule-date"
              className="text-xs font-semibold uppercase tracking-wider text-blue-100"
            >
              Shift date
            </label>
            <Input
              id="doctor-schedule-date"
              type="date"
              value={shiftDate}
              onChange={(event) => setShiftDate(event.target.value)}
              className="h-10 rounded-xl border-white/30 bg-white text-foreground"
            />
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            Schedule is not available yet. Please ask the operations team to publish today’s TC
            snapshot.
          </div>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label="Active TCs" value={metrics.totalUnique} tone="text-primary" icon={Video} />
          <Metric label="Done" value={metrics.done} tone="text-emerald-600" icon={CheckCircle2} />
          <Metric label="No-show" value={metrics.noShow} tone="text-red-600" icon={Users} />
          <Metric label="Pending" value={metrics.scheduled} tone="text-blue-600" icon={Clock3} />
          <Metric
            label="Overdue"
            value={metrics.overdue}
            tone="text-red-600"
            icon={AlertTriangle}
          />
          <Metric
            label="Rescheduled"
            value={metrics.rescheduleEvents}
            tone="text-violet-600"
            icon={CalendarClock}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-primary/20 bg-primary-soft p-5 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Current TC
            </p>
            {current ? (
              <div className="mt-3">
                <p className="text-xl font-semibold">{current.patientName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {current.istTime}–{formatTime(bookingEndTimestamp(current))} IST ·{" "}
                  {current.doctor}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No TC is currently in progress.</p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Next TC
            </p>
            {next ? (
              <div className="mt-3">
                <p className="text-xl font-semibold">{next.patientName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {next.istTime} IST · {next.doctor}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No upcoming TC in this schedule.</p>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-semibold">Today’s TC Timeline — IST</h2>
              <p className="text-xs text-muted-foreground">{dateLabel(shiftDate)} · read-only</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {updatedAt
                ? `Last updated ${new Date(updatedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST`
                : "Waiting for schedule"}
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading schedule…
            </div>
          ) : rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] border-collapse text-sm">
                <thead>
                  <tr className="bg-secondary/60 text-left">
                    {["IST", "Patient", "Case ID", "Doctor", "Created by", "Closure", "Status"].map(
                      (label) => (
                        <th
                          key={label}
                          className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((booking) => {
                    const overdue =
                      booking.status === "Scheduled" && bookingEndTimestamp(booking) <= now;
                    return (
                      <tr
                        key={`${booking.caseId}-${booking.istTime}-${booking.doctor}`}
                        className={
                          overdue
                            ? "border-t border-red-200 bg-red-50/60"
                            : "border-t border-border"
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-primary">
                          {booking.istTime}
                        </td>
                        <td className="px-4 py-3 font-medium">{booking.patientName}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                          {booking.caseId}
                        </td>
                        <td className="px-4 py-3">{booking.doctor}</td>
                        <td className="px-4 py-3">{booking.createdBy || "—"}</td>
                        <td className="px-4 py-3">{booking.closureAgent || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={
                              overdue
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : statusTone[booking.status]
                            }
                          >
                            {overdue ? "Awaiting outcome" : booking.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              No published TCs for this date yet.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

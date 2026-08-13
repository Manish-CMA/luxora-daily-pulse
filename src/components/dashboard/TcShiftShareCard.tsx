import { forwardRef } from "react";
import { CalendarClock, CheckCircle2, Clock3, Video } from "lucide-react";
import {
  computeTcShiftMetrics,
  effectiveBookings,
  firstName,
  maskCaseId,
  type TcBooking,
} from "@/lib/tc-shift";

type Props = {
  shiftDate: string;
  bookings: TcBooking[];
  alignedToday: number;
  privacyMode: boolean;
  importedAt?: string;
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const statusClass: Record<string, string> = {
  Done: "bg-emerald-100 text-emerald-700",
  "No-show": "bg-red-100 text-red-700",
  "No Photos": "bg-amber-100 text-amber-700",
  Rescheduled: "bg-violet-100 text-violet-700",
  Scheduled: "bg-blue-100 text-blue-700",
  Unknown: "bg-slate-100 text-slate-600",
};

export const TcShiftShareCard = forwardRef<HTMLDivElement, Props>(function TcShiftShareCard(
  { shiftDate, bookings, alignedToday, privacyMode, importedAt },
  ref,
) {
  const rows = effectiveBookings(bookings);
  const metrics = computeTcShiftMetrics(bookings);

  return (
    <div ref={ref} className="w-[1080px] bg-slate-50 p-8 text-slate-900">
      <header className="flex items-end justify-between rounded-3xl bg-blue-600 px-8 py-7 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-100">
            TC Shift Update
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            CureMeAbroad Live TC Schedule
          </h1>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-blue-100">Date</p>
          <p className="mt-1 text-lg font-semibold">{formatDate(shiftDate)}</p>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-6 gap-3">
        {[
          ["Active TCs", metrics.totalUnique, "text-blue-700"],
          ["Aligned Today", alignedToday, "text-indigo-700"],
          ["Done", metrics.done, "text-emerald-700"],
          ["No-show", metrics.noShow, "text-red-700"],
          ["Reschedule Events", metrics.rescheduleEvents, "text-violet-700"],
          ["Pending", metrics.scheduled, "text-amber-700"],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {label}
            </p>
            <p className={`mt-2 text-2xl font-bold tabular-nums ${tone}`}>{value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-600">
            <CalendarClock className="size-4 text-blue-600" />
            Today’s TC Timeline — IST
          </h2>
          <p className="text-xs text-slate-500">{rows.length} unique cases</p>
        </div>

        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <th className="w-20 px-4 py-3">IST</th>
              <th className="w-44 px-3 py-3">Patient</th>
              <th className="w-36 px-3 py-3">Case ID</th>
              <th className="w-40 px-3 py-3">Doctor</th>
              <th className="w-32 px-3 py-3">Discovery</th>
              <th className="w-32 px-3 py-3">Closure</th>
              <th className="w-28 px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => (
              <tr key={booking.fingerprint} className="border-t border-slate-200">
                <td className="px-4 py-3 font-semibold tabular-nums text-blue-700">
                  {booking.istTime}
                </td>
                <td className="truncate px-3 py-3 font-medium">
                  {privacyMode ? firstName(booking.patientName) : booking.patientName}
                </td>
                <td className="px-3 py-3 font-mono text-[11px] text-slate-600">
                  {privacyMode ? maskCaseId(booking.caseId) : booking.caseId}
                </td>
                <td className="truncate px-3 py-3">{booking.doctor}</td>
                <td className="truncate px-3 py-3">{booking.discoveryAgent || "—"}</td>
                <td className="truncate px-3 py-3">{booking.closureAgent || "—"}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass[booking.status]}`}
                  >
                    {booking.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Completion</p>
            <p className="font-semibold">{metrics.completionRate.toFixed(1)}%</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <Clock3 className="size-5 text-amber-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Overdue outcome</p>
            <p className="font-semibold">{metrics.overdue}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <Video className="size-5 text-blue-600" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Last refreshed</p>
            <p className="font-semibold">
              {importedAt
                ? new Date(importedAt).toLocaleTimeString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Preview"}{" "}
              IST
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
        Generated by CureMeAbroad Operations Hub · Confidential internal update
      </footer>
    </div>
  );
});

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { TcBooking } from "@/lib/tc-shift";

export type TcSnapshotPhase = "opening" | "closing";

export type TcShiftSnapshot = {
  id?: string;
  shiftDate: string;
  phase: TcSnapshotPhase;
  scheduledRaw: string;
  alignedRaw: string;
  scheduledBookings: TcBooking[];
  alignedBookings: TcBooking[];
  importedBy?: string;
  importedByName?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SnapshotSaveResult = {
  snapshot: TcShiftSnapshot;
  cloudSaved: boolean;
  doctorSchedulePublished: boolean;
  warning?: string | undefined;
};

export type TcLiveState = {
  shiftDate: string;
  scheduledBookings: TcBooking[];
  alignedBookings: TcBooking[];
  crmScheduledCount?: number | null;
  crmAlignedCount?: number | null;
  updatedBy?: string;
  updatedByName?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LiveStateSaveResult = {
  liveState: TcLiveState;
  cloudSaved: boolean;
  warning?: string | undefined;
};

type TcLiveStateRow = {
  shift_date: string;
  scheduled_data: Json;
  aligned_data: Json;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type DoctorScheduleBooking = Pick<
  TcBooking,
  | "istDate"
  | "istTime"
  | "status"
  | "patientName"
  | "caseId"
  | "doctor"
  | "createdBy"
  | "closureAgent"
>;

export type DoctorSchedule = {
  shiftDate: string;
  bookings: DoctorScheduleBooking[];
  updatedAt?: string | undefined;
};

const storageKey = (date: string, phase: TcSnapshotPhase) => `luxora.tc-shift.${date}.${phase}`;

function localRead(date: string, phase: TcSnapshotPhase) {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(storageKey(date, phase));
  if (!value) return null;
  try {
    return JSON.parse(value) as TcShiftSnapshot;
  } catch {
    return null;
  }
}

function localWrite(snapshot: TcShiftSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    storageKey(snapshot.shiftDate, snapshot.phase),
    JSON.stringify(snapshot),
  );
}

function localRemove(date: string, phase: TcSnapshotPhase) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(date, phase));
}

function rowToSnapshot(row: {
  id: string;
  shift_date: string;
  phase: string;
  scheduled_raw: string;
  aligned_raw: string;
  scheduled_data: Json;
  aligned_data: Json;
  imported_by: string | null;
  imported_by_name: string | null;
  created_at: string;
  updated_at: string;
}): TcShiftSnapshot {
  const snapshot: TcShiftSnapshot = {
    id: row.id,
    shiftDate: row.shift_date,
    phase: row.phase as TcSnapshotPhase,
    scheduledRaw: row.scheduled_raw,
    alignedRaw: row.aligned_raw,
    scheduledBookings: (row.scheduled_data ?? []) as unknown as TcBooking[],
    alignedBookings: (row.aligned_data ?? []) as unknown as TcBooking[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.imported_by) snapshot.importedBy = row.imported_by;
  if (row.imported_by_name) snapshot.importedByName = row.imported_by_name;
  return snapshot;
}

const missingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42P01" || error.code === "PGRST205"));

const doctorScheduleBookings = (bookings: TcBooking[]): DoctorScheduleBooking[] =>
  bookings.map(
    ({ istDate, istTime, status, patientName, caseId, doctor, createdBy, closureAgent }) => ({
      istDate,
      istTime,
      status,
      patientName,
      caseId,
      doctor,
      createdBy,
      closureAgent,
    }),
  );

async function publishDoctorSchedule(snapshot: TcShiftSnapshot, updatedAt: string) {
  const { error } = await supabase.from("tc_doctor_schedule").upsert(
    {
      shift_date: snapshot.shiftDate,
      schedule_data: doctorScheduleBookings(snapshot.scheduledBookings) as unknown as Json,
      updated_at: updatedAt,
    },
    { onConflict: "shift_date" },
  );
  return error;
}

export async function loadDoctorSchedule(shiftDate: string): Promise<DoctorSchedule> {
  const { data, error } = await supabase
    .from("tc_doctor_schedule")
    .select("shift_date, schedule_data, updated_at")
    .eq("shift_date", shiftDate)
    .maybeSingle();

  if (error) throw error;
  return {
    shiftDate,
    bookings: (data?.schedule_data ?? []) as unknown as DoctorScheduleBooking[],
    updatedAt: data?.updated_at,
  };
}

export async function loadTcShiftSnapshots(shiftDate: string) {
  const fallback = {
    opening: localRead(shiftDate, "opening"),
    closing: localRead(shiftDate, "closing"),
    cloudAvailable: false,
    warning: "",
  };

  const { data, error } = await supabase
    .from("tc_shift_snapshots")
    .select("*")
    .eq("shift_date", shiftDate)
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      ...fallback,
      warning: missingTable(error)
        ? "Cloud snapshot table is not installed yet. Using this browser only."
        : `Cloud snapshots unavailable: ${error.message}`,
    };
  }

  const snapshots = (data ?? []).map(rowToSnapshot);
  const opening = snapshots.find((snapshot) => snapshot.phase === "opening") ?? fallback.opening;
  const closing = snapshots.find((snapshot) => snapshot.phase === "closing") ?? fallback.closing;
  if (opening) localWrite(opening);
  if (closing) localWrite(closing);

  return { opening, closing, cloudAvailable: true, warning: "" };
}

type TcLiveJsonPayload = {
  schemaVersion?: number;
  bookings?: TcBooking[];
  crmCount?: number | null;
};

function readCrmHeaderCount(raw: string, label: "Aligned" | "Scheduled"): number | null {
  const match = raw.match(new RegExp(`^\\s*${label}:\\s*(\\d+)\\s*$`, "im"));
  return match ? Number(match[1]) : null;
}

function decodeTcLiveJson(value: Json): { bookings: TcBooking[]; crmCount: number | null } {
  if (Array.isArray(value)) {
    return { bookings: value as unknown as TcBooking[], crmCount: null };
  }
  if (value && typeof value === "object") {
    const payload = value as unknown as TcLiveJsonPayload;
    return {
      bookings: Array.isArray(payload.bookings) ? payload.bookings : [],
      crmCount: typeof payload.crmCount === "number" && Number.isFinite(payload.crmCount)
        ? payload.crmCount
        : null,
    };
  }
  return { bookings: [], crmCount: null };
}

function encodeTcLiveJson(bookings: TcBooking[], crmCount: number | null): Json {
  return {
    schemaVersion: 2,
    bookings: bookings as unknown as Json,
    crmCount,
  } as Json;
}

function rowToLiveState(row: TcLiveStateRow): TcLiveState {
  const scheduled = decodeTcLiveJson(row.scheduled_data ?? []);
  const aligned = decodeTcLiveJson(row.aligned_data ?? []);
  const state: TcLiveState = {
    shiftDate: row.shift_date,
    scheduledBookings: scheduled.bookings,
    alignedBookings: aligned.bookings,
    crmScheduledCount: scheduled.crmCount,
    crmAlignedCount: aligned.crmCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.updated_by) state.updatedBy = row.updated_by;
  if (row.updated_by_name) state.updatedByName = row.updated_by_name;
  return state;
}

/**
 * Publish the latest date-level TC state for QSYS Monthly History.
 * The generated Supabase types do not currently include tc_live_state, so
 * this call intentionally uses `supabase as any` rather than replacing the
 * project's generated types file.
 */
export async function saveTcLiveState(input: {
  shiftDate: string;
  scheduledBookings: TcBooking[];
  alignedBookings: TcBooking[];
  crmScheduledCount?: number | null;
  crmAlignedCount?: number | null;
  updatedByName?: string;
}): Promise<LiveStateSaveResult> {
  const now = new Date().toISOString();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;
  const payload = {
    shift_date: input.shiftDate,
    scheduled_data: encodeTcLiveJson(input.scheduledBookings, input.crmScheduledCount ?? null),
    aligned_data: encodeTcLiveJson(input.alignedBookings, input.crmAlignedCount ?? null),
    updated_by: userId,
    updated_by_name: input.updatedByName || auth.user?.email || null,
    updated_at: now,
  };

  const { data, error } = await (supabase as any)
    .from("tc_live_state")
    .upsert(payload, { onConflict: "shift_date" })
    .select(
      "shift_date, scheduled_data, aligned_data, updated_by, updated_by_name, created_at, updated_at",
    )
    .single();

  if (error) {
    const fallback: TcLiveState = {
      shiftDate: input.shiftDate,
      scheduledBookings: input.scheduledBookings,
      alignedBookings: input.alignedBookings,
      crmScheduledCount: input.crmScheduledCount ?? null,
      crmAlignedCount: input.crmAlignedCount ?? null,
      updatedAt: now,
      ...(input.updatedByName ? { updatedByName: input.updatedByName } : {}),
    };
    return {
      liveState: fallback,
      cloudSaved: false,
      warning: missingTable(error)
        ? "Live TC sync table is not available."
        : `Live TC sync failed: ${error.message}`,
    };
  }

  return {
    liveState: rowToLiveState(data as TcLiveStateRow),
    cloudSaved: true,
  };
}

export async function saveTcShiftSnapshot(snapshot: TcShiftSnapshot): Promise<SnapshotSaveResult> {
  const now = new Date().toISOString();
  const localSnapshot = { ...snapshot, updatedAt: now };
  localWrite(localSnapshot);

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;
  const payload = {
    shift_date: snapshot.shiftDate,
    phase: snapshot.phase,
    scheduled_raw: snapshot.scheduledRaw,
    aligned_raw: snapshot.alignedRaw,
    scheduled_data: snapshot.scheduledBookings as unknown as Json,
    aligned_data: snapshot.alignedBookings as unknown as Json,
    imported_by: userId,
    imported_by_name: snapshot.importedByName || auth.user?.email || null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("tc_shift_snapshots")
    .upsert(payload, { onConflict: "shift_date,phase" })
    .select("*")
    .single();

  const doctorScheduleError = await publishDoctorSchedule(snapshot, now);
  // QSYS Monthly History needs the CRM funnel totals, not the number of visible
  // booking rows. Reschedules can create extra rows (for example 13 visible
  // aligned rows while the CRM header correctly says Aligned: 12).
  const crmScheduledCount =
    readCrmHeaderCount(snapshot.scheduledRaw, "Scheduled") ??
    readCrmHeaderCount(snapshot.alignedRaw, "Scheduled");
  const crmAlignedCount =
    readCrmHeaderCount(snapshot.alignedRaw, "Aligned") ??
    readCrmHeaderCount(snapshot.scheduledRaw, "Aligned");
  const liveStateResult = await saveTcLiveState({
    shiftDate: snapshot.shiftDate,
    scheduledBookings: snapshot.scheduledBookings,
    alignedBookings: snapshot.alignedBookings,
    crmScheduledCount,
    crmAlignedCount,
    updatedByName: snapshot.importedByName,
  });

  if (error) {
    return {
      snapshot: localSnapshot,
      cloudSaved: false,
      doctorSchedulePublished: !doctorScheduleError,
      warning: [
        missingTable(error)
          ? doctorScheduleError
            ? "Saved in this browser only. Run the supplied Supabase setup SQL to publish the doctor schedule."
            : "Saved in this browser and published to the doctor schedule."
          : `Saved in this browser, but cloud save failed: ${error.message}`,
        liveStateResult.warning,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  const saved = rowToSnapshot(data);
  localWrite(saved);
  return {
    snapshot: saved,
    cloudSaved: true,
    doctorSchedulePublished: !doctorScheduleError,
    warning: [
      doctorScheduleError
        ? `Snapshot saved, but doctor schedule was not published: ${doctorScheduleError.message}`
        : undefined,
      liveStateResult.warning,
    ]
      .filter(Boolean)
      .join(" ") || undefined,
  };
}

export async function deleteTcShiftSnapshot(shiftDate: string, phase: TcSnapshotPhase) {
  localRemove(shiftDate, phase);

  const { error } = await supabase
    .from("tc_shift_snapshots")
    .delete()
    .eq("shift_date", shiftDate)
    .eq("phase", phase);

  if (error) {
    return {
      cloudDeleted: false,
      warning: missingTable(error)
        ? "Snapshot removed from this browser. Cloud snapshots are not available yet."
        : `Snapshot removed from this browser, but cloud deletion failed: ${error.message}`,
    };
  }

  return { cloudDeleted: true };
}

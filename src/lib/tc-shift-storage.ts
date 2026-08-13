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

export type DoctorScheduleBooking = Pick<
  TcBooking,
  | "istDate"
  | "istTime"
  | "status"
  | "patientName"
  | "caseId"
  | "doctor"
  | "discoveryAgent"
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
    ({ istDate, istTime, status, patientName, caseId, doctor, discoveryAgent, closureAgent }) => ({
      istDate,
      istTime,
      status,
      patientName,
      caseId,
      doctor,
      discoveryAgent,
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

  if (error) {
    return {
      snapshot: localSnapshot,
      cloudSaved: false,
      doctorSchedulePublished: !doctorScheduleError,
      warning: missingTable(error)
        ? doctorScheduleError
          ? "Saved in this browser only. Run the supplied Supabase setup SQL to publish the doctor schedule."
          : "Saved in this browser and published to the doctor schedule."
        : `Saved in this browser, but cloud save failed: ${error.message}`,
    };
  }

  const saved = rowToSnapshot(data);
  localWrite(saved);
  return {
    snapshot: saved,
    cloudSaved: true,
    doctorSchedulePublished: !doctorScheduleError,
    warning: doctorScheduleError
      ? `Snapshot saved, but doctor schedule was not published: ${doctorScheduleError.message}`
      : undefined,
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

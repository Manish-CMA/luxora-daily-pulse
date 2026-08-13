export type TcBookingStatus =
  "Scheduled" | "Done" | "No-show" | "No Photos" | "Rescheduled" | "Unknown";

export type TcImportSource = "scheduled" | "aligned";

export type TcBooking = {
  source: TcImportSource;
  scheduleLabel: string;
  scheduleDate: string;
  istDate: string;
  patientTime: string;
  patientTimezone: string;
  istTime: string;
  status: TcBookingStatus;
  patientName: string;
  caseId: string;
  doctor: string;
  doctorEmail: string;
  discoveryAgent: string;
  closureAgent: string;
  createdBy: string;
  joiners: number;
  isPast: boolean;
  fingerprint: string;
};

export type TcImportResult = {
  bookings: TcBooking[];
  warnings: string[];
  detectedFilterDate: string;
  crmAlignedCount: number | null;
  crmScheduledCount: number | null;
  totalBlocks: number;
};

export type TcShiftMetrics = {
  totalUnique: number;
  scheduled: number;
  done: number;
  noShow: number;
  noPhotos: number;
  rescheduled: number;
  unknown: number;
  rescheduleEvents: number;
  overdue: number;
  completionRate: number;
};

export type TcBookingChange = {
  caseId: string;
  patientName: string;
  before: TcBooking;
  after: TcBooking;
  changes: string[];
};

export type TcShiftComparison = {
  added: TcBooking[];
  removed: TcBooking[];
  changed: TcBookingChange[];
  newlyAligned: TcBooking[];
};

const BOOKING_HEADER =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})\s+([A-Z][a-z]{2}),\s+(\d{1,2}:\d{2})\s+\(GMT([+-]\d{1,2}(?::\d{2})?)\)(?:\s*[·•]\s*(\d{1,2}:\d{2})\s+IST)?$/;

const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const STATUS_VALUES: TcBookingStatus[] = [
  "Scheduled",
  "Done",
  "No-show",
  "No Photos",
  "Rescheduled",
];

const normalizeLine = (line: string) =>
  line
    .replace(/\u00a0/g, " ")
    .replace(/\\:/g, ":")
    .replace(/\s+/g, " ")
    .trim();

const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const pad = (value: number) => String(value).padStart(2, "0");

function parseTime(value: string): number {
  const [hours = 0, minutes = 0] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseOffset(value: string): number {
  const sign = value.startsWith("-") ? -1 : 1;
  const [hours, minutes = "0"] = value.slice(1).split(":");
  return sign * (Number(hours) * 60 + Number(minutes));
}

function dateIso(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shiftIsoDate(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function findFilterDate(lines: string[], source: TcImportSource): string {
  const marker = source === "scheduled" ? "Call From" : "Booked From";
  const markerIndex = lines.findIndex((line) => line.toLowerCase() === marker.toLowerCase());
  const candidates = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;
  const value = candidates.find((line) => /^\d{2}-\d{2}-\d{4}$/.test(line));
  if (!value) return "";
  const [day = "", month = "", year = ""] = value.split("-");
  return `${year}-${month}-${day}`;
}

function readHeaderCount(lines: string[], label: "Aligned" | "Scheduled") {
  const match = lines
    .map((line) => line.match(new RegExp(`^${label}:\\s*(\\d+)$`, "i")))
    .find(Boolean);
  return match ? Number(match[1] ?? 0) : null;
}

function parseStatus(value: string): TcBookingStatus {
  const normalized = value.toLowerCase().replace(/\s+/g, " ");
  return STATUS_VALUES.find((status) => status.toLowerCase() === normalized) ?? "Unknown";
}

function readValue(lines: string[], prefix: string) {
  const line = lines.find((candidate) => candidate.toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? line.slice(prefix.length).trim() : "";
}

function readClosureAgent(lines: string[]) {
  const index = lines.findIndex((line) => line.toLowerCase() === "closure agent:");
  if (index < 0) return "";
  return (lines[index + 1] ?? "")
    .replace(/\s*✓\s*$/, "")
    .replace(/^—\s*None\s*—$/i, "")
    .trim();
}

function readEmail(lines: string[]) {
  for (const line of lines) {
    const mailto = line.match(/mailto\\?:([^\s)]+)/i);
    if (mailto) return (mailto[1] ?? "").replace(/\\/g, "");
    const plain = line.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    if (plain) return plain[0];
  }
  return "";
}

function inferYear(filterDate: string, month: number) {
  if (!filterDate) return new Date().getFullYear();
  const filterYear = Number(filterDate.slice(0, 4));
  const filterMonth = Number(filterDate.slice(5, 7));
  if (filterMonth === 12 && month === 1) return filterYear + 1;
  if (filterMonth === 1 && month === 12) return filterYear - 1;
  return filterYear;
}

function parseBlock(block: string[], source: TcImportSource, filterDate: string): TcBooking | null {
  const header = block[0]?.match(BOOKING_HEADER);
  if (!header) return null;

  const dayRaw = header[2];
  const monthName = header[3];
  const patientTimeRaw = header[4];
  const offsetRaw = header[5];
  const shownIst = header[6];
  if (!dayRaw || !monthName || !patientTimeRaw || !offsetRaw) return null;
  const month = MONTHS[monthName];
  if (!month) return null;

  const year = inferYear(filterDate, month);
  const scheduleDate = dateIso(year, month, Number(dayRaw));
  const patientMinutes = parseTime(patientTimeRaw);
  const calculatedIst = patientMinutes + (330 - parseOffset(offsetRaw));
  const dayShift = Math.floor(calculatedIst / 1440);
  const wrappedIst = ((calculatedIst % 1440) + 1440) % 1440;
  const calculatedTime = `${pad(Math.floor(wrappedIst / 60))}:${pad(wrappedIst % 60)}`;
  const istTime = shownIst
    ? shownIst
        .split(":")
        .map((part) => pad(Number(part)))
        .join(":")
    : calculatedTime;
  const istDate = shiftIsoDate(scheduleDate, shownIst ? 0 : dayShift);

  const content = block.slice(1);
  const outcomeBoundary = content.findIndex((line) => line.toLowerCase() === "set outcome:");
  const identityLines = outcomeBoundary >= 0 ? content.slice(0, outcomeBoundary) : content;
  let cursor = 0;
  const isPast = identityLines[cursor]?.toLowerCase() === "past";
  if (isPast) cursor += 1;
  const status = parseStatus(identityLines[cursor] ?? "");
  if (status !== "Unknown") cursor += 1;

  const patientName = identityLines[cursor] ?? "";
  const caseId = identityLines[cursor + 1] ?? "";
  const doctor = identityLines[cursor + 2] ?? "";
  if (!patientName || !caseId || !doctor.toLowerCase().startsWith("dr")) {
    return null;
  }

  const joinerLine = identityLines.find((line) => /\d+\s+joiners?$/i.test(line));
  const joiners = joinerLine ? Number(joinerLine.match(/\d+/)?.[0] ?? 0) : 0;
  const discoveryAgent = readValue(identityLines, "Discovery:");
  const createdBy = readValue(identityLines, "Created by");
  const closureAgent = readClosureAgent(identityLines);
  const fingerprint = [caseId, istDate, istTime, doctor].map(normalizeKey).join("|");

  return {
    source,
    scheduleLabel: block[0] ?? "",
    scheduleDate,
    istDate,
    patientTime: patientTimeRaw,
    patientTimezone: `GMT${offsetRaw}`,
    istTime,
    status,
    patientName,
    caseId,
    doctor,
    doctorEmail: readEmail(identityLines),
    discoveryAgent,
    closureAgent,
    createdBy,
    joiners,
    isPast,
    fingerprint,
  };
}

export function parseTcBookings(raw: string, source: TcImportSource): TcImportResult {
  const lines = raw.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const detectedFilterDate = findFilterDate(lines, source);
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (BOOKING_HEADER.test(line)) starts.push(index);
  });

  const bookings: TcBooking[] = [];
  const warnings: string[] = [];
  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    const booking = parseBlock(lines.slice(start, end), source, detectedFilterDate);
    if (booking) bookings.push(booking);
    else warnings.push(`Could not read booking beginning: ${lines[start]}`);
  });

  const deduped = [...new Map(bookings.map((booking) => [booking.fingerprint, booking])).values()];
  if (!raw.trim()) warnings.push("Paste CRM booking text to begin.");
  else if (starts.length === 0) warnings.push("No booking rows were detected in the pasted text.");

  return {
    bookings: deduped,
    warnings,
    detectedFilterDate,
    crmAlignedCount: readHeaderCount(lines, "Aligned"),
    crmScheduledCount: readHeaderCount(lines, "Scheduled"),
    totalBlocks: starts.length,
  };
}

const statusPriority: Record<TcBookingStatus, number> = {
  Done: 6,
  "No-show": 5,
  "No Photos": 4,
  Scheduled: 3,
  Unknown: 2,
  Rescheduled: 1,
};

export function effectiveBookings(bookings: TcBooking[]): TcBooking[] {
  const grouped = new Map<string, TcBooking[]>();
  bookings.forEach((booking) => {
    const key = normalizeKey(booking.caseId);
    grouped.set(key, [...(grouped.get(key) ?? []), booking]);
  });

  return [...grouped.values()]
    .flatMap((rows) => {
      const best = [...rows].sort(
        (a, b) =>
          statusPriority[b.status] - statusPriority[a.status] ||
          `${b.istDate}T${b.istTime}`.localeCompare(`${a.istDate}T${a.istTime}`),
      )[0];
      return best ? [best] : [];
    })
    .sort((a, b) => `${a.istDate}T${a.istTime}`.localeCompare(`${b.istDate}T${b.istTime}`));
}

export function bookingTimestamp(booking: TcBooking): number {
  return new Date(`${booking.istDate}T${booking.istTime}:00+05:30`).getTime();
}

/** A standard TC occupies a 30-minute slot. */
export const TC_DURATION_MS = 30 * 60 * 1000;

export function bookingEndTimestamp(booking: TcBooking): number {
  return bookingTimestamp(booking) + TC_DURATION_MS;
}

export function computeTcShiftMetrics(bookings: TcBooking[], now = Date.now()): TcShiftMetrics {
  const effective = effectiveBookings(bookings);
  const count = (status: TcBookingStatus) =>
    effective.filter((booking) => booking.status === status).length;
  const done = count("Done");
  const totalUnique = effective.length;
  const scheduled = count("Scheduled");
  const overdue = effective.filter(
    (booking) => booking.status === "Scheduled" && bookingEndTimestamp(booking) <= now,
  ).length;

  return {
    totalUnique,
    scheduled,
    done,
    noShow: count("No-show"),
    noPhotos: count("No Photos"),
    rescheduled: count("Rescheduled"),
    unknown: count("Unknown"),
    rescheduleEvents: bookings.filter((booking) => booking.status === "Rescheduled").length,
    overdue,
    completionRate: totalUnique > 0 ? (done / totalUnique) * 100 : 0,
  };
}

function byCase(bookings: TcBooking[]) {
  return new Map(
    effectiveBookings(bookings).map((booking) => [normalizeKey(booking.caseId), booking]),
  );
}

export function compareTcShiftSnapshots(
  openingScheduled: TcBooking[],
  closingScheduled: TcBooking[],
  openingAligned: TcBooking[],
  closingAligned: TcBooking[],
): TcShiftComparison {
  const opening = byCase(openingScheduled);
  const closing = byCase(closingScheduled);
  const openingAlignedCases = new Set(
    effectiveBookings(openingAligned).map((booking) => normalizeKey(booking.caseId)),
  );

  const added = [...closing.entries()]
    .filter(([caseId]) => !opening.has(caseId))
    .map(([, booking]) => booking);
  const removed = [...opening.entries()]
    .filter(([caseId]) => !closing.has(caseId))
    .map(([, booking]) => booking);
  const changed: TcBookingChange[] = [];

  closing.forEach((after, caseId) => {
    const before = opening.get(caseId);
    if (!before) return;
    const changes: string[] = [];
    if (before.status !== after.status) changes.push(`${before.status} → ${after.status}`);
    if (`${before.istDate} ${before.istTime}` !== `${after.istDate} ${after.istTime}`)
      changes.push(`${before.istTime} → ${after.istTime} IST`);
    if (normalizeKey(before.doctor) !== normalizeKey(after.doctor))
      changes.push(`${before.doctor} → ${after.doctor}`);
    if (normalizeKey(before.discoveryAgent) !== normalizeKey(after.discoveryAgent))
      changes.push(`Discovery: ${before.discoveryAgent || "—"} → ${after.discoveryAgent || "—"}`);
    if (normalizeKey(before.closureAgent) !== normalizeKey(after.closureAgent))
      changes.push(`Closure: ${before.closureAgent || "—"} → ${after.closureAgent || "—"}`);
    if (changes.length)
      changed.push({
        caseId: after.caseId,
        patientName: after.patientName,
        before,
        after,
        changes,
      });
  });

  const newlyAligned = effectiveBookings(closingAligned).filter(
    (booking) => !openingAlignedCases.has(normalizeKey(booking.caseId)),
  );

  return { added, removed, changed, newlyAligned };
}

export function maskCaseId(caseId: string) {
  if (caseId.length <= 5) return caseId;
  return `${caseId.slice(0, 4)}•••${caseId.slice(-3)}`;
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Patient";
}

export function fmtIstTimestamp(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

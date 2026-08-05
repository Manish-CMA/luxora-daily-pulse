import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_AGENT_NAMES,
  newAgent,
  type Agent,
  type DashboardState,
} from "@/lib/dashboard";

export type RosterAgent = { id: string; name: string; active: boolean };
export type ReportStatus = "draft" | "submitted" | "edited";
export type SavedReport = DashboardState & {
  submittedAt: string;
  submittedBy?: string;
  status?: ReportStatus;
  lastEditedBy?: string;
  lastEditedAt?: string;
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  edited: "Edited After Submission",
};

const SUBMITTER_KEY = "luxora-submitter-v1";
export const DRAFT_KEY = "luxora-tc-dashboard-v1";

/* Legacy local keys kept only for the one-time migration to the cloud. */
const LEGACY_ROSTER_KEY = "luxora-roster-v1";
const LEGACY_REPORTS_KEY = "luxora-reports-v1";
const MIGRATED_KEY = "cureme-cloud-migrated-v1";

const isBrowser = () => typeof window !== "undefined";

/* ---------------- In-memory shared cache ---------------- */

let rosterCache: RosterAgent[] = [];
let reportsCache: SavedReport[] = [];
let hydrated = false;

const emit = () => {
  if (isBrowser()) window.dispatchEvent(new Event("luxora-store-change"));
};

export function onStoreChange(cb: () => void) {
  if (!isBrowser()) return () => {};
  window.addEventListener("luxora-store-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("luxora-store-change", cb);
    window.removeEventListener("storage", cb);
  };
}

export const isHydrated = () => hydrated;

/* ---------------- Cloud loading ---------------- */

type ReportRow = {
  id: string;
  report_date: string;
  status: string | null;
  submitted_by_name: string | null;
  submitted_at: string;
  last_edited_by_name: string | null;
  last_edited_at: string | null;
};

type EntryRow = {
  report_id: string;
  agent_id: string | null;
  agent_name: string;
  calls_made: number;
  calls_picked: number;
  pre_tc: number;
  pre_tc_to_tc: number;
  direct_tc: number;
};

function toSavedReports(rows: ReportRow[], entries: EntryRow[]): SavedReport[] {
  const byReport = new Map<string, Agent[]>();
  for (const e of entries) {
    const list = byReport.get(e.report_id) ?? [];
    list.push({
      id: e.agent_id ?? crypto.randomUUID(),
      name: e.agent_name,
      callsMade: e.calls_made,
      callsPicked: e.calls_picked,
      preTc: e.pre_tc,
      preTcToTc: e.pre_tc_to_tc,
      directTc: e.direct_tc,
    });
    byReport.set(e.report_id, list);
  }
  return rows.map((r) => ({
    date: r.report_date,
    agents: byReport.get(r.id) ?? [],
    submittedAt: r.submitted_at,
    ...(r.submitted_by_name ? { submittedBy: r.submitted_by_name } : {}),
    status: (r.status as ReportStatus) ?? "submitted",
    ...(r.last_edited_by_name ? { lastEditedBy: r.last_edited_by_name } : {}),
    ...(r.last_edited_at ? { lastEditedAt: r.last_edited_at } : {}),
  }));
}

async function loadFromCloud() {
  const [{ data: agentRows }, { data: reportRows }, { data: entryRows }] =
    await Promise.all([
      supabase.from("agents").select("id, name, active").order("created_at"),
      supabase
        .from("daily_reports")
        .select(
          "id, report_date, status, submitted_by_name, submitted_at, last_edited_by_name, last_edited_at",
        )
        .order("report_date", { ascending: false }),
      supabase
        .from("daily_report_entries")
        .select(
          "report_id, agent_id, agent_name, calls_made, calls_picked, pre_tc, pre_tc_to_tc, direct_tc",
        ),
    ]);

  rosterCache = (agentRows ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    active: a.active !== false,
  }));
  reportsCache = toSavedReports(
    (reportRows ?? []) as ReportRow[],
    (entryRows ?? []) as EntryRow[],
  );
}

async function seedDefaultAgents() {
  const rows = DEFAULT_AGENT_NAMES.map((name) => ({ name, active: true }));
  const { data } = await supabase.from("agents").insert(rows).select("id, name, active");
  rosterCache = (data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    active: a.active !== false,
  }));
}

/** One-time upload of anything still sitting in this browser's local storage. */
async function migrateLocalData() {
  if (!isBrowser() || localStorage.getItem(MIGRATED_KEY)) return false;
  let didWork = false;
  try {
    const rawRoster = localStorage.getItem(LEGACY_ROSTER_KEY);
    const localRoster: RosterAgent[] = rawRoster ? JSON.parse(rawRoster) : [];
    if (rosterCache.length === 0 && localRoster.length > 0) {
      await supabase.from("agents").insert(
        localRoster.map((r) => ({
          id: r.id,
          name: r.name,
          active: r.active !== false,
        })),
      );
      didWork = true;
    }

    const rawReports = localStorage.getItem(LEGACY_REPORTS_KEY);
    const localReports: SavedReport[] = rawReports ? JSON.parse(rawReports) : [];
    const existingDates = new Set(reportsCache.map((r) => r.date));
    for (const rep of localReports) {
      if (existingDates.has(rep.date)) continue;
      await persistReport(rep);
      didWork = true;
    }
  } catch (e) {
    console.error("Local data migration failed", e);
  }
  localStorage.setItem(MIGRATED_KEY, "1");
  return didWork;
}

/** Load shared data from the cloud into the in-memory cache. */
export async function hydrateStore() {
  await loadFromCloud();
  const migrated = await migrateLocalData();
  if (rosterCache.length === 0) await seedDefaultAgents();
  if (migrated) await loadFromCloud();
  hydrated = true;
  emit();
}

export async function refreshStore() {
  await loadFromCloud();
  emit();
}

export function resetStore() {
  rosterCache = [];
  reportsCache = [];
  hydrated = false;
}

/* ---------------- Roster ---------------- */

export function getRoster(): RosterAgent[] {
  return rosterCache;
}

export function getActiveRoster(): RosterAgent[] {
  return rosterCache.filter((r) => r.active);
}

export function saveRoster(list: RosterAgent[]) {
  const removed = rosterCache.filter((r) => !list.some((n) => n.id === r.id));
  rosterCache = list;
  emit();
  void (async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      if (removed.length > 0)
        await supabase
          .from("agents")
          .delete()
          .in("id", removed.map((r) => r.id));
      if (list.length > 0)
        await supabase.from("agents").upsert(
          list.map((r) => ({
            id: r.id,
            name: r.name,
            active: r.active,
            created_by: uid,
          })),
        );
      await refreshStore();
    } catch (e) {
      console.error("Failed to save agents", e);
    }
  })();
}

/** Build the daily entry rows from the roster, keeping any existing values. */
export function syncAgentsWithRoster(
  roster: RosterAgent[],
  existing: Agent[],
): Agent[] {
  return roster
    .filter((r) => r.active)
    .map((r) => {
      const prev = existing.find((a) => a.id === r.id);
      return prev ? { ...prev, name: r.name } : newAgent(r.name, r.id);
    });
}

/* ---------------- Reports ---------------- */

export function getReports(): SavedReport[] {
  return reportsCache.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getReportByDate(date: string): SavedReport | undefined {
  return reportsCache.find((r) => r.date === date);
}

export function getSubmitterName(): string {
  if (!isBrowser()) return "";
  try {
    return JSON.parse(localStorage.getItem(SUBMITTER_KEY) ?? '""') as string;
  } catch {
    return "";
  }
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function persistReport(report: SavedReport) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;

  const { data: saved, error } = await supabase
    .from("daily_reports")
    .upsert(
      {
        report_date: report.date,
        status: report.status ?? "submitted",
        submitted_by: uid,
        submitted_by_name: report.submittedBy ?? null,
        submitted_at: report.submittedAt,
        last_edited_by: report.lastEditedAt ? uid : null,
        last_edited_by_name: report.lastEditedBy ?? null,
        last_edited_at: report.lastEditedAt ?? null,
      },
      { onConflict: "report_date" },
    )
    .select("id")
    .single();
  if (error || !saved) throw error ?? new Error("Report not saved");

  await supabase.from("daily_report_entries").delete().eq("report_id", saved.id);
  if (report.agents.length > 0)
    await supabase.from("daily_report_entries").insert(
      report.agents.map((a) => ({
        report_id: saved.id,
        agent_id: isUuid(a.id) ? a.id : null,
        agent_name: a.name,
        calls_made: a.callsMade || 0,
        calls_picked: a.callsPicked || 0,
        pre_tc: a.preTc || 0,
        pre_tc_to_tc: a.preTcToTc || 0,
        direct_tc: a.directTc || 0,
      })),
    );
}

export function saveReport(
  report: DashboardState,
  submittedBy?: string,
  mode: "submit" | "edit" = "submit",
) {
  const existing = reportsCache.find((r) => r.date === report.date);
  const by = (submittedBy ?? "").trim();
  if (by && isBrowser()) localStorage.setItem(SUBMITTER_KEY, JSON.stringify(by));
  const now = new Date().toISOString();
  const isEdit = mode === "edit" && Boolean(existing);

  const next: SavedReport = {
    ...report,
    submittedAt: isEdit ? (existing?.submittedAt ?? now) : now,
    ...(isEdit
      ? existing?.submittedBy
        ? { submittedBy: existing.submittedBy }
        : by
          ? { submittedBy: by }
          : {}
      : by
        ? { submittedBy: by }
        : {}),
    status: isEdit ? "edited" : "submitted",
    ...(isEdit ? { lastEditedAt: now, ...(by ? { lastEditedBy: by } : {}) } : {}),
  };

  reportsCache = [...reportsCache.filter((r) => r.date !== report.date), next];
  emit();
  void (async () => {
    try {
      await persistReport(next);
      await refreshStore();
    } catch (e) {
      console.error("Failed to save report", e);
    }
  })();
}

export function reportStatus(r?: SavedReport | null): ReportStatus {
  if (!r) return "draft";
  return r.status ?? "submitted";
}

export function deleteReport(date: string) {
  reportsCache = reportsCache.filter((r) => r.date !== date);
  emit();
  void (async () => {
    try {
      await supabase.from("daily_reports").delete().eq("report_date", date);
      await refreshStore();
    } catch (e) {
      console.error("Failed to delete report", e);
    }
  })();
}

export function clearAllData() {
  const dates = reportsCache.map((r) => r.date);
  reportsCache = [];
  if (isBrowser()) localStorage.removeItem(DRAFT_KEY);
  emit();
  void (async () => {
    try {
      if (dates.length > 0)
        await supabase.from("daily_reports").delete().in("report_date", dates);
      await refreshStore();
    } catch (e) {
      console.error("Failed to clear reports", e);
    }
  })();
}

/* ---------------- Validation ---------------- */

export function validateReport(state: DashboardState): string[] {
  const errors: string[] = [];

  if (!state.date) {
    errors.push("Please pick a report date.");
  }

  const named = state.agents.filter((a) => a.name.trim().length > 0);

  if (named.length === 0) {
    errors.push("Add at least one agent in Agent Management.");
  }

  const hasData = named.some(
    (a) =>
      a.callsMade ||
      a.callsPicked ||
      a.preTc ||
      a.preTcToTc ||
      a.directTc,
  );

  if (!hasData) {
    errors.push("Enter performance data for at least one agent.");
  }

  for (const a of named) {
    // Calls picked cannot exceed calls made
    if (a.callsPicked > a.callsMade) {
      errors.push(`${a.name}: calls picked cannot exceed calls made.`);
    }

    // Only check for negative/invalid values
    if (
      [a.callsMade, a.callsPicked, a.preTc, a.preTcToTc, a.directTc].some(
        (n) => n < 0 || !Number.isFinite(n),
      )
    ) {
      errors.push(`${a.name}: values must be positive numbers.`);
    }
  }

  return errors;
}

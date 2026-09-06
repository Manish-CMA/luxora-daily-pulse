import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_AGENT_NAMES, newAgent, type Agent, type DashboardState } from "@/lib/dashboard";

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

const toMetric = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
};

/** Upgrade old/local agent rows and guarantee every metric is present. */
function normalizeAgent(agent: Partial<Agent>): Agent {
  const name = typeof agent.name === "string" ? agent.name : "";
  const id = typeof agent.id === "string" && agent.id ? agent.id : undefined;
  const base = newAgent(name, id);

  return {
    ...base,
    callsMade: toMetric(agent.callsMade),
    callsPicked: toMetric(agent.callsPicked),
    preTc: toMetric(agent.preTc),
    preTcToTc: toMetric(agent.preTcToTc),
    directTc: toMetric(agent.directTc),
  };
}

const normalizeAgents = (agents: Partial<Agent>[] | undefined): Agent[] =>
  Array.isArray(agents) ? agents.map(normalizeAgent) : [];

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
  tc_scheduled: number | null;
  tc_done: number | null;
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
    list.push(
      normalizeAgent({
        ...(e.agent_id ? { id: e.agent_id } : {}),
        name: e.agent_name,
        callsMade: e.calls_made,
        callsPicked: e.calls_picked,
        preTc: 0,
        preTcToTc: 0,
        directTc: e.direct_tc + e.pre_tc_to_tc,
      }),
    );
    byReport.set(e.report_id, list);
  }
  return rows.map((r) => ({
    date: r.report_date,
    agents: byReport.get(r.id) ?? [],
    tcScheduled: toMetric(r.tc_scheduled),
    tcDone: toMetric(r.tc_done),
    submittedAt: r.submitted_at,
    ...(r.submitted_by_name ? { submittedBy: r.submitted_by_name } : {}),
    status: (r.status as ReportStatus) ?? "submitted",
    ...(r.last_edited_by_name ? { lastEditedBy: r.last_edited_by_name } : {}),
    ...(r.last_edited_at ? { lastEditedAt: r.last_edited_at } : {}),
  }));
}

async function loadFromCloud() {
  const [{ data: agentRows }, { data: reportRows }, { data: entryRows }] = await Promise.all([
    supabase.from("agents").select("id, name, active").order("created_at"),
    supabase
      .from("daily_reports")
      .select(
        "id, report_date, status, submitted_by_name, submitted_at, last_edited_by_name, last_edited_at, tc_scheduled, tc_done",
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
  reportsCache = toSavedReports((reportRows ?? []) as ReportRow[], (entryRows ?? []) as EntryRow[]);
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
      await persistReport({
        ...rep,
        agents: normalizeAgents(rep.agents),
        tcScheduled: toMetric(rep.tcScheduled),
        tcDone: toMetric(rep.tcDone),
      });
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

export async function saveRoster(list: RosterAgent[]) {
  const removed = rosterCache.filter((r) => !list.some((n) => n.id === r.id));
  if (removed.length > 0) {
    const { error } = await supabase
      .from("agents")
      .delete()
      .in(
        "id",
        removed.map((r) => r.id),
      );
    if (error) throw error;
  }
  if (list.length > 0) {
    const { error } = await supabase.from("agents").upsert(
      list.map((r) => ({ id: r.id, name: r.name, active: r.active })),
    );
    if (error) throw error;
  }
  await refreshStore();
}

/** Build the daily entry rows from the roster, keeping any existing values. */
export function syncAgentsWithRoster(roster: RosterAgent[], existing: Agent[]): Agent[] {
  return roster
    .filter((r) => r.active)
    .map((r) => {
      const prev = existing.find((a) => a.id === r.id);
      return prev ? normalizeAgent({ ...prev, id: r.id, name: r.name }) : newAgent(r.name, r.id);
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
        tc_scheduled: toMetric(report.tcScheduled),
        tc_done: toMetric(report.tcDone),
      },
      { onConflict: "report_date" },
    )
    .select("id")
    .single();
  if (error || !saved) throw error ?? new Error("Report not saved");

  await supabase.from("daily_report_entries").delete().eq("report_id", saved.id);
  const normalizedAgents = normalizeAgents(report.agents);
  if (normalizedAgents.length > 0)
    await supabase.from("daily_report_entries").insert(
      normalizedAgents.map((a) => ({
        report_id: saved.id,
        agent_id: isUuid(a.id) ? a.id : null,
        agent_name: a.name,
        calls_made: a.callsMade || 0,
        calls_picked: a.callsPicked || 0,
        pre_tc: 0,
        pre_tc_to_tc: 0,
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
    agents: normalizeAgents(report.agents),
    tcScheduled: toMetric(report.tcScheduled),
    tcDone: toMetric(report.tcDone),
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
      if (dates.length > 0) await supabase.from("daily_reports").delete().in("report_date", dates);
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
    (a) => a.callsMade || a.callsPicked || a.directTc,
  );

  if (!hasData && !state.tcScheduled && !state.tcDone) {
    errors.push("Enter agent performance or daily TC totals.");
  }

  const tcTotals = [state.tcScheduled, state.tcDone];
  if (
    tcTotals.some(
      (value) =>
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < 0 ||
        !Number.isInteger(value),
    )
  ) {
    errors.push("TC Scheduled and TC Done must be non-negative whole numbers.");
  } else if (state.tcDone > state.tcScheduled) {
    errors.push("TC Done cannot exceed TC Scheduled.");
  }

  for (const a of named) {
    const values = [a.callsMade, a.callsPicked, a.directTc];

    if (
      values.some(
        (value) =>
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          !Number.isInteger(value),
      )
    ) {
      errors.push(`${a.name}: values must be non-negative whole numbers.`);
      continue;
    }

    if (a.callsPicked > a.callsMade) {
      errors.push(`${a.name}: calls picked cannot exceed calls made.`);
    }
  }

  return errors;
}

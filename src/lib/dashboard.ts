export type Agent = {
  id: string;
  name: string;
  callsMade: number;
  callsPicked: number;
  preTc: number;
  preTcToTc: number;
  directTc: number;
};

export type DashboardState = {
  date: string; // yyyy-MM-dd
  agents: Agent[];
};

export const NUMERIC_FIELDS = [
  "callsMade",
  "callsPicked",
  "preTc",
  "preTcToTc",
  "directTc",
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export const COLUMNS: { key: NumericField; label: string }[] = [
  { key: "callsMade", label: "Calls Made" },
  { key: "callsPicked", label: "Calls Picked Up" },
  { key: "preTc", label: "Pre-TC by AI Bot" },
  { key: "preTcToTc", label: "Converted into TC by Agents" },
  { key: "directTc", label: "Direct TC" },
];

export const DEFAULT_AGENT_NAMES = [
  "Manav",
  "Vandita",
  "Meenu",
  "Himanshu",
  "Aman",
];

export const newAgent = (name = "", id?: string): Agent => ({
  id: id ?? crypto.randomUUID(),
  name,
  callsMade: 0,
  callsPicked: 0,
  preTc: 0,
  preTcToTc: 0,
  directTc: 0,
});

export const todayIso = () => new Date().toISOString().slice(0, 10);

export const defaultState = (): DashboardState => ({
  date: todayIso(),
  agents: [],
});

export type Totals = Record<NumericField, number> & {
  totalTcsLinedUp: number;
  pendingPreTc: number;
  pickupRate: number;
  preTcToTcRate: number;
};

export function computeTotals(agents: Agent[]): Totals {
  const sum = (f: NumericField) => agents.reduce((a, b) => a + (b[f] || 0), 0);
  const t = {
    callsMade: sum("callsMade"),
    callsPicked: sum("callsPicked"),
    preTc: sum("preTc"),
    preTcToTc: sum("preTcToTc"),
    directTc: sum("directTc"),
  };
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);

  return {
    ...t,
    totalTcsLinedUp: t.preTcToTc + t.directTc,
    pendingPreTc: Math.max(0, t.preTc - t.preTcToTc),
    pickupRate: pct(t.callsPicked, t.callsMade),
    preTcToTcRate: pct(t.preTcToTc, t.preTc),
  };
} // <-- THIS BRACE WAS MISSING

export const agentTcsLinedUp = (a: Agent) => a.preTcToTc + a.directTc;

export const agentPreTcLinedUp = (a: Agent) =>
  Math.max(0, a.preTc - a.preTcToTc);

export function topPerformer(agents: Agent[]): Agent | null {
  const named = agents.filter((a) => a.name.trim().length > 0);
  if (named.length === 0) return null;
  const sorted = [...named].sort(
    (a, b) =>
      agentTcsLinedUp(b) - agentTcsLinedUp(a) ||
      b.preTcToTc - a.preTcToTc ||
      b.callsPicked - a.callsPicked,
  );
  const best = sorted[0];
  if (!best) return null;
  const hasData =
    best.preTcToTc > 0 || best.directTc > 0 || best.callsPicked > 0;
  return hasData ? best : null;
}

/** Ranked list of agents with data, using the top-performer ordering. */
export function topPerformers(agents: Agent[], count = 3): Agent[] {
  return agents
    .filter(
      (a) =>
        a.name.trim().length > 0 &&
        (a.preTcToTc > 0 || a.directTc > 0 || a.callsPicked > 0),
    )
    .sort(
      (a, b) =>
        agentTcsLinedUp(b) - agentTcsLinedUp(a) ||
        b.preTcToTc - a.preTcToTc ||
        b.callsPicked - a.callsPicked,
    )
    .slice(0, count);
}

export function leader(agents: Agent[], field: NumericField): Agent | null {
  const named = agents.filter((a) => a.name.trim().length > 0 && a[field] > 0);
  if (named.length === 0) return null;
  return named.reduce((a, b) => (b[field] > a[field] ? b : a));
}

/** Merge multiple daily agent rows into one aggregated row per agent name. */
export function aggregateAgents(rows: Agent[][]): Agent[] {
  const map = new Map<string, Agent>();
  for (const day of rows) {
    for (const a of day) {
      if (!a.name.trim()) continue;
      const key = a.id || a.name;
      const cur = map.get(key) ?? newAgent(a.name, a.id);
      map.set(key, {
        ...cur,
        name: a.name,
        callsMade: cur.callsMade + (a.callsMade || 0),
        callsPicked: cur.callsPicked + (a.callsPicked || 0),
        preTc: cur.preTc + (a.preTc || 0),
        preTcToTc: cur.preTcToTc + (a.preTcToTc || 0),
        directTc: cur.directTc + (a.directTc || 0),
      });
    }
  }
  return [...map.values()];
}

export const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

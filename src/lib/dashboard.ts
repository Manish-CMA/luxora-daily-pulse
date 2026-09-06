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
  tcScheduled: number;
  tcDone: number;
};

export const NUMERIC_FIELDS = [
  "callsMade",
  "callsPicked",
  "directTc",
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export const COLUMNS: { key: NumericField; label: string }[] = [
  { key: "callsMade", label: "Calls Made" },
  { key: "callsPicked", label: "Calls Picked Up" },
  { key: "directTc", label: "TCs Aligned" },
];

export const DEFAULT_AGENT_NAMES = [
  "Manav",
  "Vandita",
  "Meenu",
  "Himanshu",
  "Aman",
];

function createId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const newAgent = (name = "", id?: string): Agent => ({
  id: id ?? createId(),
  name,
  callsMade: 0,
  callsPicked: 0,
  preTc: 0,
  preTcToTc: 0,
  directTc: 0,
});

export function todayIso(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return new Date().toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

export const defaultState = (): DashboardState => ({
  date: todayIso(),
  agents: [],
  tcScheduled: 0,
  tcDone: 0,
});

export type Totals = Record<NumericField, number> & {
  totalTcsLinedUp: number;
  totalTcScheduled: number;
  totalTcDone: number;
  pickupRate: number;
  tcCompletionRate: number;
};

export function computeTotals(
  agents: Agent[],
  tcScheduled = 0,
  tcDone = 0,
): Totals {
  const sum = (field: NumericField) =>
    agents.reduce((total, agent) => total + (agent[field] || 0), 0);

  const callsMade = sum("callsMade");
  const callsPicked = sum("callsPicked");
  const directTc = sum("directTc");
  const scheduled = Math.max(0, Number.isFinite(tcScheduled) ? tcScheduled : 0);
  const done = Math.max(0, Number.isFinite(tcDone) ? tcDone : 0);
  const percentage = (value: number, total: number) =>
    total > 0 ? (value / total) * 100 : 0;

  return {
    callsMade,
    callsPicked,
    directTc,
    totalTcsLinedUp: directTc,
    totalTcScheduled: scheduled,
    totalTcDone: done,
    pickupRate: percentage(callsPicked, callsMade),
    tcCompletionRate: percentage(done, scheduled),
  };
}

export const agentTcsLinedUp = (agent: Agent) => agent.directTc;

/** Human team members with at least one recorded performance metric. */
export function activeHumanAgents(agents: Agent[]): Agent[] {
  return agents.filter((agent) => {
    const normalizedName = agent.name.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalizedName || normalizedName === "ai bot") return false;
    return NUMERIC_FIELDS.some((field) => (agent[field] || 0) > 0);
  });
}

function hasPerformanceData(agent: Agent): boolean {
  return agent.callsPicked > 0 || agent.directTc > 0;
}

function compareAgentPerformance(a: Agent, b: Agent): number {
  return (
    agentTcsLinedUp(b) - agentTcsLinedUp(a) ||
    b.callsPicked - a.callsPicked ||
    a.name.localeCompare(b.name)
  );
}

export function topPerformer(agents: Agent[]): Agent | null {
  return (
    agents
      .filter(
        (agent) => agent.name.trim().length > 0 && hasPerformanceData(agent),
      )
      .sort(compareAgentPerformance)[0] ?? null
  );
}

export function topPerformers(agents: Agent[], count = 3): Agent[] {
  return agents
    .filter(
      (agent) => agent.name.trim().length > 0 && hasPerformanceData(agent),
    )
    .sort(compareAgentPerformance)
    .slice(0, Math.max(0, count));
}

export function leader(agents: Agent[], field: NumericField): Agent | null {
  const eligible = agents.filter(
    (agent) => agent.name.trim().length > 0 && agent[field] > 0,
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((current, agent) =>
    agent[field] > current[field] ? agent : current,
  );
}

export function aggregateAgents(rows: Agent[][]): Agent[] {
  const agentsByName = new Map<string, Agent>();

  for (const dailyAgents of rows) {
    for (const agent of dailyAgents) {
      const trimmedName = agent.name.trim();
      if (!trimmedName) continue;

      const key = trimmedName.toLocaleLowerCase();
      const current = agentsByName.get(key) ?? newAgent(trimmedName, agent.id);

      agentsByName.set(key, {
        ...current,
        name: trimmedName,
        callsMade: current.callsMade + (agent.callsMade || 0),
        callsPicked: current.callsPicked + (agent.callsPicked || 0),
        directTc: current.directTc + (agent.directTc || 0),
      });
    }
  }

  return [...agentsByName.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export const fmtPct = (value: number) =>
  `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLUMNS,
  agentTcsLinedUp,
  computeTotals,
  type Agent,
  type NumericField,
} from "@/lib/dashboard";

type AgentTableProps = {
  agents: Agent[];
  onChange: (id: string, patch: Partial<Agent>) => void;
  readOnly?: boolean;
  rankStats?: Record<string, { confirmed: number; photosReceived: number }>;
};

const safeValue = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;

const parseValue = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

export function AgentTable({
  agents,
  onChange,
  readOnly = false,
  rankStats = {},
}: AgentTableProps) {
  const totals = useMemo(() => computeTotals(agents), [agents]);
  const ranked = useMemo(
    () =>
      [...agents]
        .filter((agent) => {
          const stat = rankStats[agent.id];
          return agent.callsPicked > 0 || agentTcsLinedUp(agent) > 0 || (stat?.confirmed ?? 0) > 0 || (stat?.photosReceived ?? 0) > 0;
        })
        .sort((a, b) => {
          const aStat = rankStats[a.id] ?? { confirmed: 0, photosReceived: 0 };
          const bStat = rankStats[b.id] ?? { confirmed: 0, photosReceived: 0 };
          return bStat.confirmed - aStat.confirmed || bStat.photosReceived - aStat.photosReceived || agentTcsLinedUp(b) - agentTcsLinedUp(a) || b.callsPicked - a.callsPicked;
        }),
    [agents, rankStats],
  );
  const ranks = useMemo(() => {
    const result = new Map<string, number>();
    let previous = "";
    let rank = 0;
    ranked.forEach((agent, index) => {
      const stat = rankStats[agent.id] ?? { confirmed: 0, photosReceived: 0 };
      const score = `${stat.confirmed}|${stat.photosReceived}|${agentTcsLinedUp(agent)}|${agent.callsPicked}`;
      if (score !== previous) rank = index + 1;
      result.set(agent.id, rank);
      previous = score;
    });
    return result;
  }, [ranked, rankStats]);

  const updateMetric = (
    agentId: string,
    field: NumericField,
    value: string,
  ) => {
    if (readOnly) return;
    onChange(agentId, { [field]: parseValue(value) });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Agent Performance Entry
          </h2>
          <p className="text-xs text-muted-foreground">
            Enter calls manually. TCs Aligned is synced from TC Shift Monitor.
          </p>
        </div>

        {!readOnly ? (
          <Button asChild size="sm" variant="outline" className="rounded-xl">
            <Link to="/agents">
              <Users className="size-4" />
              Manage Agents
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-sm">
          <thead>
            <tr className="bg-secondary/60 text-left">
              <th className="w-20 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Rank
              </th>
              <th className="min-w-40 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agent Name
              </th>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className="min-w-32 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {column.label}
                </th>
              ))}
              <th className="min-w-32 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                TCs Lined Up
              </th>
            </tr>
          </thead>

          <tbody>
            {agents.map((agent) => {
              const rank = ranks.get(agent.id);
              const isTop = ranks.get(agent.id) === 1;

              return (
                <tr
                  key={agent.id}
                  className={
                    isTop
                      ? "border-t border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20"
                      : "border-t border-border hover:bg-secondary/40"
                  }
                >
                  <td className="px-3 py-2 text-center">
                    {rank ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums">
                        {rank === 1 ? (
                          <Trophy className="size-4 text-amber-500" />
                        ) : null}
                        #{rank}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  <td className="px-4 py-2 font-medium">{agent.name}</td>

                  {COLUMNS.map((column) => (
                    <td key={column.key} className="px-3 py-2">
                      <Input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min={0}
                        readOnly={readOnly || column.key === "directTc"}
                        aria-label={`${agent.name} ${column.label}`}
                        value={String(safeValue(agent[column.key]))}
                        onChange={(event) =>
                          updateMetric(agent.id, column.key, event.target.value)
                        }
                        className="num-input mx-auto h-9 w-24 rounded-lg text-center tabular-nums"
                      />
                    </td>
                  ))}

                  <td className="px-3 py-2 text-center font-semibold tabular-nums text-primary">
                    {agentTcsLinedUp(agent)}
                  </td>
                </tr>
              );
            })}

            {agents.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 3}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No agents yet. Add agents in Team Management to begin.
                </td>
              </tr>
            ) : null}
          </tbody>

          {agents.length > 0 ? (
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/70 font-semibold">
                <td className="px-3 py-3" />
                <td className="px-4 py-3">Totals</td>
                {COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="px-3 py-3 text-center tabular-nums"
                  >
                    {totals[column.key]}
                  </td>
                ))}
                <td className="px-3 py-3 text-center tabular-nums text-primary">
                  {totals.totalTcsLinedUp}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

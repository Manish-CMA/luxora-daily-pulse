import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLUMNS,
  agentTcsLinedUp,
  computeTotals,
  topPerformers,
  type Agent,
  type NumericField,
} from "@/lib/dashboard";

type AgentTableProps = {
  agents: Agent[];
  onChange: (id: string, patch: Partial<Agent>) => void;
  readOnly?: boolean;
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
}: AgentTableProps) {
  const totals = useMemo(() => computeTotals(agents), [agents]);
  const ranked = useMemo(() => topPerformers(agents, agents.length), [agents]);
  const ranks = useMemo(
    () => new Map(ranked.map((agent, index) => [agent.id, index + 1])),
    [ranked],
  );
  const topId = ranked[0]?.id;

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
            Calls, Pre-TCs and agent conversions only.
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
              const isTop = agent.id === topId;

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
                        readOnly={readOnly}
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

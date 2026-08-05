import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLUMNS,
  agentTcsLinedUp,
  agentPreTcLinedUp,
  type Agent,
} from "@/lib/dashboard";

export function AgentTable({
  agents,
  onChange,
  readOnly = false,
}: {
  agents: Agent[];
  onChange: (id: string, patch: Partial<Agent>) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            Agent Performance Entry
          </h2>
          <p className="text-xs text-muted-foreground">
            Values update automatically — submit the report when finished.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="rounded-xl">
          <Link to="/agents">
            <Users className="size-4" /> Manage Agents
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-secondary/60 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Agent Name
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
  Pre-TC Lined Up
</th>

<th className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
  Total TCs
</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr
                key={a.id}
                className="border-t border-border transition-colors hover:bg-secondary/40"
              >
                <td className="px-4 py-2 font-medium">{a.name}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="px-3 py-2">
                    <Input
                      inputMode="numeric"
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={String(a[c.key])}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, "");
                        onChange(a.id, { [c.key]: Number(digits || 0) });
                      }}
                      className="num-input h-9 w-24 rounded-lg text-center tabular-nums"
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-semibold tabular-nums text-orange-600">
  {agentPreTcLinedUp(a)}
</td>

<td className="px-3 py-2 text-center font-semibold tabular-nums text-primary">
  {agentTcsLinedUp(a)}
</td>
              </tr>
            ))}
            {agents.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 2}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No agents yet. Add agents in Agent Management to begin.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

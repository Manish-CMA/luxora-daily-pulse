import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL, useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { resetStore } from "@/lib/storage";

const NAV = [
  { to: "/", label: "Home", exact: true },
  { to: "/night-shift", label: "Night Shift", exact: false },
  { to: "/daily", label: "Daily Report", exact: false },
  { to: "/tc-scheduler", label: "TC Shift Monitor", exact: false },
  { to: "/reports", label: "Reports", exact: false },
  { to: "/history", label: "Report History", exact: false },
  { to: "/agents", label: "Team Management", exact: false },
  { to: "/settings", label: "Settings", exact: false },
] as const;

export function AppHeader({ actions }: { actions?: ReactNode }) {
  const { fullName, role } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    resetStore();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <header className="border-b border-border bg-card/80 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <LayoutDashboard className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">CureMeAbroad Operations Hub</h1>
            <p className="text-xs text-muted-foreground">
              Daily teleconsultation coordinator performance reporting
            </p>
          </div>
        </Link>

        <div className="flex flex-wrap items-center gap-4">
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.exact }}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          {actions}
          {fullName ? (
            <div className="flex items-center gap-2 border-l border-border pl-4">
              <div className="text-right leading-tight">
                <p className="text-sm font-medium">{fullName}</p>
                {role ? (
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {ROLE_LABEL[role]}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                className="size-9 rounded-lg text-muted-foreground"
                onClick={signOut}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

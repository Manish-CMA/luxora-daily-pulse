import { useEffect, useState } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { hydrateStore, isHydrated } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const [ready, setReady] = useState(isHydrated());

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    hydrateStore()
      .catch((e) => console.error("Failed to load cloud data", e))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Loading your team data…
        </div>
      </div>
    );
  }

  return <Outlet />;
}

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "manager" | "operations";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (u: User | null) => {
      if (!active) return;
      setUser(u);
      if (!u) {
        setFullName("");
        setRole(null);
        setLoading(false);
        return;
      }
      const [{ data: profile }, { data: roleRow }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id).maybeSingle(),
      ]);
      if (!active) return;
      setFullName(profile?.full_name ?? u.email ?? "");
      setRole((roleRow?.role as AppRole | undefined) ?? null);
      setLoading(false);
    };

    supabase.auth.getUser().then(({ data }) => void load(data.user ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, fullName, role, loading };
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  manager: "Manager",
  operations: "Operations",
};

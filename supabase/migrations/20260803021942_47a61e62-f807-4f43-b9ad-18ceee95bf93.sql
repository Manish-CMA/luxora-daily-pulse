-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'operations');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + role on signup; first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN is_first THEN 'admin'::public.app_role ELSE 'operations'::public.app_role END)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents shared read" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Agents shared insert" ON public.agents FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Agents shared update" ON public.agents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Agents shared delete" ON public.agents FOR DELETE TO authenticated USING (true);

-- Daily reports
CREATE TABLE public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_name TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_edited_by_name TEXT,
  last_edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reports shared read" ON public.daily_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Reports shared insert" ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by OR submitted_by IS NULL);
CREATE POLICY "Reports shared update" ON public.daily_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Reports shared delete" ON public.daily_reports FOR DELETE TO authenticated USING (true);

-- Report entries
CREATE TABLE public.daily_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  agent_id UUID,
  agent_name TEXT NOT NULL,
  calls_made INTEGER NOT NULL DEFAULT 0,
  calls_picked INTEGER NOT NULL DEFAULT 0,
  pre_tc INTEGER NOT NULL DEFAULT 0,
  pre_tc_to_tc INTEGER NOT NULL DEFAULT 0,
  direct_tc INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX daily_report_entries_report_id_idx ON public.daily_report_entries(report_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_report_entries TO authenticated;
GRANT ALL ON public.daily_report_entries TO service_role;
ALTER TABLE public.daily_report_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Entries shared read" ON public.daily_report_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Entries shared insert" ON public.daily_report_entries FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Entries shared update" ON public.daily_report_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Entries shared delete" ON public.daily_report_entries FOR DELETE TO authenticated USING (true);
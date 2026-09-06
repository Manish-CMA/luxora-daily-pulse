CREATE TABLE IF NOT EXISTS public.tc_live_state (
  shift_date DATE PRIMARY KEY,
  scheduled_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  aligned_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tc_live_state TO authenticated;
GRANT ALL ON public.tc_live_state TO service_role;

ALTER TABLE public.tc_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TC live state shared read" ON public.tc_live_state;
CREATE POLICY "TC live state shared read"
  ON public.tc_live_state FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "TC live state shared insert" ON public.tc_live_state;
CREATE POLICY "TC live state shared insert"
  ON public.tc_live_state FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "TC live state shared update" ON public.tc_live_state;
CREATE POLICY "TC live state shared update"
  ON public.tc_live_state FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

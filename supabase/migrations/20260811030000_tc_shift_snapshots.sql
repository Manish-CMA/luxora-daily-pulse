CREATE TABLE IF NOT EXISTS public.tc_shift_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date DATE NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('opening', 'closing')),
  scheduled_raw TEXT NOT NULL DEFAULT '',
  aligned_raw TEXT NOT NULL DEFAULT '',
  scheduled_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  aligned_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shift_date, phase)
);

CREATE INDEX IF NOT EXISTS tc_shift_snapshots_shift_date_idx
  ON public.tc_shift_snapshots (shift_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tc_shift_snapshots TO authenticated;
GRANT ALL ON public.tc_shift_snapshots TO service_role;

ALTER TABLE public.tc_shift_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "TC snapshots shared read" ON public.tc_shift_snapshots;
CREATE POLICY "TC snapshots shared read"
  ON public.tc_shift_snapshots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "TC snapshots shared insert" ON public.tc_shift_snapshots;
CREATE POLICY "TC snapshots shared insert"
  ON public.tc_shift_snapshots FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "TC snapshots shared update" ON public.tc_shift_snapshots;
CREATE POLICY "TC snapshots shared update"
  ON public.tc_shift_snapshots FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "TC snapshots shared delete" ON public.tc_shift_snapshots;
CREATE POLICY "TC snapshots shared delete"
  ON public.tc_shift_snapshots FOR DELETE TO authenticated
  USING (true);

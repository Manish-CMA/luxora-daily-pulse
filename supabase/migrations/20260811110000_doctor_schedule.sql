-- Read-only shared schedule for CureMeAbroad in-house doctors.
-- This table deliberately stores only the data required by the doctor page.
CREATE TABLE IF NOT EXISTS public.tc_doctor_schedule (
  shift_date DATE PRIMARY KEY,
  schedule_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tc_doctor_schedule TO anon, authenticated;
GRANT INSERT, UPDATE ON public.tc_doctor_schedule TO authenticated;
GRANT ALL ON public.tc_doctor_schedule TO service_role;

ALTER TABLE public.tc_doctor_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctor schedule public read" ON public.tc_doctor_schedule;
CREATE POLICY "Doctor schedule public read"
  ON public.tc_doctor_schedule FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Doctor schedule authenticated insert" ON public.tc_doctor_schedule;
CREATE POLICY "Doctor schedule authenticated insert"
  ON public.tc_doctor_schedule FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Doctor schedule authenticated update" ON public.tc_doctor_schedule;
CREATE POLICY "Doctor schedule authenticated update"
  ON public.tc_doctor_schedule FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

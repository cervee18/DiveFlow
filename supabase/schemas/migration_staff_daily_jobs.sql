-- ============================================================
-- Migration: staff daily job assignments
-- Tables: job_types, staff_daily_job
-- ============================================================

-- ----------------------------------------------------------
-- 1. job_types
--    Defines the named job slots for a given organisation
--    (e.g. Reception, Reservations, Operations, Sick, Off…)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_types (
  id              uuid        DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid        NOT NULL,
  name            text        NOT NULL,
  color           text,                        -- optional hex colour, e.g. '#14b8a6'
  sort_order      integer     DEFAULT 0,
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT job_types_pkey PRIMARY KEY (id),
  CONSTRAINT job_types_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_types_org
  ON public.job_types (organization_id, sort_order);

-- ----------------------------------------------------------
-- 2. staff_daily_job
--    One row per (staff member × job type × date).
--    A staff member can have multiple rows on the same day
--    (e.g. Reception + also on a trip).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_daily_job (
  id              uuid        DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid        NOT NULL,
  staff_id        uuid        NOT NULL,
  job_type_id     uuid        NOT NULL,
  job_date        date        NOT NULL,
  created_at      timestamptz DEFAULT now(),

  CONSTRAINT staff_daily_job_pkey PRIMARY KEY (id),
  CONSTRAINT staff_daily_job_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT staff_daily_job_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES public.staff(id) ON DELETE CASCADE,
  CONSTRAINT staff_daily_job_job_type_id_fkey
    FOREIGN KEY (job_type_id) REFERENCES public.job_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_staff_daily_job_date
  ON public.staff_daily_job (organization_id, job_date);

-- ----------------------------------------------------------
-- 3. Row Level Security
-- ----------------------------------------------------------
ALTER TABLE public.job_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_daily_job ENABLE ROW LEVEL SECURITY;

-- job_types: org members can read; admins/staff can write
CREATE POLICY "org members can select job_types"
  ON public.job_types FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can insert job_types"
  ON public.job_types FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can update job_types"
  ON public.job_types FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can delete job_types"
  ON public.job_types FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- staff_daily_job: same pattern
CREATE POLICY "org members can select staff_daily_job"
  ON public.staff_daily_job FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can insert staff_daily_job"
  ON public.staff_daily_job FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can update staff_daily_job"
  ON public.staff_daily_job FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "org members can delete staff_daily_job"
  ON public.staff_daily_job FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- 4. Seed: default job types
--    Replace '13826d8a-653e-459a-a779-967a45c6a9a4' with your organisation UUID
--    (find it in the profiles table or organisations table).
-- ----------------------------------------------------------

INSERT INTO public.job_types (organization_id, name, color, sort_order) VALUES
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Reception',    '#6366f1', 0),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Reservations', '#8b5cf6', 1),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Operations',   '#0d9488', 2),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Sick',         '#ef4444', 3),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Holiday',      '#f59e0b', 4),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Off',          '#94a3b8', 5),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Crew',         '#0ea5e9', 6),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Captain',      '#1e40af', 7),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Private',      '#7c3aed', 8),
  ('13826d8a-653e-459a-a779-967a45c6a9a4', 'Course',       '#059669', 9);

-- ----------------------------------------------------------
-- 5. AM/PM column (added post-creation directly in Supabase)
--    Run this if the column doesn't exist yet in your instance.
-- ----------------------------------------------------------
ALTER TABLE public.staff_daily_job
  ADD COLUMN IF NOT EXISTS "AM/PM" text CHECK ("AM/PM" IN ('AM', 'PM'));


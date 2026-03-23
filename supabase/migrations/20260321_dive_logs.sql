-- Dive logging tables: trip_dives, client_dive_logs, staff_dive_logs

-- ── trip_dives ───────────────────────────────────────────────────────────────
-- One row per dive slot within a trip (shared site for all divers).
CREATE TABLE public.trip_dives (
  id           uuid        DEFAULT gen_random_uuid() NOT NULL,
  trip_id      uuid        NOT NULL,
  divesite_id  uuid,
  dive_number  smallint    NOT NULL,
  started_at   timestamptz,
  created_at   timestamptz DEFAULT now(),

  CONSTRAINT trip_dives_pkey            PRIMARY KEY (id),
  CONSTRAINT trip_dives_trip_fk         FOREIGN KEY (trip_id)     REFERENCES public.trips(id)      ON DELETE CASCADE,
  CONSTRAINT trip_dives_divesite_fk     FOREIGN KEY (divesite_id) REFERENCES public.divesites(id),
  CONSTRAINT trip_dives_unique_slot     UNIQUE (trip_id, dive_number)
);

-- ── client_dive_logs ─────────────────────────────────────────────────────────
-- One row per client per dive slot.
CREATE TABLE public.client_dive_logs (
  id             uuid        DEFAULT gen_random_uuid() NOT NULL,
  trip_dive_id   uuid        NOT NULL,
  trip_client_id uuid        NOT NULL,
  max_depth      numeric(5,1),
  bottom_time    smallint,

  CONSTRAINT client_dive_logs_pkey          PRIMARY KEY (id),
  CONSTRAINT client_dive_logs_dive_fk       FOREIGN KEY (trip_dive_id)   REFERENCES public.trip_dives(id)   ON DELETE CASCADE,
  CONSTRAINT client_dive_logs_client_fk     FOREIGN KEY (trip_client_id) REFERENCES public.trip_clients(id) ON DELETE CASCADE,
  CONSTRAINT client_dive_logs_unique        UNIQUE (trip_dive_id, trip_client_id)
);

-- ── staff_dive_logs ──────────────────────────────────────────────────────────
-- Presence record only — which staff were on each dive slot (no metrics).
CREATE TABLE public.staff_dive_logs (
  id            uuid        DEFAULT gen_random_uuid() NOT NULL,
  trip_dive_id  uuid        NOT NULL,
  trip_staff_id uuid        NOT NULL,

  CONSTRAINT staff_dive_logs_pkey       PRIMARY KEY (id),
  CONSTRAINT staff_dive_logs_dive_fk    FOREIGN KEY (trip_dive_id)  REFERENCES public.trip_dives(id)  ON DELETE CASCADE,
  CONSTRAINT staff_dive_logs_staff_fk   FOREIGN KEY (trip_staff_id) REFERENCES public.trip_staff(id)  ON DELETE CASCADE,
  CONSTRAINT staff_dive_logs_unique     UNIQUE (trip_dive_id, trip_staff_id)
);

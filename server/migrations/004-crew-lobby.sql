ALTER TABLE voyages
  ADD COLUMN crew_launched boolean NOT NULL DEFAULT true,
  ADD COLUMN joined_mask integer NOT NULL DEFAULT 1,
  ADD COLUMN crew_revision integer NOT NULL DEFAULT 0,
  ADD COLUMN assisted_tides jsonb NOT NULL DEFAULT '{}';

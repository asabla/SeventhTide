ALTER TABLE voyages
  ADD COLUMN crew_signals jsonb NOT NULL DEFAULT '{}';

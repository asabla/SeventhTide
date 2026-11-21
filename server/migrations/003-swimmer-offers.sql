ALTER TABLE voyages
  ADD COLUMN volunteer_mask integer NOT NULL DEFAULT 0 CHECK (volunteer_mask BETWEEN 0 AND 7),
  ADD COLUMN offer_revision integer NOT NULL DEFAULT 0;

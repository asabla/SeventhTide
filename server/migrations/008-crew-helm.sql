ALTER TABLE voyages
  ADD COLUMN helm_seat smallint NOT NULL DEFAULT 0 CHECK (helm_seat BETWEEN 0 AND cardinality(guest_digests)),
  ADD COLUMN helm_seen_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE voyages ADD COLUMN guest_digests bytea[] NOT NULL DEFAULT '{}';

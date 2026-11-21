CREATE TABLE voyages (
  id uuid PRIMARY KEY,
  owner_digest bytea NOT NULL,
  rules_version integer NOT NULL,
  seed bigint NOT NULL CHECK (seed BETWEEN 0 AND 4294967295),
  moves text[] NOT NULL DEFAULT '{}',
  revision integer GENERATED ALWAYS AS (cardinality(moves)) STORED
);

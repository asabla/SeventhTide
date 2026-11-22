ALTER TABLE voyages
  ADD COLUMN route_recommendations jsonb NOT NULL DEFAULT '{}';

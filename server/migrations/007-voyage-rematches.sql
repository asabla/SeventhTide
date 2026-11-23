ALTER TABLE voyages
  ADD COLUMN previous_voyage uuid UNIQUE REFERENCES voyages (id) ON DELETE SET NULL;

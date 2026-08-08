-- v2 §11: per-contact behavior variance lives on the Social Graph edge,
-- not the global Personality Profile.

ALTER TABLE social_graph_edges
  ADD COLUMN IF NOT EXISTS effective_verbosity REAL,
  ADD COLUMN IF NOT EXISTS effective_energy REAL;

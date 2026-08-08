-- 0002_v2_simulation: human simulation layer entities (v2 Data Model Additions)

CREATE TABLE IF NOT EXISTS world_state (
  id                      TEXT PRIMARY KEY,
  agent_id                TEXT NOT NULL,
  activity                TEXT NOT NULL DEFAULT 'idle',
  location_context        TEXT NOT NULL DEFAULT 'home',
  availability            REAL NOT NULL DEFAULT 1.0,
  energy_level            REAL NOT NULL DEFAULT 1.0,
  stress_level            REAL NOT NULL DEFAULT 0,
  focus_level             REAL NOT NULL DEFAULT 1.0,
  device_battery          INTEGER NOT NULL DEFAULT 100,
  sleep_state             TEXT NOT NULL DEFAULT 'awake',
  current_activity_detail TEXT NOT NULL DEFAULT '',
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id)
);

CREATE TABLE IF NOT EXISTS thoughts (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category                 TEXT NOT NULL CHECK (category IN ('thought','interpretation','prediction')),
  content                  TEXT NOT NULL,
  confidence               REAL NOT NULL DEFAULT 0.5,
  related_memory_ids       JSONB NOT NULL DEFAULT '[]',
  related_message_id       TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at              TIMESTAMPTZ,
  verification_result      TEXT CHECK (verification_result IN ('confirmed','contradicted','expired')),
  source                   TEXT NOT NULL DEFAULT 'agent_generated' CHECK (source IN ('user_stated','inferred','agent_generated','false_memory_simulated')),
  verification_status      TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','confirmed','contradicted')),
  last_confidence_decay_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_thoughts_user ON thoughts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_graph_nodes (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_graph_edges (
  from_user_id          TEXT NOT NULL REFERENCES social_graph_nodes(user_id) ON DELETE CASCADE,
  to_user_id            TEXT NOT NULL REFERENCES social_graph_nodes(user_id) ON DELETE CASCADE,
  edge_type             TEXT NOT NULL DEFAULT 'unknown' CHECK (edge_type IN ('friend','family','coworker','unknown')),
  strength              REAL NOT NULL DEFAULT 0.1,
  shared_jokes          JSONB NOT NULL DEFAULT '[]',
  shared_interests      JSONB NOT NULL DEFAULT '[]',
  shared_events         JSONB NOT NULL DEFAULT '[]',
  interaction_frequency REAL NOT NULL DEFAULT 0,
  last_confirmed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS social_clusters (
  id             TEXT PRIMARY KEY,
  member_user_ids JSONB NOT NULL DEFAULT '[]',
  cluster_label  TEXT NOT NULL DEFAULT '',
  cohesion_score REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stickers (
  id                       TEXT PRIMARY KEY,
  pack_id                  TEXT NOT NULL DEFAULT '',
  file_url                 TEXT NOT NULL,
  emotion_tags             JSONB NOT NULL DEFAULT '[]',
  intent_tags              JSONB NOT NULL DEFAULT '[]',
  humor_level              REAL NOT NULL DEFAULT 0.5,
  context_tags             JSONB NOT NULL DEFAULT '[]',
  usage_frequency          INTEGER NOT NULL DEFAULT 0,
  reply_probability_weight REAL NOT NULL DEFAULT 1.0,
  preferred_contact_ids    JSONB NOT NULL DEFAULT '[]',
  last_used_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS psychology_state (
  user_id             TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  curiosity           REAL NOT NULL DEFAULT 0.5,
  trust               REAL NOT NULL DEFAULT 0.3,
  patience            REAL NOT NULL DEFAULT 0.5,
  interest            REAL NOT NULL DEFAULT 0.5,
  social_energy       REAL NOT NULL DEFAULT 0.5,
  empathy             REAL NOT NULL DEFAULT 0.6,
  confidence          REAL NOT NULL DEFAULT 0.5,
  stress              REAL NOT NULL DEFAULT 0.2,
  comfort             REAL NOT NULL DEFAULT 0.5,
  conversation_fatigue REAL NOT NULL DEFAULT 0,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluation_reports (
  id                 TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  metrics            JSONB NOT NULL DEFAULT '{}',
  human_likeness_score REAL NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eval_reports_conversation ON evaluation_reports(conversation_id);

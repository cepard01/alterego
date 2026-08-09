// SQLite schema — mirrors infra/db/migrations/*.sql for the file-backed
// local mode. Types are mapped from the Postgres DDL: TIMESTAMPTZ -> TEXT
// (repos always write ISO strings), JSONB -> TEXT (repos parse via
// parseJson), BOOLEAN -> INTEGER (repos map with Boolean(...)), BIGINT ->
// INTEGER. pgvector columns are kept as plain TEXT so INSERTs that list
// them don't break; similarity ordering degrades to recency (see
// translate() in db-sqlite.ts).

import type { DatabaseSync } from 'node:sqlite';

const DDL = `
-- 0001 v1 core ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  phone_number    TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL DEFAULT '',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  locale          TEXT NOT NULL DEFAULT 'en',
  created_at      TEXT NOT NULL DEFAULT (now()),
  last_seen_at    TEXT NOT NULL DEFAULT (now()),
  opt_in_status   TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'idle',
  started_at      TEXT NOT NULL DEFAULT (now()),
  last_message_at TEXT NOT NULL DEFAULT (now()),
  current_topic   TEXT,
  turn_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

CREATE TABLE IF NOT EXISTS messages (
  id                 TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL,
  sender             TEXT NOT NULL,
  content            TEXT NOT NULL DEFAULT '',
  media_id           TEXT,
  timestamp          TEXT NOT NULL DEFAULT (now()),
  is_read            INTEGER NOT NULL DEFAULT 0,
  reply_to_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp);

CREATE TABLE IF NOT EXISTS media (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL,
  type            TEXT NOT NULL,
  storage_url     TEXT NOT NULL DEFAULT '',
  mime_type       TEXT NOT NULL DEFAULT '',
  caption         TEXT,
  transcript      TEXT,
  analysis_summary TEXT,
  duration_ms     INTEGER,
  size_bytes      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memory (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL,
  type                    TEXT NOT NULL,
  content                 TEXT NOT NULL,
  embedding_vector        TEXT,
  importance              REAL NOT NULL DEFAULT 0.5,
  confidence              REAL NOT NULL DEFAULT 0.8,
  source                  TEXT NOT NULL DEFAULT 'user_stated',
  verification_status     TEXT NOT NULL DEFAULT 'unverified',
  created_at              TEXT NOT NULL DEFAULT (now()),
  last_accessed_at        TEXT NOT NULL DEFAULT (now()),
  expires_at              TEXT,
  source_message_id       TEXT,
  last_confidence_decay_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_memory_user ON memory(user_id, type);

CREATE TABLE IF NOT EXISTS relationships (
  user_id            TEXT PRIMARY KEY,
  familiarity_level  REAL NOT NULL DEFAULT 0,
  trust_score        REAL NOT NULL DEFAULT 0.5,
  tone_preference    TEXT NOT NULL DEFAULT 'casual',
  shared_context     TEXT NOT NULL DEFAULT '[]',
  interaction_count  INTEGER NOT NULL DEFAULT 0,
  updated_at         TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS personalities (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  tone               TEXT NOT NULL DEFAULT 'casual',
  humor_style        TEXT NOT NULL DEFAULT 'dry',
  verbosity          REAL NOT NULL DEFAULT 0.5,
  emoji_frequency    REAL NOT NULL DEFAULT 0.3,
  vocabulary_profile TEXT NOT NULL DEFAULT '{}',
  quirks             TEXT NOT NULL DEFAULT '[]',
  version            INTEGER NOT NULL DEFAULT 1,
  updated_at         TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL,
  opened_at        TEXT NOT NULL DEFAULT (now()),
  closed_at        TEXT,
  close_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);

CREATE TABLE IF NOT EXISTS knowledge (
  id               TEXT PRIMARY KEY,
  topic            TEXT NOT NULL,
  content          TEXT NOT NULL,
  embedding_vector TEXT,
  source           TEXT NOT NULL DEFAULT '',
  confidence       REAL NOT NULL DEFAULT 0.8
);

CREATE TABLE IF NOT EXISTS behavior_profiles (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  reply_latency_curve   TEXT NOT NULL DEFAULT '{}',
  ignore_probability    REAL NOT NULL DEFAULT 0.05,
  multi_message_probability REAL NOT NULL DEFAULT 0.3,
  topic_change_tolerance REAL NOT NULL DEFAULT 0.5,
  question_asking_rate  REAL NOT NULL DEFAULT 0.4,
  activity_curve        TEXT NOT NULL DEFAULT '{}',
  updated_at            TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  trigger_at  TEXT NOT NULL,
  payload     TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, trigger_at);

CREATE TABLE IF NOT EXISTS task_queue (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  payload      TEXT NOT NULL DEFAULT '{}',
  run_at       TEXT NOT NULL DEFAULT (now()),
  status       TEXT NOT NULL DEFAULT 'pending',
  retry_count  INTEGER NOT NULL DEFAULT 0,
  max_retries  INTEGER NOT NULL DEFAULT 3,
  error        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_task_queue_due ON task_queue(status, run_at);

CREATE TABLE IF NOT EXISTS interaction_history (
  user_id           TEXT NOT NULL,
  date              TEXT NOT NULL,
  message_count     INTEGER NOT NULL DEFAULT 0,
  avg_response_time REAL NOT NULL DEFAULT 0,
  sentiment_trend   REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- 0002 v2 simulation -------------------------------------------------------
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
  updated_at              TEXT NOT NULL DEFAULT (now()),
  UNIQUE (agent_id)
);

CREATE TABLE IF NOT EXISTS thoughts (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL,
  category                 TEXT NOT NULL,
  content                  TEXT NOT NULL,
  confidence               REAL NOT NULL DEFAULT 0.5,
  related_memory_ids       TEXT NOT NULL DEFAULT '[]',
  related_message_id       TEXT,
  created_at               TEXT NOT NULL DEFAULT (now()),
  verified_at              TEXT,
  verification_result      TEXT,
  source                   TEXT NOT NULL DEFAULT 'agent_generated',
  verification_status      TEXT NOT NULL DEFAULT 'unverified',
  last_confidence_decay_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_thoughts_user ON thoughts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_graph_nodes (
  user_id       TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS social_graph_edges (
  from_user_id          TEXT NOT NULL,
  to_user_id            TEXT NOT NULL,
  edge_type             TEXT NOT NULL DEFAULT 'unknown',
  strength              REAL NOT NULL DEFAULT 0.1,
  shared_jokes          TEXT NOT NULL DEFAULT '[]',
  shared_interests      TEXT NOT NULL DEFAULT '[]',
  shared_events         TEXT NOT NULL DEFAULT '[]',
  interaction_frequency REAL NOT NULL DEFAULT 0,
  last_confirmed_at     TEXT NOT NULL DEFAULT (now()),
  effective_verbosity   REAL,
  effective_energy      REAL,
  PRIMARY KEY (from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS social_clusters (
  id             TEXT PRIMARY KEY,
  member_user_ids TEXT NOT NULL DEFAULT '[]',
  cluster_label  TEXT NOT NULL DEFAULT '',
  cohesion_score REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stickers (
  id                       TEXT PRIMARY KEY,
  pack_id                  TEXT NOT NULL DEFAULT '',
  file_url                 TEXT NOT NULL,
  emotion_tags             TEXT NOT NULL DEFAULT '[]',
  intent_tags              TEXT NOT NULL DEFAULT '[]',
  humor_level              REAL NOT NULL DEFAULT 0.5,
  context_tags             TEXT NOT NULL DEFAULT '[]',
  usage_frequency          INTEGER NOT NULL DEFAULT 0,
  reply_probability_weight REAL NOT NULL DEFAULT 1.0,
  preferred_contact_ids    TEXT NOT NULL DEFAULT '[]',
  last_used_at             TEXT
);

CREATE TABLE IF NOT EXISTS psychology_state (
  user_id             TEXT PRIMARY KEY,
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
  updated_at          TEXT NOT NULL DEFAULT (now())
);

CREATE TABLE IF NOT EXISTS evaluation_reports (
  id                 TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL,
  metrics            TEXT NOT NULL DEFAULT '{}',
  human_likeness_score REAL NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_eval_reports_conversation ON evaluation_reports(conversation_id);

-- 0003 v3 identity ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity_profiles (
  id                 TEXT PRIMARY KEY,
  agent_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  age                INTEGER NOT NULL DEFAULT 27,
  background_summary TEXT NOT NULL DEFAULT '',
  education          TEXT NOT NULL DEFAULT '[]',
  occupation         TEXT NOT NULL DEFAULT '',
  hometown           TEXT NOT NULL DEFAULT '',
  interests          TEXT NOT NULL DEFAULT '[]',
  values             TEXT NOT NULL DEFAULT '[]',
  beliefs            TEXT NOT NULL DEFAULT '[]',
  skills             TEXT NOT NULL DEFAULT '[]',
  family_summary     TEXT NOT NULL DEFAULT '',
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (now()),
  last_evolved_at    TEXT NOT NULL DEFAULT (now()),
  UNIQUE (agent_id)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id                   TEXT PRIMARY KEY,
  agent_id             TEXT NOT NULL,
  event_type           TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  occurred_at          TEXT NOT NULL,
  occurred_range_end   TEXT,
  related_identity_fields TEXT NOT NULL DEFAULT '[]',
  related_memory_ids   TEXT NOT NULL DEFAULT '[]',
  importance_score     REAL NOT NULL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_timeline_agent ON timeline_events(agent_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS inventory_items (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other',
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  acquired_at  TEXT,
  sentiment    TEXT NOT NULL DEFAULT 'neutral',
  linked_goal_id TEXT,
  still_owned  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'plan',
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active',
  progress      REAL NOT NULL DEFAULT 0,
  target_date   TEXT,
  created_at    TEXT NOT NULL DEFAULT (now()),
  resolved_at   TEXT,
  resolution_link TEXT
);
CREATE INDEX IF NOT EXISTS idx_goals_agent ON goals(agent_id, status);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'one_off',
  title            TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'free_time',
  recurrence_rule  TEXT,
  start_at         TEXT NOT NULL,
  end_at           TEXT NOT NULL,
  world_state_override TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_calendar_agent ON calendar_entries(agent_id, start_at);

CREATE TABLE IF NOT EXISTS memory_contradictions (
  id           TEXT PRIMARY KEY,
  memory_id_a  TEXT NOT NULL,
  memory_id_b  TEXT,
  message_id   TEXT,
  detected_at  TEXT NOT NULL DEFAULT (now()),
  resolution   TEXT NOT NULL DEFAULT 'unresolved'
);

CREATE TABLE IF NOT EXISTS recovery_plans (
  id                        TEXT PRIMARY KEY,
  conversation_id           TEXT NOT NULL,
  gap_duration_ms           INTEGER NOT NULL,
  freshness_score           REAL NOT NULL DEFAULT 0,
  strategy                  TEXT NOT NULL,
  reconstructed_context_type TEXT NOT NULL DEFAULT 'raw',
  scheduled_response_at     TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS identity_evolution_proposals (
  id                TEXT PRIMARY KEY,
  agent_id          TEXT NOT NULL,
  field_changed     TEXT NOT NULL,
  old_value         TEXT NOT NULL DEFAULT '',
  new_value         TEXT NOT NULL DEFAULT '',
  supporting_evidence TEXT NOT NULL DEFAULT '[]',
  confidence        REAL NOT NULL DEFAULT 0.5,
  status            TEXT NOT NULL DEFAULT 'proposed',
  created_at        TEXT NOT NULL DEFAULT (now()),
  resolved_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_evolution_proposals ON identity_evolution_proposals(agent_id, status);

-- local panel settings ------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (now())
);
`;

export function createSchema(db: DatabaseSync): void {
  db.exec(DDL);
}

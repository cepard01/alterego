-- 0001_v1_core: v1 platform entities (architecture v1 §4)
-- All ids are text UUIDs (gen_random_uuid requires PG 13+).

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  phone_number    TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL DEFAULT '',
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  locale          TEXT NOT NULL DEFAULT 'en',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  opt_in_status   TEXT NOT NULL DEFAULT 'none' CHECK (opt_in_status IN ('none','pending','opted_in','opted_out'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('active','idle','ended')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_topic   TEXT,
  turn_count      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

CREATE TABLE IF NOT EXISTS messages (
  id                 TEXT PRIMARY KEY,
  conversation_id    TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender             TEXT NOT NULL CHECK (sender IN ('user','agent')),
  content            TEXT NOT NULL DEFAULT '',
  media_id           TEXT,
  timestamp          TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read            BOOLEAN NOT NULL DEFAULT false,
  reply_to_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, timestamp);

CREATE TABLE IF NOT EXISTS media (
  id              TEXT PRIMARY KEY,
  message_id      TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('image','audio','video','document','sticker')),
  storage_url     TEXT NOT NULL DEFAULT '',
  mime_type       TEXT NOT NULL DEFAULT '',
  caption         TEXT,
  transcript      TEXT,
  analysis_summary TEXT,
  duration_ms     INTEGER,
  size_bytes      BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memory (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                    TEXT NOT NULL CHECK (type IN ('fact','preference','event','summary')),
  content                 TEXT NOT NULL,
  embedding_vector        VECTOR(1536),
  importance              REAL NOT NULL DEFAULT 0.5,
  confidence              REAL NOT NULL DEFAULT 0.8,
  source                  TEXT NOT NULL DEFAULT 'user_stated' CHECK (source IN ('user_stated','inferred','agent_generated','false_memory_simulated')),
  verification_status     TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','confirmed','contradicted')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at              TIMESTAMPTZ,
  source_message_id       TEXT,
  last_confidence_decay_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_user ON memory(user_id, type);
CREATE INDEX IF NOT EXISTS idx_memory_vector ON memory USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS relationships (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  familiarity_level  REAL NOT NULL DEFAULT 0,
  trust_score        REAL NOT NULL DEFAULT 0.5,
  tone_preference    TEXT NOT NULL DEFAULT 'casual',
  shared_context     JSONB NOT NULL DEFAULT '[]',
  interaction_count  INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS personalities (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  tone               TEXT NOT NULL DEFAULT 'casual',
  humor_style        TEXT NOT NULL DEFAULT 'dry',
  verbosity          REAL NOT NULL DEFAULT 0.5,
  emoji_frequency    REAL NOT NULL DEFAULT 0.3,
  vocabulary_profile JSONB NOT NULL DEFAULT '{}',
  quirks             JSONB NOT NULL DEFAULT '[]',
  version            INTEGER NOT NULL DEFAULT 1,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  close_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);

CREATE TABLE IF NOT EXISTS knowledge (
  id               TEXT PRIMARY KEY,
  topic            TEXT NOT NULL,
  content          TEXT NOT NULL,
  embedding_vector VECTOR(1536),
  source           TEXT NOT NULL DEFAULT '',
  confidence       REAL NOT NULL DEFAULT 0.8
);

CREATE TABLE IF NOT EXISTS behavior_profiles (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  reply_latency_curve   JSONB NOT NULL DEFAULT '{}',
  ignore_probability    REAL NOT NULL DEFAULT 0.05,
  multi_message_probability REAL NOT NULL DEFAULT 0.3,
  topic_change_tolerance REAL NOT NULL DEFAULT 0.5,
  question_asking_rate  REAL NOT NULL DEFAULT 0.4,
  activity_curve        JSONB NOT NULL DEFAULT '{}',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reminders (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_at  TIMESTAMPTZ NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fired','cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, trigger_at);

CREATE TABLE IF NOT EXISTS task_queue (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}',
  run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  retry_count  INTEGER NOT NULL DEFAULT 0,
  max_retries  INTEGER NOT NULL DEFAULT 3,
  error        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_queue_due ON task_queue(status, run_at);

CREATE TABLE IF NOT EXISTS interaction_history (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  message_count     INTEGER NOT NULL DEFAULT 0,
  avg_response_time REAL NOT NULL DEFAULT 0,
  sentiment_trend   REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- 0003_v3_identity: identity, continuity & offline recovery entities
-- (v3 Data Model Additions Summary)

CREATE TABLE IF NOT EXISTS identity_profiles (
  id                 TEXT PRIMARY KEY,
  agent_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  age                INTEGER NOT NULL DEFAULT 27,
  background_summary TEXT NOT NULL DEFAULT '',
  education          JSONB NOT NULL DEFAULT '[]',
  occupation         TEXT NOT NULL DEFAULT '',
  hometown           TEXT NOT NULL DEFAULT '',
  interests          JSONB NOT NULL DEFAULT '[]',
  values             JSONB NOT NULL DEFAULT '[]',
  beliefs            JSONB NOT NULL DEFAULT '[]',
  skills             JSONB NOT NULL DEFAULT '[]',
  family_summary     TEXT NOT NULL DEFAULT '',
  version            INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_evolved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id                   TEXT PRIMARY KEY,
  agent_id             TEXT NOT NULL,
  event_type           TEXT NOT NULL CHECK (event_type IN ('milestone','achievement','trip','change','purchase')),
  title                TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  occurred_at          TIMESTAMPTZ NOT NULL,
  occurred_range_end   TIMESTAMPTZ,
  related_identity_fields JSONB NOT NULL DEFAULT '[]',
  related_memory_ids   JSONB NOT NULL DEFAULT '[]',
  importance_score     REAL NOT NULL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_timeline_agent ON timeline_events(agent_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS inventory_items (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('device','instrument','vehicle','book','clothing','other')),
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  acquired_at  TIMESTAMPTZ,
  sentiment    TEXT NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('neutral','favorite','frustrating')),
  linked_goal_id TEXT,
  still_owned  BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY,
  agent_id      TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'plan' CHECK (category IN ('dream','project','purchase','skill','plan')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','achieved','abandoned')),
  progress      REAL NOT NULL DEFAULT 0,
  target_date   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  resolution_link JSONB
);
CREATE INDEX IF NOT EXISTS idx_goals_agent ON goals(agent_id, status);

CREATE TABLE IF NOT EXISTS calendar_entries (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'one_off' CHECK (type IN ('recurring','one_off')),
  title            TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'free_time' CHECK (category IN ('work','school','social','appointment','trip','free_time')),
  recurrence_rule  TEXT,
  start_at         TIMESTAMPTZ NOT NULL,
  end_at           TIMESTAMPTZ NOT NULL,
  world_state_override JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_calendar_agent ON calendar_entries(agent_id, start_at);

CREATE TABLE IF NOT EXISTS memory_contradictions (
  id           TEXT PRIMARY KEY,
  memory_id_a  TEXT NOT NULL,
  memory_id_b  TEXT,
  message_id   TEXT,
  detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolution   TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution IN ('unresolved','reinterpreted','corrected','ignored'))
);

CREATE TABLE IF NOT EXISTS recovery_plans (
  id                        TEXT PRIMARY KEY,
  conversation_id           TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  gap_duration_ms           BIGINT NOT NULL,
  freshness_score           REAL NOT NULL DEFAULT 0,
  strategy                  TEXT NOT NULL CHECK (strategy IN ('respond_normally','respond_with_summary_awareness','respond_with_soft_acknowledgment','skip_silently','reopen_selectively')),
  reconstructed_context_type TEXT NOT NULL DEFAULT 'raw' CHECK (reconstructed_context_type IN ('raw','summary','summary_plus_questions')),
  scheduled_response_at     TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executed','skipped'))
);

CREATE TABLE IF NOT EXISTS identity_evolution_proposals (
  id                TEXT PRIMARY KEY,
  agent_id          TEXT NOT NULL,
  field_changed     TEXT NOT NULL,
  old_value         TEXT NOT NULL DEFAULT '',
  new_value         TEXT NOT NULL DEFAULT '',
  supporting_evidence JSONB NOT NULL DEFAULT '[]',
  confidence        REAL NOT NULL DEFAULT 0.5,
  status            TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','auto_committed','manually_approved','rejected')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_evolution_proposals ON identity_evolution_proposals(agent_id, status);

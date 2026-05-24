-- @local/feedback-triage — consolidated init migration (intake #975).
--
-- Single SQL file that creates every table the package needs, at its
-- current shape. Apply this against a fresh Postgres + you have the
-- whole feedback-triage schema. No incremental history — for a
-- migration-by-migration history matching specforge's evolution, see
-- the specforge `drizzle/migrations/` directory and follow the order.
--
-- Conventions:
--   - No FOREIGN KEY constraints to a consumer `users` table. The
--     package schemas reference user-ids as plain uuid columns —
--     consumers add FK constraints in their own migrations if they
--     have a `users` table.
--   - Self-FKs WITHIN the package (intake_item_comments → intake_items,
--     intake_item_links → intake_items, intake_item_attachments →
--     intake_items, agent_session_activities → agent_sessions,
--     agent_session_dependencies → agent_sessions) are included.
--   - audit_log is partitioned by RANGE (at). A single open-ended
--     `audit_log_default` partition catches all rows on day-1; add
--     monthly partitions later (see specforge `src/lib/audit-log-
--     partition-rollover.ts` for the cron pattern).
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS.

-- ─────────────────────────────────────────────────────────────
-- Required extensions (gen_random_uuid)
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- intake_items + comments + links + attachments
-- ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS intake_items_seq_seq;

CREATE TABLE IF NOT EXISTS intake_items (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq                             integer NOT NULL DEFAULT nextval('intake_items_seq_seq'),
  kind                            text NOT NULL,
  source_bug_report_id            uuid,
  title                           text,
  description                     text NOT NULL,
  page_url                        text,
  context                         jsonb,
  reporter_user_id                uuid,
  state                           text NOT NULL DEFAULT 'pending',
  summary                         text,
  triage_reasoning                text,
  priority                        integer,
  triaged_by_user_id              uuid,
  triaged_at                      timestamptz,
  decision_options                jsonb,
  decision_choice                 text,
  decision_chosen_at              timestamptz,
  decision_chosen_by_user_id      uuid,
  ship_approved_at                timestamptz,
  ship_approved_by_user_id        uuid,
  duplicate_of_intake_item_id     uuid,
  block_status                    text,
  blocked_by_intake_item_id       uuid,
  parent_intake_item_id           uuid,
  category                        text,
  parked_at                       timestamptz,
  points_awarded_at               timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_items_kind_idx                     ON intake_items (kind);
CREATE INDEX IF NOT EXISTS intake_items_state_idx                    ON intake_items (state);
CREATE INDEX IF NOT EXISTS intake_items_reporter_idx                 ON intake_items (reporter_user_id);
CREATE INDEX IF NOT EXISTS intake_items_priority_idx                 ON intake_items (priority);
CREATE INDEX IF NOT EXISTS intake_items_created_at_idx               ON intake_items (created_at);
CREATE INDEX IF NOT EXISTS intake_items_duplicate_of_idx             ON intake_items (duplicate_of_intake_item_id);
CREATE INDEX IF NOT EXISTS intake_items_block_status_idx             ON intake_items (block_status);
CREATE INDEX IF NOT EXISTS intake_items_blocked_by_idx               ON intake_items (blocked_by_intake_item_id);
CREATE INDEX IF NOT EXISTS intake_items_parent_intake_item_id_idx    ON intake_items (parent_intake_item_id);
CREATE INDEX IF NOT EXISTS intake_items_category_idx                 ON intake_items (category);
CREATE INDEX IF NOT EXISTS intake_items_parked_at_idx                ON intake_items (parked_at);
CREATE UNIQUE INDEX IF NOT EXISTS intake_items_seq_unique            ON intake_items (seq);

CREATE TABLE IF NOT EXISTS intake_item_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_item_id      uuid NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  author_user_id      uuid,
  body                text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  edited_at           timestamptz,
  metadata            jsonb
);

CREATE INDEX IF NOT EXISTS intake_item_comments_thread_idx
  ON intake_item_comments (intake_item_id, created_at);
CREATE INDEX IF NOT EXISTS intake_item_comments_author_idx
  ON intake_item_comments (author_user_id, created_at);

CREATE TABLE IF NOT EXISTS intake_item_links (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_intake_item_id uuid NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  to_intake_item_id   uuid NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  created_by_user_id  uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_item_links_from_idx ON intake_item_links (from_intake_item_id);
CREATE INDEX IF NOT EXISTS intake_item_links_to_idx   ON intake_item_links (to_intake_item_id);

CREATE TABLE IF NOT EXISTS intake_item_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_item_id      uuid NOT NULL REFERENCES intake_items(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid,
  filename            text NOT NULL,
  mime_type           text NOT NULL,
  size_bytes          integer NOT NULL,
  data_url            text NOT NULL,  -- post-#845 stores R2 key, not data URL
  caption             text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intake_item_attachments_item_idx
  ON intake_item_attachments (intake_item_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- bug_reports + system_errors
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bug_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id    uuid,
  description         text NOT NULL,
  page_url            text NOT NULL,
  viewport_w          integer,
  viewport_h          integer,
  user_agent          text,
  screenshot_data_url text,
  context             jsonb,
  status              text NOT NULL DEFAULT 'open',
  resolution_note     text,
  resolved_by_user_id uuid,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bug_reports_reporter_idx   ON bug_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS bug_reports_status_idx     ON bug_reports (status);
CREATE INDEX IF NOT EXISTS bug_reports_created_at_idx ON bug_reports (created_at);

CREATE TABLE IF NOT EXISTS system_errors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              text NOT NULL,
  error_name          text,
  error_message       text NOT NULL,
  stack               text,
  fingerprint         text NOT NULL,
  page_url            text,
  method              text,
  endpoint            text,
  status_code         integer,
  user_id             uuid,
  context             jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  resolved_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS system_errors_source_idx      ON system_errors (source);
CREATE INDEX IF NOT EXISTS system_errors_fingerprint_idx ON system_errors (fingerprint);
CREATE INDEX IF NOT EXISTS system_errors_occurred_at_idx ON system_errors (occurred_at);
CREATE INDEX IF NOT EXISTS system_errors_user_idx        ON system_errors (user_id);

-- ─────────────────────────────────────────────────────────────
-- audit_log (RANGE-partitioned on `at`, monthly)
--
-- The PK is composite (id, at) because Postgres requires the
-- partition-key column to be part of the PK. `id` is uuid-unique
-- so the composite is a Postgres constraint, not a semantic change.
--
-- We ship ONE open-ended default partition so day-1 inserts work.
-- Consumers add monthly partitions later via the rollover cron
-- pattern (see specforge src/lib/audit-log-partition-rollover.ts).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id                       uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_user_id            uuid,
  impersonated_by_user_id  uuid,
  action                   text NOT NULL,
  target_table             text NOT NULL,
  target_id                uuid,
  before                   jsonb,
  after                    jsonb,
  metadata                 jsonb,
  at                       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);

CREATE TABLE IF NOT EXISTS audit_log_default
  PARTITION OF audit_log DEFAULT;

CREATE INDEX IF NOT EXISTS audit_log_actor_idx
  ON audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_target_idx
  ON audit_log (target_table, target_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx
  ON audit_log (action);
CREATE INDEX IF NOT EXISTS audit_log_at_idx
  ON audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_impersonated_by_idx
  ON audit_log (impersonated_by_user_id)
  WHERE impersonated_by_user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- agent_sessions + activities + dependencies
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_name           text NOT NULL,
  display_name          text NOT NULL,
  purpose               text NOT NULL,
  state                 text NOT NULL DEFAULT 'active',
  context_estimate_pct  integer,
  started_at            timestamptz NOT NULL DEFAULT now(),
  last_active_at        timestamptz NOT NULL DEFAULT now(),
  archived_at           timestamptz,
  pinned                boolean NOT NULL DEFAULT false,
  metadata              jsonb
);

CREATE INDEX IF NOT EXISTS agent_sessions_state_idx
  ON agent_sessions (state);
CREATE INDEX IF NOT EXISTS agent_sessions_purpose_idx
  ON agent_sessions (purpose);
CREATE INDEX IF NOT EXISTS agent_sessions_branch_active_idx
  ON agent_sessions (branch_name, last_active_at);

CREATE TABLE IF NOT EXISTS agent_session_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  ref_table    text,
  ref_id       uuid,
  title        text NOT NULL,
  body         text,
  priority     integer,
  state        text NOT NULL DEFAULT 'open',
  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata     jsonb
);

CREATE INDEX IF NOT EXISTS agent_session_activities_session_idx
  ON agent_session_activities (session_id, created_at);
CREATE INDEX IF NOT EXISTS agent_session_activities_open_idx
  ON agent_session_activities (session_id, priority, created_at);
CREATE INDEX IF NOT EXISTS agent_session_activities_ref_idx
  ON agent_session_activities (ref_table, ref_id);

CREATE TABLE IF NOT EXISTS agent_session_dependencies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session_id uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  to_session_id   uuid NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  description     text NOT NULL,
  state           text NOT NULL DEFAULT 'waiting',
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  metadata        jsonb
);

CREATE INDEX IF NOT EXISTS agent_session_dependencies_from_idx
  ON agent_session_dependencies (from_session_id);
CREATE INDEX IF NOT EXISTS agent_session_dependencies_to_idx
  ON agent_session_dependencies (to_session_id);
CREATE INDEX IF NOT EXISTS agent_session_dependencies_waiting_idx
  ON agent_session_dependencies (from_session_id, to_session_id);

-- ─────────────────────────────────────────────────────────────
-- Auto-unblock trigger (specforge intake #175 / migration 0046)
--
-- When an intake_items row transitions to a terminal state
-- (shipped / declined / duplicate / provisioned), automatically
-- clear block_status + blocked_by_intake_item_id on any rows
-- pointing at it as their blocker. The PATCH handler also does
-- this in application code AND writes an `intake.block_auto_cleared`
-- audit row; the trigger is a safety net for writes that bypass
-- the API (one-off SQL scripts).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION intake_items_auto_unblock_fn()
RETURNS trigger AS $$
BEGIN
  IF NEW.state IS DISTINCT FROM OLD.state
     AND NEW.state IN ('shipped', 'declined', 'duplicate', 'provisioned')
     AND OLD.state NOT IN ('shipped', 'declined', 'duplicate', 'provisioned')
  THEN
    UPDATE intake_items
       SET block_status = NULL,
           blocked_by_intake_item_id = NULL,
           updated_at = now()
     WHERE blocked_by_intake_item_id = NEW.id
       AND block_status IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS intake_items_auto_unblock_aiu ON intake_items;
CREATE TRIGGER intake_items_auto_unblock_aiu
  AFTER UPDATE OF state ON intake_items
  FOR EACH ROW EXECUTE FUNCTION intake_items_auto_unblock_fn();

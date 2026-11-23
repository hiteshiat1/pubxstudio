ALTER TABLE publish_jobs ADD COLUMN next_attempt_at timestamptz;

CREATE TABLE reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('confirmed_published', 'confirmed_absent')),
  provider_post_id text,
  evidence text NOT NULL CHECK (length(trim(evidence)) BETWEEN 12 AND 1000),
  happened_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, job_id) REFERENCES publish_jobs(workspace_id, id),
  FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships(workspace_id, user_id)
);

CREATE INDEX reconciliation_events_job_idx ON reconciliation_events (workspace_id, job_id, happened_at DESC);

CREATE FUNCTION reject_reconciliation_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'reconciliation events are immutable';
END;
$$;

CREATE TRIGGER immutable_reconciliation_events
  BEFORE UPDATE OR DELETE ON reconciliation_events
  FOR EACH ROW EXECUTE FUNCTION reject_reconciliation_event_change();

ALTER TABLE approvals ADD CONSTRAINT approval_revocation_actor_consistency
  CHECK ((status = 'approved' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL));

CREATE UNIQUE INDEX approvals_one_active_per_target
  ON approvals (workspace_id, revision_id, account_id)
  WHERE status = 'approved';

CREATE TABLE approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  account_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('approved', 'revoked')),
  reason text NOT NULL CHECK (reason IN ('manual_approval', 'new_revision', 'manual_revocation')),
  happened_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, approval_id, revision_id, account_id)
    REFERENCES approvals(workspace_id, id, revision_id, account_id),
  FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships(workspace_id, user_id)
);

CREATE INDEX approval_events_target_idx
  ON approval_events (workspace_id, revision_id, account_id, happened_at DESC);

CREATE FUNCTION reject_approval_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval events are immutable';
END;
$$;

CREATE TRIGGER immutable_approval_events
  BEFORE UPDATE OR DELETE ON approval_events
  FOR EACH ROW EXECUTE FUNCTION reject_approval_event_change();

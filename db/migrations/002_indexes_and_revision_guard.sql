CREATE INDEX publish_jobs_due_idx ON publish_jobs (scheduled_at, id)
  WHERE status = 'pending';
CREATE INDEX publish_jobs_lease_idx ON publish_jobs (lease_until)
  WHERE status = 'sending';
CREATE INDEX publish_attempts_job_idx ON publish_attempts (workspace_id, job_id, started_at DESC);
CREATE INDEX approvals_revision_idx ON approvals (workspace_id, revision_id);

CREATE FUNCTION reject_revision_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content revisions are immutable';
END;
$$;

CREATE TRIGGER immutable_content_revisions
  BEFORE UPDATE OR DELETE ON content_revisions
  FOR EACH ROW EXECUTE FUNCTION reject_revision_change();

ALTER TABLE publish_jobs ADD COLUMN live_authorized_by uuid;
ALTER TABLE publish_jobs ADD COLUMN live_authorized_at timestamptz;
ALTER TABLE publish_jobs ADD CONSTRAINT publish_jobs_live_authorization_fk
  FOREIGN KEY (workspace_id, live_authorized_by) REFERENCES memberships(workspace_id, user_id);
ALTER TABLE publish_jobs ADD CONSTRAINT publish_jobs_live_authorization_check
  CHECK ((live_authorized_by IS NULL) = (live_authorized_at IS NULL));

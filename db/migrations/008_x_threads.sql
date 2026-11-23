CREATE TABLE x_thread_parts (
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  part_number integer NOT NULL CHECK (part_number > 0),
  text_sha256 text NOT NULL CHECK (text_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'published', 'failed', 'uncertain')),
  reply_to_post_id text CHECK (reply_to_post_id ~ '^[0-9]{1,19}$'),
  provider_post_id text CHECK (provider_post_id ~ '^[0-9]{1,19}$'),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (workspace_id, job_id, part_number),
  FOREIGN KEY (workspace_id, job_id) REFERENCES publish_jobs(workspace_id, id),
  CHECK ((status = 'published') = (provider_post_id IS NOT NULL))
);

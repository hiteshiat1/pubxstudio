CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_subject text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('founder', 'approver', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  provider text NOT NULL CHECK (provider IN ('linkedin', 'x')),
  provider_account_id text NOT NULL CHECK (length(trim(provider_account_id)) > 0),
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'connected', 'expired', 'revoked')),
  credential_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, provider, provider_account_id)
);

CREATE TABLE content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, created_by) REFERENCES memberships(workspace_id, user_id)
);

CREATE TABLE content_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  content_item_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, content_item_id, revision_number),
  FOREIGN KEY (workspace_id, content_item_id) REFERENCES content_items(workspace_id, id),
  FOREIGN KEY (workspace_id, created_by) REFERENCES memberships(workspace_id, user_id)
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  account_id uuid NOT NULL,
  approved_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'revoked')),
  approved_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (workspace_id, id, revision_id, account_id),
  FOREIGN KEY (workspace_id, revision_id) REFERENCES content_revisions(workspace_id, id),
  FOREIGN KEY (workspace_id, account_id) REFERENCES social_accounts(workspace_id, id),
  FOREIGN KEY (workspace_id, approved_by) REFERENCES memberships(workspace_id, user_id),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE TABLE publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  account_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'published', 'failed', 'uncertain', 'cancelled')),
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, approval_id, revision_id, account_id)
    REFERENCES approvals(workspace_id, id, revision_id, account_id),
  FOREIGN KEY (workspace_id, requested_by) REFERENCES memberships(workspace_id, user_id),
  CHECK ((status = 'sending') = (lease_until IS NOT NULL))
);

CREATE TABLE publish_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN ('sending', 'published', 'failed', 'uncertain')),
  provider_post_id text,
  provider_url text,
  error_code text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (workspace_id, job_id, attempt_number),
  FOREIGN KEY (workspace_id, job_id) REFERENCES publish_jobs(workspace_id, id),
  CHECK (status <> 'published' OR (provider_post_id IS NOT NULL AND length(trim(provider_post_id)) > 0)),
  CHECK ((status = 'sending') = (finished_at IS NULL))
);

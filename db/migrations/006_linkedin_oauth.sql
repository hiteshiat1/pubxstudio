CREATE TABLE oauth_pending (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[0-9a-f]{64}$'),
  session_hash text NOT NULL REFERENCES app_sessions(token_hash),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  provider text NOT NULL CHECK (provider = 'linkedin'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, actor_id) REFERENCES memberships(workspace_id, user_id)
);

CREATE INDEX oauth_pending_expiry_idx ON oauth_pending (expires_at);

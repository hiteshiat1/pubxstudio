ALTER TABLE oauth_pending DROP CONSTRAINT oauth_pending_provider_check;
ALTER TABLE oauth_pending ADD CONSTRAINT oauth_pending_provider_check CHECK (provider IN ('linkedin', 'x'));
ALTER TABLE oauth_pending ADD COLUMN pkce_verifier text;
ALTER TABLE oauth_pending ADD CONSTRAINT oauth_pending_pkce_check CHECK (
  (provider = 'x' AND ((consumed_at IS NULL AND pkce_verifier ~ '^[A-Za-z0-9_-]{43}$') OR
    (consumed_at IS NOT NULL AND pkce_verifier IS NULL))) OR
  (provider = 'linkedin' AND pkce_verifier IS NULL)
);

ALTER TABLE social_accounts DROP COLUMN credential_ref;
ALTER TABLE social_accounts
  ADD COLUMN credential_ciphertext bytea,
  ADD COLUMN credential_key_id text,
  ADD COLUMN token_expires_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN credential_updated_at timestamptz,
  ADD CONSTRAINT credential_pair CHECK (
    (credential_ciphertext IS NULL) = (credential_key_id IS NULL)
  ),
  ADD CONSTRAINT connected_has_credential CHECK (
    status <> 'connected' OR (credential_ciphertext IS NOT NULL AND revoked_at IS NULL)
  ),
  ADD CONSTRAINT revoked_has_no_credential CHECK (
    status <> 'revoked' OR (credential_ciphertext IS NULL AND revoked_at IS NOT NULL)
  );

// Server-side storage primitive. Do not import from client components or expose as a server action.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keysFromEnvironment(env) {
  const activeId = env.PUBX_CREDENTIAL_ACTIVE_KEY_ID;
  let raw;
  try { raw = JSON.parse(env.PUBX_CREDENTIAL_KEYS || ''); } catch { throw new Error('Credential key configuration is invalid'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !activeId || !Object.hasOwn(raw, activeId)) {
    throw new Error('Credential key configuration is invalid');
  }
  const keys = new Map();
  for (const [id, encoded] of Object.entries(raw)) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) {
      throw new Error('Credential key configuration is invalid');
    }
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new Error('Credential key configuration is invalid');
    keys.set(id, key);
  }
  return { activeId, keys };
}

function seal(payload, key, workspaceId, accountId) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`${workspaceId}:${accountId}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), data]);
}

function open(ciphertext, key, workspaceId, accountId) {
  try {
    if (!key || !ciphertext || ciphertext.length < 29) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, ciphertext.subarray(0, 12));
    decipher.setAAD(Buffer.from(`${workspaceId}:${accountId}`));
    decipher.setAuthTag(ciphertext.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(ciphertext.subarray(28)), decipher.final()]).toString('utf8'));
  } catch { throw new Error('Credential cannot be decrypted'); }
}

export function createCredentialStore(client, env = process.env) {
  const { activeId, keys } = keysFromEnvironment(env);
  async function accountForFounder(workspaceId, accountId, actorId, lock = false) {
    const result = await client.query(`SELECT a.* FROM social_accounts a
      JOIN memberships m ON m.workspace_id = a.workspace_id AND m.user_id = $3 AND m.role = 'founder'
      WHERE a.workspace_id = $1 AND a.id = $2 ${lock ? 'FOR UPDATE OF a' : ''}`, [workspaceId, accountId, actorId]);
    if (result.rowCount !== 1) throw new Error('Account unavailable');
    return result.rows[0];
  }
  async function store({ workspaceId, accountId, actorId, accessToken, refreshToken, expiresAt }) {
    if (typeof accessToken !== 'string' || !accessToken.trim() || (refreshToken != null && typeof refreshToken !== 'string')) {
      throw new Error('Credential is invalid');
    }
    const expiry = expiresAt == null ? null : new Date(expiresAt);
    if (expiry && (!Number.isFinite(expiry.getTime()) || expiry <= new Date())) throw new Error('Credential expiry is invalid');
    await accountForFounder(workspaceId, accountId, actorId);
    const ciphertext = seal({ accessToken, refreshToken: refreshToken || null }, keys.get(activeId), workspaceId, accountId);
    const result = await client.query(`UPDATE social_accounts SET credential_ciphertext = $4,
      credential_key_id = $5, token_expires_at = $6, revoked_at = NULL,
      credential_updated_at = now(), status = 'connected'
      WHERE workspace_id = $1 AND id = $2 AND EXISTS (
        SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $3 AND role = 'founder'
      ) RETURNING id`, [workspaceId, accountId, actorId, ciphertext, activeId, expiry]);
    if (result.rowCount !== 1) throw new Error('Account unavailable');
  }
  async function read({ workspaceId, accountId, actorId }) {
    const account = await accountForFounder(workspaceId, accountId, actorId);
    if (account.status === 'revoked' || account.status === 'disconnected' || !account.credential_ciphertext) throw new Error('Credential unavailable');
    if (account.token_expires_at && new Date(account.token_expires_at) <= new Date()) {
      await client.query("UPDATE social_accounts SET status = 'expired' WHERE workspace_id = $1 AND id = $2 AND status = 'connected'", [workspaceId, accountId]);
      throw new Error('Credential expired');
    }
    if (account.status === 'expired') throw new Error('Credential expired');
    return open(account.credential_ciphertext, keys.get(account.credential_key_id), workspaceId, accountId);
  }
  async function revoke({ workspaceId, accountId, actorId }) {
    await accountForFounder(workspaceId, accountId, actorId);
    const result = await client.query(`UPDATE social_accounts SET credential_ciphertext = NULL,
      credential_key_id = NULL, token_expires_at = NULL, status = 'revoked',
      revoked_at = now(), credential_updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND EXISTS (
        SELECT 1 FROM memberships WHERE workspace_id = $1 AND user_id = $3 AND role = 'founder'
      ) RETURNING id`, [workspaceId, accountId, actorId]);
    if (result.rowCount !== 1) throw new Error('Account unavailable');
  }
  async function rotateKey({ workspaceId, accountId, actorId }) {
    await client.query('BEGIN');
    try {
      const account = await accountForFounder(workspaceId, accountId, actorId, true);
      if (!account.credential_ciphertext || account.status === 'revoked') throw new Error('Credential unavailable');
      const payload = open(account.credential_ciphertext, keys.get(account.credential_key_id), workspaceId, accountId);
      const ciphertext = seal(payload, keys.get(activeId), workspaceId, accountId);
      await client.query(`UPDATE social_accounts SET credential_ciphertext = $3,
        credential_key_id = $4, credential_updated_at = now()
        WHERE workspace_id = $1 AND id = $2`, [workspaceId, accountId, ciphertext, activeId]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  return { store, read, revoke, rotateKey };
}

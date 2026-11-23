import { createHash, randomBytes } from 'node:crypto';
import { hashSessionToken, requireMembership } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { appOrigin } from './github-login.mjs';

const CALLBACK_PATH = '/api/social/x/callback';
const SCOPES = 'tweet.read tweet.write users.read offline.access';
const stateHash = (state) => createHash('sha256').update(state).digest('hex');

function configuration(env) {
  if (!env.PUBX_X_CLIENT_ID || !env.PUBX_X_CLIENT_SECRET) throw new Error('X OAuth is not configured');
  return { clientId: env.PUBX_X_CLIENT_ID, clientSecret: env.PUBX_X_CLIENT_SECRET,
    redirectUri: `${appOrigin(env)}${CALLBACK_PATH}` };
}

function authHeader({ clientId, clientSecret }) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

function validateToken(token) {
  if (typeof token.access_token !== 'string' || !token.access_token ||
      !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0) throw new Error('X token response invalid');
  if (typeof token.scope === 'string') {
    const granted = new Set(token.scope.split(/\s+/));
    if (!['tweet.write', 'users.read'].every((scope) => granted.has(scope))) throw new Error('X scope unavailable');
  }
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('X token response invalid');
  return expiresAt;
}

export async function startXOAuth({ client, sessionToken, workspaceId, env = process.env }) {
  const { clientId, redirectUri } = configuration(env);
  const actor = await requireMembership(client, sessionToken, workspaceId, ['founder']);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  await client.query(`INSERT INTO oauth_pending
    (state_hash, session_hash, workspace_id, actor_id, provider, pkce_verifier, expires_at)
    VALUES ($1, $2, $3, $4, 'x', $5, now() + interval '10 minutes')`,
  [stateHash(state), hashSessionToken(sessionToken), workspaceId, actor.user_id, verifier]);
  const url = new URL('https://x.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function completeXOAuth({ client, sessionToken, state, code, denied = false,
  env = process.env, fetchImpl = fetch }) {
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || !hashSessionToken(sessionToken)) {
    throw new Error('Invalid X state');
  }
  const config = configuration(env);
  const pending = await client.query(`WITH valid AS (
      SELECT p.state_hash, p.workspace_id, p.actor_id, p.pkce_verifier FROM oauth_pending p
      JOIN app_sessions s ON s.token_hash = p.session_hash AND s.user_id = p.actor_id
      WHERE p.state_hash = $1 AND p.session_hash = $2 AND p.provider = 'x'
        AND p.consumed_at IS NULL AND p.expires_at > now()
        AND s.revoked_at IS NULL AND s.expires_at > now()
      FOR UPDATE OF p
    ) UPDATE oauth_pending p SET consumed_at = now(), pkce_verifier = NULL
    FROM valid WHERE p.state_hash = valid.state_hash
    RETURNING valid.workspace_id, valid.actor_id, valid.pkce_verifier`,
  [stateHash(state), hashSessionToken(sessionToken)]);
  if (pending.rowCount !== 1) throw new Error('Invalid X state');
  const { workspace_id: workspaceId, actor_id: actorId, pkce_verifier: verifier } = pending.rows[0];
  await requireMembership(client, sessionToken, workspaceId, ['founder']);
  if (denied) throw new Error('X consent denied');
  if (typeof code !== 'string' || !code.trim()) throw new Error('X code missing');
  const tokenResponse = await fetchImpl('https://api.x.com/2/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
      Authorization: authHeader(config) },
    body: new URLSearchParams({ grant_type: 'authorization_code', code,
      redirect_uri: config.redirectUri, code_verifier: verifier }), cache: 'no-store',
  });
  if (!tokenResponse.ok) throw new Error('X token exchange failed');
  const token = await tokenResponse.json();
  const expiresAt = validateToken(token);
  const profileResponse = await fetchImpl('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' }, cache: 'no-store',
  });
  if (!profileResponse.ok) throw new Error('X identity lookup failed');
  const profile = (await profileResponse.json()).data;
  if (!profile || !/^\d+$/.test(profile.id) || typeof profile.username !== 'string' || !profile.username.trim()) {
    throw new Error('X identity invalid');
  }
  await client.query('BEGIN');
  try {
    const account = await client.query(`INSERT INTO social_accounts
      (workspace_id, provider, provider_account_id, display_name)
      VALUES ($1, 'x', $2, $3)
      ON CONFLICT (workspace_id, provider, provider_account_id)
      DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
    [workspaceId, profile.id, `@${profile.username}`]);
    const accountId = account.rows[0].id;
    await createCredentialStore(client, env).store({ workspaceId, accountId, actorId,
      accessToken: token.access_token, refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : null,
      expiresAt });
    await client.query('COMMIT');
    return { workspaceId, accountId };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function refreshXCredential({ client, sessionToken, workspaceId, accountId,
  env = process.env, fetchImpl = fetch }) {
  const config = configuration(env);
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, sessionToken, workspaceId, ['founder']);
    const vault = createCredentialStore(client, env);
    const old = await vault.readForRefresh({ workspaceId, accountId, actorId: actor.user_id });
    const response = await fetchImpl('https://api.x.com/2/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
        Authorization: authHeader(config) },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: old.refreshToken }), cache: 'no-store',
    });
    if (!response.ok) throw new Error('X refresh failed');
    const token = await response.json();
    const expiresAt = validateToken(token);
    await vault.store({ workspaceId, accountId, actorId: actor.user_id, accessToken: token.access_token,
      refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : old.refreshToken,
      expiresAt });
    await client.query('COMMIT');
    return { accountId, expiresAt };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

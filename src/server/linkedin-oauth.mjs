import { createHash, randomBytes } from 'node:crypto';
import { hashSessionToken, requireMembership } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { appOrigin } from './github-login.mjs';

const CALLBACK_PATH = '/api/social/linkedin/callback';
const SCOPES = 'openid profile w_member_social';
const hashState = (state) => createHash('sha256').update(state).digest('hex');

function configuration(env) {
  if (!env.PUBX_LINKEDIN_CLIENT_ID || !env.PUBX_LINKEDIN_CLIENT_SECRET) throw new Error('LinkedIn is not configured');
  return { clientId: env.PUBX_LINKEDIN_CLIENT_ID, clientSecret: env.PUBX_LINKEDIN_CLIENT_SECRET,
    redirectUri: `${appOrigin(env)}${CALLBACK_PATH}` };
}

export async function startLinkedInOAuth({ client, sessionToken, workspaceId, env = process.env }) {
  const { clientId, redirectUri } = configuration(env);
  const actor = await requireMembership(client, sessionToken, workspaceId, ['founder']);
  const state = randomBytes(32).toString('base64url');
  await client.query(`INSERT INTO oauth_pending
    (state_hash, session_hash, workspace_id, actor_id, provider, expires_at)
    VALUES ($1, $2, $3, $4, 'linkedin', now() + interval '10 minutes')`,
  [hashState(state), hashSessionToken(sessionToken), workspaceId, actor.user_id]);
  const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function completeLinkedInOAuth({ client, sessionToken, state, code, denied = false,
  env = process.env, fetchImpl = fetch }) {
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || !hashSessionToken(sessionToken)) {
    throw new Error('Invalid LinkedIn state');
  }
  const { clientId, clientSecret, redirectUri } = configuration(env);
  // Consume before any network call, including a consent denial. A retry needs a new authorization.
  const pending = await client.query(`UPDATE oauth_pending p SET consumed_at = now()
    FROM app_sessions s
    WHERE p.state_hash = $1 AND p.session_hash = $2 AND p.provider = 'linkedin'
      AND p.consumed_at IS NULL AND p.expires_at > now()
      AND s.token_hash = p.session_hash AND s.user_id = p.actor_id
      AND s.revoked_at IS NULL AND s.expires_at > now()
    RETURNING p.workspace_id, p.actor_id`, [hashState(state), hashSessionToken(sessionToken)]);
  if (pending.rowCount !== 1) throw new Error('Invalid LinkedIn state');
  const { workspace_id: workspaceId, actor_id: actorId } = pending.rows[0];
  await requireMembership(client, sessionToken, workspaceId, ['founder']);
  if (denied) throw new Error('LinkedIn consent denied');
  if (typeof code !== 'string' || !code.trim()) throw new Error('LinkedIn code missing');

  const tokenResponse = await fetchImpl('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId,
      client_secret: clientSecret, redirect_uri: redirectUri }), cache: 'no-store',
  });
  if (!tokenResponse.ok) throw new Error('LinkedIn token exchange failed');
  const token = await tokenResponse.json();
  if (typeof token.access_token !== 'string' || !token.access_token ||
      !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0) throw new Error('LinkedIn token response invalid');
  const userResponse = await fetchImpl('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' }, cache: 'no-store',
  });
  if (!userResponse.ok) throw new Error('LinkedIn profile lookup failed');
  const profile = await userResponse.json();
  if (typeof profile.sub !== 'string' || !profile.sub.trim()) throw new Error('LinkedIn profile invalid');
  const displayName = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'LinkedIn member';
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  if (!Number.isFinite(expiresAt.getTime())) throw new Error('LinkedIn token response invalid');
  await client.query('BEGIN');
  try {
    const account = await client.query(`INSERT INTO social_accounts
      (workspace_id, provider, provider_account_id, display_name)
      VALUES ($1, 'linkedin', $2, $3)
      ON CONFLICT (workspace_id, provider, provider_account_id)
      DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`,
    [workspaceId, profile.sub, displayName]);
    const accountId = account.rows[0].id;
    await createCredentialStore(client, env).store({ workspaceId, accountId, actorId,
      accessToken: token.access_token, refreshToken: typeof token.refresh_token === 'string' ? token.refresh_token : null,
      expiresAt });
    await client.query('COMMIT');
    return { workspaceId, accountId };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

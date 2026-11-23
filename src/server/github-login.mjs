import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createSession } from '../../db/access.mjs';

export function appOrigin(env = process.env) {
  const url = new URL(env.PUBX_APP_ORIGIN || '');
  if (url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) {
    throw new Error('PUBX_APP_ORIGIN must be an HTTPS origin or local loopback');
  }
  return url.origin;
}

export function startGitHubLogin(env = process.env) {
  if (!env.PUBX_GITHUB_CLIENT_ID) throw new Error('GitHub login is not configured');
  const state = randomBytes(32).toString('base64url');
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', env.PUBX_GITHUB_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${appOrigin(env)}/api/auth/github/callback`);
  url.searchParams.set('state', state);
  return { state, url: url.toString() };
}

export async function completeGitHubLogin({ client, state, cookieState, code, env = process.env, fetchImpl = fetch }) {
  if (!state || !cookieState || typeof state !== 'string' || typeof cookieState !== 'string' || state.length !== cookieState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))) {
    throw new Error('Invalid login state');
  }
  if (!code || typeof code !== 'string' || !env.PUBX_GITHUB_CLIENT_ID || !env.PUBX_GITHUB_CLIENT_SECRET || !/^\d+$/.test(env.PUBX_FOUNDER_GITHUB_ID || '')) {
    throw new Error('GitHub login is not configured');
  }
  const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: env.PUBX_GITHUB_CLIENT_ID, client_secret: env.PUBX_GITHUB_CLIENT_SECRET, code, redirect_uri: `${appOrigin(env)}/api/auth/github/callback` }),
    cache: 'no-store',
  });
  if (!tokenResponse.ok) throw new Error('GitHub login failed');
  const tokenBody = await tokenResponse.json();
  if (!tokenBody.access_token || typeof tokenBody.access_token !== 'string') throw new Error('GitHub login failed');
  const userResponse = await fetchImpl('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenBody.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'PubxStudio' },
    cache: 'no-store',
  });
  if (!userResponse.ok) throw new Error('GitHub login failed');
  const profile = await userResponse.json();
  if (!Number.isSafeInteger(profile.id) || profile.id < 1) throw new Error('GitHub login failed');
  const subject = `github:${profile.id}`;
  await client.query('BEGIN');
  let userId;
  try {
    if (String(profile.id) === env.PUBX_FOUNDER_GITHUB_ID) {
      await client.query('SELECT pg_advisory_xact_lock(74022014)');
      const user = (await client.query(`INSERT INTO users (external_subject) VALUES ($1)
        ON CONFLICT (external_subject) DO UPDATE SET external_subject = EXCLUDED.external_subject RETURNING id`, [subject])).rows[0];
      userId = user.id;
      const memberships = await client.query('SELECT workspace_id FROM memberships WHERE user_id = $1 LIMIT 1', [userId]);
      if (!memberships.rowCount) {
        const workspace = (await client.query('INSERT INTO workspaces (name) VALUES ($1) RETURNING id', [env.PUBX_INITIAL_WORKSPACE_NAME || 'PubxStudio'])).rows[0];
        await client.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [workspace.id, userId]);
      }
    } else {
      const user = await client.query(`SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE u.external_subject = $1 LIMIT 1`, [subject]);
      if (!user.rowCount) throw new Error('Access denied');
      userId = user.rows[0].id;
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  return createSession(client, userId);
}

import { createHash, randomBytes } from 'node:crypto';

const ROLES = new Set(['founder', 'approver', 'operator']);
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function hashSessionToken(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(client, userId) {
  const token = randomBytes(32).toString('base64url');
  const hash = hashSessionToken(token);
  await client.query("INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')", [hash, userId]);
  return { token, maxAge: SESSION_SECONDS };
}

export async function revokeSession(client, token) {
  const hash = hashSessionToken(token);
  if (hash) await client.query('UPDATE app_sessions SET revoked_at = now() WHERE token_hash = $1', [hash]);
}

export async function requireMembership(client, token, workspaceId, allowedRoles = [...ROLES]) {
  const hash = hashSessionToken(token);
  if (!hash || !workspaceId || !allowedRoles.every((role) => ROLES.has(role))) throw new Error('Access denied');
  const result = await client.query(`SELECT m.user_id, m.role FROM app_sessions s
    JOIN memberships m ON m.user_id = s.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      AND m.workspace_id = $2 AND m.role = ANY($3::text[])`, [hash, workspaceId, allowedRoles]);
  if (result.rowCount !== 1) throw new Error('Access denied');
  return result.rows[0];
}

export async function listWorkspaces(client, token) {
  const hash = hashSessionToken(token);
  if (!hash) throw new Error('Access denied');
  const result = await client.query(`SELECT w.id, w.name, m.role FROM app_sessions s
    JOIN memberships m ON m.user_id = s.user_id
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
    ORDER BY w.created_at, w.id`, [hash]);
  if (!result.rowCount) throw new Error('Access denied');
  return result.rows;
}

export async function getSocialAccount(client, token, workspaceId, accountId) {
  const hash = hashSessionToken(token);
  if (!hash) throw new Error('Access denied');
  const result = await client.query(`SELECT a.id, a.workspace_id, a.provider, a.provider_account_id,
      a.display_name, a.status, a.token_expires_at, a.granted_scopes
    FROM social_accounts a
    JOIN memberships m ON m.workspace_id = a.workspace_id
    JOIN app_sessions s ON s.user_id = m.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
      AND a.workspace_id = $2 AND a.id = $3`, [hash, workspaceId, accountId]);
  if (result.rowCount !== 1) throw new Error('Account unavailable');
  return result.rows[0];
}

export async function listSocialAccounts(client, token, workspaceId) {
  await requireMembership(client, token, workspaceId);
  const result = await client.query(`SELECT id, workspace_id, provider, provider_account_id,
      display_name, status, token_expires_at, granted_scopes
    FROM social_accounts WHERE workspace_id = $1 ORDER BY provider, display_name, id`, [workspaceId]);
  return result.rows;
}

export async function setMemberRole(client, token, workspaceId, targetUserId, role) {
  if (!ROLES.has(role)) throw new Error('Invalid role');
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder']);
    const members = (await client.query('SELECT user_id, role FROM memberships WHERE workspace_id = $1 FOR UPDATE', [workspaceId])).rows;
    if (members.find((member) => member.user_id === actor.user_id)?.role !== 'founder') throw new Error('Access denied');
    const target = members.find((member) => member.user_id === targetUserId);
    if (!target) throw new Error('Member unavailable');
    if (target.role === 'founder' && role !== 'founder' && members.filter((member) => member.role === 'founder').length === 1) {
      throw new Error('Cannot remove the last founder');
    }
    await client.query('UPDATE memberships SET role = $3 WHERE workspace_id = $1 AND user_id = $2', [workspaceId, targetUserId, role]);
    await client.query('COMMIT');
    return { actorId: actor.user_id, targetUserId, role };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function addMember(client, token, workspaceId, externalSubject, role) {
  if (!ROLES.has(role) || !/^github:\d+$/.test(externalSubject)) throw new Error('Invalid member');
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder']);
    const currentRole = await client.query('SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2 FOR UPDATE', [workspaceId, actor.user_id]);
    if (currentRole.rows[0]?.role !== 'founder') throw new Error('Access denied');
    const user = (await client.query(`INSERT INTO users (external_subject) VALUES ($1)
      ON CONFLICT (external_subject) DO UPDATE SET external_subject = EXCLUDED.external_subject RETURNING id`, [externalSubject])).rows[0];
    await client.query('INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)', [workspaceId, user.id, role]);
    await client.query('COMMIT');
    return { userId: user.id, role };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from './migrate.mjs';
import { addMember, createSession, getSocialAccount, hashSessionToken, listWorkspaces, requireMembership, revokeSession, setMemberRole } from './access.mjs';
import { completeGitHubLogin, startGitHubLogin } from '../src/server/github-login.mjs';

test('sessions and roles enforce workspace and object isolation', async (t) => {
  const url = process.env.PUBX_TEST_DATABASE_URL;
  if (!url) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await migrate(url, { schema });
    await client.query(`SET search_path TO "${schema}"`);
    const q = (sql, params) => client.query(sql, params);
    const founder = (await q("INSERT INTO users (external_subject) VALUES ('github:101') RETURNING id")).rows[0].id;
    const ws1 = (await q("INSERT INTO workspaces (name) VALUES ('one') RETURNING id")).rows[0].id;
    const ws2 = (await q("INSERT INTO workspaces (name) VALUES ('two') RETURNING id")).rows[0].id;
    await q("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [ws1, founder]);
    const account = (await q("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name) VALUES ($1, 'linkedin', 'li-1', 'Account') RETURNING id", [ws1])).rows[0].id;
    const founderSession = await createSession(client, founder);
    assert.ok(hashSessionToken(founderSession.token));
    assert.equal((await q('SELECT token_hash FROM app_sessions')).rows[0].token_hash, hashSessionToken(founderSession.token));
    assert.equal((await listWorkspaces(client, founderSession.token))[0].id, ws1);
    assert.equal((await getSocialAccount(client, founderSession.token, ws1, account)).id, account);
    await assert.rejects(getSocialAccount(client, founderSession.token, ws2, account), /Account unavailable/);
    await assert.rejects(requireMembership(client, founderSession.token, ws2), /Access denied/);
    const member = await addMember(client, founderSession.token, ws1, 'github:202', 'operator');
    const operatorSession = await createSession(client, member.userId);
    await assert.rejects(requireMembership(client, operatorSession.token, ws1, ['approver']), /Access denied/);
    await assert.rejects(setMemberRole(client, operatorSession.token, ws1, founder, 'operator'), /Access denied/);
    await setMemberRole(client, founderSession.token, ws1, member.userId, 'approver');
    assert.equal((await requireMembership(client, operatorSession.token, ws1, ['approver'])).role, 'approver');
    await assert.rejects(setMemberRole(client, founderSession.token, ws1, founder, 'operator'), /last founder/);
    await revokeSession(client, operatorSession.token);
    await assert.rejects(requireMembership(client, operatorSession.token, ws1), /Access denied/);
    await q("UPDATE app_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [hashSessionToken(founderSession.token)]);
    await assert.rejects(requireMembership(client, founderSession.token, ws1), /Access denied/);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

test('GitHub login validates state and bootstraps only configured founder', async (t) => {
  const url = process.env.PUBX_TEST_DATABASE_URL;
  if (!url) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await migrate(url, { schema });
    await client.query(`SET search_path TO "${schema}"`);
    const env = { PUBX_APP_ORIGIN: 'http://127.0.0.1:3001', PUBX_GITHUB_CLIENT_ID: 'client-id', PUBX_GITHUB_CLIENT_SECRET: 'test-secret', PUBX_FOUNDER_GITHUB_ID: '101' };
    const start = startGitHubLogin(env);
    assert.equal(new URL(start.url).searchParams.get('state'), start.state);
    const fetchImpl = async (url) => url.includes('access_token')
      ? new Response(JSON.stringify({ access_token: 'provider-token' }), { status: 200 })
      : new Response(JSON.stringify({ id: 101 }), { status: 200 });
    await assert.rejects(completeGitHubLogin({ client, state: 'wrong', cookieState: start.state, code: 'code', env, fetchImpl }), /Invalid login state/);
    const session = await completeGitHubLogin({ client, state: start.state, cookieState: start.state, code: 'code', env, fetchImpl });
    assert.equal((await listWorkspaces(client, session.token))[0].role, 'founder');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM workspaces')).rows[0].n, 1);
    const repeat = await completeGitHubLogin({ client, state: start.state, cookieState: start.state, code: 'code', env, fetchImpl });
    assert.equal((await listWorkspaces(client, repeat.token))[0].role, 'founder');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM workspaces')).rows[0].n, 1);
    const outsiderFetch = async (url) => url.includes('access_token')
      ? new Response(JSON.stringify({ access_token: 'provider-token' }), { status: 200 })
      : new Response(JSON.stringify({ id: 999 }), { status: 200 });
    await assert.rejects(completeGitHubLogin({ client, state: start.state, cookieState: start.state, code: 'code', env, fetchImpl: outsiderFetch }), /Access denied/);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

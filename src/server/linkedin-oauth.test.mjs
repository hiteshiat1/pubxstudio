import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../db/migrate.mjs';
import { createSession } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { startLinkedInOAuth, completeLinkedInOAuth } from './linkedin-oauth.mjs';

test('LinkedIn OAuth binds state to founder session, consumes it once, and stores encrypted tokens', async (t) => {
  const databaseUrl = process.env.PUBX_TEST_DATABASE_URL;
  if (!databaseUrl) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const env = { PUBX_APP_ORIGIN: 'http://localhost:3001', PUBX_LINKEDIN_CLIENT_ID: 'client-id',
    PUBX_LINKEDIN_CLIENT_SECRET: 'client-secret', PUBX_CREDENTIAL_ACTIVE_KEY_ID: 'v1',
    PUBX_CREDENTIAL_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }) };
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await migrate(databaseUrl, { schema });
    await client.query(`SET search_path TO "${schema}"`);
    const founderId = (await client.query("INSERT INTO users (external_subject) VALUES ('founder') RETURNING id")).rows[0].id;
    const outsiderId = (await client.query("INSERT INTO users (external_subject) VALUES ('outsider') RETURNING id")).rows[0].id;
    const workspaceId = (await client.query("INSERT INTO workspaces (name) VALUES ('test') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [workspaceId, founderId]);
    const founder = (await createSession(client, founderId)).token;
    const outsider = (await createSession(client, outsiderId)).token;
    await assert.rejects(startLinkedInOAuth({ client, sessionToken: outsider, workspaceId, env }), /Access denied/);
    const start = () => startLinkedInOAuth({ client, sessionToken: founder, workspaceId, env });
    const first = new URL(await start());
    assert.equal(first.searchParams.get('scope'), 'openid profile w_member_social');
    assert.equal(first.searchParams.get('redirect_uri'), 'http://localhost:3001/api/social/linkedin/callback');
    assert.ok(!first.toString().includes('client-secret'));
    const state = first.searchParams.get('state');
    let calls = 0;
    const fetchImpl = async (url, options) => {
      calls++;
      if (url.endsWith('/accessToken')) {
        assert.equal(options.body.get('redirect_uri'), first.searchParams.get('redirect_uri'));
        return { ok: true, json: async () => ({ access_token: 'secret-access', expires_in: 3600 }) };
      }
      assert.equal(options.headers.Authorization, 'Bearer secret-access');
      return { ok: true, json: async () => ({ sub: 'member-123', name: 'Member Name' }) };
    };
    const args = { client, sessionToken: founder, state, code: 'one-time-code', env, fetchImpl };
    await assert.rejects(completeLinkedInOAuth({ ...args, sessionToken: outsider }), /Invalid LinkedIn state/);
    await assert.rejects(completeLinkedInOAuth({ ...args, state: 'bad' }), /Invalid LinkedIn state/);
    assert.equal(calls, 0);
    const result = await completeLinkedInOAuth(args);
    assert.equal(result.workspaceId, workspaceId);
    assert.equal(calls, 2);
    const account = (await client.query('SELECT * FROM social_accounts WHERE id = $1', [result.accountId])).rows[0];
    assert.equal(account.provider_account_id, 'member-123');
    assert.equal(account.status, 'connected');
    assert.ok(!account.credential_ciphertext.includes(Buffer.from('secret-access')));
    assert.deepEqual(await createCredentialStore(client, env).read({ workspaceId, accountId: result.accountId, actorId: founderId }),
      { accessToken: 'secret-access', refreshToken: null });
    await assert.rejects(completeLinkedInOAuth(args), /Invalid LinkedIn state/);
    assert.equal(calls, 2);
    const deniedState = new URL(await start()).searchParams.get('state');
    await assert.rejects(completeLinkedInOAuth({ ...args, state: deniedState, denied: true }), /consent denied/);
    await assert.rejects(completeLinkedInOAuth({ ...args, state: deniedState }), /Invalid LinkedIn state/);
    const expiredState = new URL(await start()).searchParams.get('state');
    await client.query("UPDATE oauth_pending SET expires_at = now() - interval '1 second' WHERE state_hash = $1",
      [createHash('sha256').update(expiredState).digest('hex')]);
    await assert.rejects(completeLinkedInOAuth({ ...args, state: expiredState }), /Invalid LinkedIn state/);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

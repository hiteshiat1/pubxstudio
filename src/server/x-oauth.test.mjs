import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../db/migrate.mjs';
import { createSession } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { startXOAuth, completeXOAuth, refreshXCredential } from './x-oauth.mjs';

test('X PKCE state, identity, reconnect, refresh rotation, and denial', async (t) => {
  const databaseUrl = process.env.PUBX_TEST_DATABASE_URL;
  if (!databaseUrl) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const env = { PUBX_APP_ORIGIN: 'http://localhost:3001', PUBX_X_CLIENT_ID: 'client-id',
    PUBX_X_CLIENT_SECRET: 'client-secret', PUBX_CREDENTIAL_ACTIVE_KEY_ID: 'v1',
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
    await assert.rejects(startXOAuth({ client, sessionToken: outsider, workspaceId, env }), /Access denied/);
    const start = () => startXOAuth({ client, sessionToken: founder, workspaceId, env });
    const url = new URL(await start());
    const state = url.searchParams.get('state');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('scope'), 'tweet.read tweet.write users.read offline.access');
    assert.ok(!url.toString().includes('client-secret'));
    let verifier = (await client.query('SELECT pkce_verifier FROM oauth_pending WHERE state_hash = $1',
      [createHash('sha256').update(state).digest('hex')])).rows[0].pkce_verifier;
    assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
    let tokenVersion = 1;
    let requests = 0;
    const fetchImpl = async (endpoint, options) => {
      requests++;
      if (endpoint.endsWith('/oauth2/token')) {
        assert.equal(options.headers.Authorization, `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`);
        if (options.body.get('grant_type') === 'authorization_code') {
          assert.equal(options.body.get('code_verifier'), verifier);
          return { ok: true, json: async () => ({ access_token: `access-${tokenVersion}`, refresh_token: `refresh-${tokenVersion}`,
            expires_in: 7200, scope: 'tweet.read tweet.write users.read offline.access' }) };
        }
        assert.equal(options.body.get('refresh_token'), `refresh-${tokenVersion}`);
        tokenVersion++;
        return { ok: true, json: async () => ({ access_token: `access-${tokenVersion}`, refresh_token: `refresh-${tokenVersion}`,
          expires_in: 7200, scope: 'tweet.read tweet.write users.read offline.access' }) };
      }
      assert.equal(options.headers.Authorization, `Bearer access-${tokenVersion}`);
      return { ok: true, json: async () => ({ data: { id: '123456789', username: 'pubx' } }) };
    };
    const args = { client, sessionToken: founder, state, code: 'code', env, fetchImpl };
    await assert.rejects(completeXOAuth({ ...args, sessionToken: outsider }), /Invalid X state/);
    assert.equal(requests, 0);
    const connected = await completeXOAuth(args);
    assert.equal(connected.workspaceId, workspaceId);
    assert.equal(requests, 2);
    await assert.rejects(completeXOAuth(args), /Invalid X state/);
    const vault = createCredentialStore(client, env);
    const vaultArgs = { workspaceId, accountId: connected.accountId, actorId: founderId };
    assert.deepEqual(await vault.read(vaultArgs), { accessToken: 'access-1', refreshToken: 'refresh-1' });
    assert.equal((await client.query('SELECT pkce_verifier FROM oauth_pending WHERE state_hash = $1',
      [createHash('sha256').update(state).digest('hex')])).rows[0].pkce_verifier, null);
    await refreshXCredential({ client, sessionToken: founder, workspaceId, accountId: connected.accountId, env, fetchImpl });
    assert.deepEqual(await vault.read(vaultArgs), { accessToken: 'access-2', refreshToken: 'refresh-2' });
    const reconnectState = new URL(await start()).searchParams.get('state');
    verifier = (await client.query('SELECT pkce_verifier FROM oauth_pending WHERE state_hash = $1',
      [createHash('sha256').update(reconnectState).digest('hex')])).rows[0].pkce_verifier;
    const reconnected = await completeXOAuth({ ...args, state: reconnectState });
    assert.equal(reconnected.accountId, connected.accountId);
    assert.deepEqual(await vault.read(vaultArgs), { accessToken: 'access-2', refreshToken: 'refresh-2' });
    assert.ok(!(await client.query('SELECT credential_ciphertext FROM social_accounts WHERE id = $1', [connected.accountId])).rows[0]
      .credential_ciphertext.includes(Buffer.from('access-2')));
    await assert.rejects(refreshXCredential({ client, sessionToken: outsider, workspaceId,
      accountId: connected.accountId, env, fetchImpl }), /Access denied/);
    const deniedState = new URL(await start()).searchParams.get('state');
    await assert.rejects(completeXOAuth({ ...args, state: deniedState, denied: true }), /consent denied/);
    await assert.rejects(completeXOAuth({ ...args, state: deniedState }), /Invalid X state/);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

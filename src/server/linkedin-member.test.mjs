import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../db/migrate.mjs';
import { createSession } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { createContentItem, approveContentRevision, revokeContentApproval } from '../../db/content.mjs';
import { schedulePublishJob, claimDuePublishJob } from '../../db/queue.mjs';
import { publishLinkedInMemberJob } from './linkedin-member.mjs';

test('LinkedIn member job resolves a verified person ID and posts only a current approved revision', async (t) => {
  const url = process.env.PUBX_TEST_DATABASE_URL;
  if (!url) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await migrate(url, { schema });
    await client.query(`SET search_path TO "${schema}"`);
    const founderId = (await client.query("INSERT INTO users (external_subject) VALUES ('founder') RETURNING id")).rows[0].id;
    const workspaceId = (await client.query("INSERT INTO workspaces (name) VALUES ('test') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [workspaceId, founderId]);
    const session = (await createSession(client, founderId)).token;
    const accountId = (await client.query("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name) VALUES ($1, 'linkedin', 'oidc-sub', 'Test') RETURNING id", [workspaceId])).rows[0].id;
    const env = { PUBX_CREDENTIAL_ACTIVE_KEY_ID: 'v1', PUBX_CREDENTIAL_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }) };
    await createCredentialStore(client, env).store({ workspaceId, accountId, actorId: founderId,
      accessToken: 'secret', expiresAt: Date.now() + 60_000 });
    const item = await createContentItem(client, session, workspaceId, 'Post', 'Approved LinkedIn text');
    const approval = await approveContentRevision(client, session, workspaceId, item.revision.id, accountId);
    const due = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const schedule = async (key) => schedulePublishJob(client, session, { workspaceId, approvalId: approval.approvalId,
      scheduledAt: due, idempotencyKey: key });
    const first = await schedule('linkedin-first');
    assert.equal((await claimDuePublishJob(client)).jobId, first.jobId);
    let calls = 0;
    const fetchImpl = async (endpoint, options) => {
      calls++;
      assert.equal(options.headers.Authorization, 'Bearer secret');
      if (endpoint.endsWith('/v2/me')) return { ok: true, json: async () => ({ id: 'profile-person-id' }) };
      assert.equal(endpoint, 'https://api.linkedin.com/rest/posts');
      assert.equal(JSON.parse(options.body).author, 'urn:li:person:profile-person-id');
      assert.equal(JSON.parse(options.body).commentary, 'Approved LinkedIn text');
      return { status: 201, headers: { get: (key) => key === 'x-restli-id' ? 'urn:li:share:777' : null } };
    };
    assert.deepEqual(await publishLinkedInMemberJob({ client, jobId: first.jobId, actorId: founderId, env, fetchImpl }),
      { providerPostId: 'urn:li:share:777', providerUrl: null });
    assert.equal(calls, 2);
    const second = await schedule('linkedin-second');
    assert.equal((await claimDuePublishJob(client)).jobId, second.jobId);
    let posted = false;
    await assert.rejects(publishLinkedInMemberJob({ client, jobId: second.jobId, actorId: founderId, env,
      fetchImpl: async (endpoint) => { if (endpoint.endsWith('/v2/me')) return { ok: false }; posted = true; } }),
    /identity unavailable/);
    assert.equal(posted, false);
    await revokeContentApproval(client, session, workspaceId, approval.approvalId);
    await assert.rejects(publishLinkedInMemberJob({ client, jobId: second.jobId, actorId: founderId, env, fetchImpl }),
      /job unavailable/);
    assert.equal(calls, 2);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

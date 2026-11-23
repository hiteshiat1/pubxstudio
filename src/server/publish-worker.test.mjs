import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../db/migrate.mjs';
import { createSession } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { createContentItem, approveContentRevision } from '../../db/content.mjs';
import { schedulePublishJob, authorizePublishJob, reconcilePublishJob } from '../../db/queue.mjs';
import { runOnePublishJob } from './publish-worker.mjs';

test('worker requires founder job authorization and provider flags, records confirmed and uncertain outcomes', async (t) => {
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
    const accountId = (await client.query("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name) VALUES ($1, 'x', '12345', '@test') RETURNING id", [workspaceId])).rows[0].id;
    const env = { PUBX_CREDENTIAL_ACTIVE_KEY_ID: 'v1', PUBX_CREDENTIAL_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }),
      PUBX_PUBLISHING_ENABLED: '1', PUBX_X_POSTING_ENABLED: '1' };
    await createCredentialStore(client, env).store({ workspaceId, accountId, actorId: founderId,
      accessToken: 'secret', expiresAt: Date.now() + 60_000 });
    const item = await createContentItem(client, session, workspaceId, 'Post', 'Worker test');
    const approval = await approveContentRevision(client, session, workspaceId, item.revision.id, accountId);
    const due = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const schedule = (key) => schedulePublishJob(client, session, { workspaceId, approvalId: approval.approvalId,
      scheduledAt: due, idempotencyKey: key });
    const first = await schedule('worker-first');
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, status: 201, json: async () => ({ data: { id: '123456' } }) }; };
    assert.deepEqual(await runOnePublishJob({ client, env: { ...env, PUBX_PUBLISHING_ENABLED: '0' }, fetchImpl }), { status: 'disabled' });
    assert.deepEqual(await runOnePublishJob({ client, env, fetchImpl }), { status: 'idle' });
    assert.equal(calls, 0);
    await assert.rejects(authorizePublishJob(client, session, { workspaceId, jobId: first.jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true }), /unavailable/);
    await authorizePublishJob(client, session, { workspaceId, jobId: first.jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true, confirmXCost: true });
    assert.deepEqual(await runOnePublishJob({ client, env: { ...env, PUBX_X_POSTING_ENABLED: '0' }, fetchImpl }), { status: 'disabled' });
    assert.equal((await runOnePublishJob({ client, env, fetchImpl })).status, 'published');
    assert.equal(calls, 1);
    const firstResult = (await client.query('SELECT status, provider_post_id FROM publish_attempts WHERE job_id = $1', [first.jobId])).rows[0];
    assert.deepEqual(firstResult, { status: 'published', provider_post_id: '123456' });
    const second = await schedule('worker-second');
    await authorizePublishJob(client, session, { workspaceId, jobId: second.jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true, confirmXCost: true });
    assert.equal((await runOnePublishJob({ client, env, fetchImpl: async () => { throw new Error('timeout after acceptance'); } })).status, 'uncertain');
    assert.equal((await client.query('SELECT status FROM publish_jobs WHERE id = $1', [second.jobId])).rows[0].status, 'uncertain');
    assert.deepEqual(await runOnePublishJob({ client, env, fetchImpl }), { status: 'idle' });
    assert.equal(calls, 1);
    await assert.rejects(reconcilePublishJob(client, session, { workspaceId, jobId: second.jobId,
      action: 'confirmed_published', providerPostId: 'bad', evidence: 'Verified in the provider timeline' }), /Invalid provider post ID/);
    assert.deepEqual(await reconcilePublishJob(client, session, { workspaceId, jobId: second.jobId,
      action: 'confirmed_published', providerPostId: '987654', evidence: 'Verified exact post in provider timeline' }),
      { jobId: second.jobId, status: 'published' });
    await assert.rejects(reconcilePublishJob(client, session, { workspaceId, jobId: second.jobId,
      action: 'confirmed_absent', evidence: 'Verified absent in provider timeline' }), /Uncertain job unavailable/);
    const third = await schedule('worker-third');
    await authorizePublishJob(client, session, { workspaceId, jobId: third.jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true, confirmXCost: true });
    assert.equal((await runOnePublishJob({ client, env, fetchImpl: async () => ({ ok: false, status: 429,
      headers: { get: () => '120' } }) })).status, 'pending');
    const retry = (await client.query('SELECT status, next_attempt_at FROM publish_jobs WHERE id = $1', [third.jobId])).rows[0];
    assert.equal(retry.status, 'pending');
    assert.ok(new Date(retry.next_attempt_at) > new Date());
    assert.deepEqual(await runOnePublishJob({ client, env, fetchImpl }), { status: 'idle' });
    await client.query("UPDATE publish_jobs SET next_attempt_at = now() - interval '1 second' WHERE id = $1", [third.jobId]);
    assert.equal((await runOnePublishJob({ client, env, fetchImpl })).status, 'published');
    assert.equal(calls, 2);
    const retryAttempts = (await client.query('SELECT attempt_number, status FROM publish_attempts WHERE job_id = $1 ORDER BY attempt_number', [third.jobId])).rows;
    assert.deepEqual(retryAttempts, [{ attempt_number: 1, status: 'failed' }, { attempt_number: 2, status: 'published' }]);
    const fourth = await schedule('worker-fourth');
    await authorizePublishJob(client, session, { workspaceId, jobId: fourth.jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true, confirmXCost: true });
    assert.equal((await runOnePublishJob({ client, env, fetchImpl: async () => { throw new Error('timeout'); } })).status, 'uncertain');
    assert.deepEqual(await reconcilePublishJob(client, session, { workspaceId, jobId: fourth.jobId,
      action: 'confirmed_absent', evidence: 'Verified no matching post in the X account timeline' }),
      { jobId: fourth.jobId, status: 'pending' });
    assert.equal((await runOnePublishJob({ client, env, fetchImpl })).status, 'published');
    const events = (await client.query('SELECT action FROM reconciliation_events WHERE workspace_id = $1 ORDER BY happened_at', [workspaceId])).rows;
    assert.deepEqual(new Set(events.map((event) => event.action)), new Set(['confirmed_published', 'confirmed_absent']));
    await assert.rejects(client.query("DELETE FROM reconciliation_events WHERE workspace_id = $1", [workspaceId]), { code: 'P0001' });
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

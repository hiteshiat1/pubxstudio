import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from './migrate.mjs';
import { createSession } from './access.mjs';
import { createCredentialStore } from './credentials.mjs';
import { createContentItem, approveContentRevision } from './content.mjs';
import { schedulePublishJob, cancelPublishJob, claimDuePublishJob, recoverExpiredPublishLeases, finishPublishJob, listPublishJobs, authorizePublishJob } from './queue.mjs';

test('durable queue schedules UTC jobs, claims once across workers, and recovers uncertain leases', async (t) => {
  const url = process.env.PUBX_TEST_DATABASE_URL;
  if (!url) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  const client = new pg.Client({ connectionString: url });
  const worker = new pg.Client({ connectionString: url });
  await client.connect(); await worker.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await migrate(url, { schema });
    await client.query(`SET search_path TO "${schema}"`);
    await worker.query(`SET search_path TO "${schema}"`);
    const founderId = (await client.query("INSERT INTO users (external_subject) VALUES ('founder') RETURNING id")).rows[0].id;
    const outsiderId = (await client.query("INSERT INTO users (external_subject) VALUES ('outsider') RETURNING id")).rows[0].id;
    const workspaceId = (await client.query("INSERT INTO workspaces (name) VALUES ('test') RETURNING id")).rows[0].id;
    await client.query("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [workspaceId, founderId]);
    const founder = (await createSession(client, founderId)).token;
    const outsider = (await createSession(client, outsiderId)).token;
    const accountId = (await client.query("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name) VALUES ($1, 'linkedin', 'member', 'Member') RETURNING id", [workspaceId])).rows[0].id;
    const env = { PUBX_CREDENTIAL_ACTIVE_KEY_ID: 'v1', PUBX_CREDENTIAL_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }) };
    await createCredentialStore(client, env).store({ workspaceId, accountId, actorId: founderId, accessToken: 'test', expiresAt: Date.now() + 60_000 });
    const item = await createContentItem(client, founder, workspaceId, 'Test', 'Approved body');
    const approval = await approveContentRevision(client, founder, workspaceId, item.revision.id, accountId);
    const due = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const future = new Date(Date.now() + 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const data = { workspaceId, approvalId: approval.approvalId, scheduledAt: due, idempotencyKey: 'first-job' };
    await assert.rejects(schedulePublishJob(client, outsider, data), /Access denied/);
    await assert.rejects(schedulePublishJob(client, founder, { ...data, scheduledAt: '2026-02-30T12:00:00Z' }), /Invalid schedule/);
    const first = await schedulePublishJob(client, founder, data);
    assert.equal((await schedulePublishJob(client, founder, data)).jobId, first.jobId);
    await assert.rejects(schedulePublishJob(client, founder, { ...data, scheduledAt: future }), /Idempotency key conflict/);
    const second = await schedulePublishJob(client, founder, { ...data, idempotencyKey: 'second-job' });
    const later = await schedulePublishJob(client, founder, { ...data, scheduledAt: future, idempotencyKey: 'later-job' });
    assert.equal(await claimDuePublishJob(client), null);
    const authorize = (jobId, token = founder) => authorizePublishJob(client, token, { workspaceId, jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256, confirmLivePost: true });
    await assert.rejects(authorize(first.jobId, outsider), /Access denied/);
    await assert.rejects(authorizePublishJob(client, founder, { workspaceId, jobId: first.jobId,
      expectedAccountId: accountId, expectedContentSha256: '0'.repeat(64), confirmLivePost: true }), /unavailable/);
    await authorize(first.jobId); await authorize(second.jobId); await authorize(later.jobId);
    await assert.rejects(listPublishJobs(client, outsider, workspaceId), /Access denied/);
    assert.equal((await listPublishJobs(client, founder, workspaceId)).length, 3);
    const [a, b] = await Promise.all([claimDuePublishJob(client), claimDuePublishJob(worker)]);
    assert.deepEqual(new Set([a.jobId, b.jobId]), new Set([first.jobId, second.jobId]));
    assert.equal(a.body, 'Approved body');
    assert.equal(await claimDuePublishJob(client), null);
    await assert.rejects(finishPublishJob(client, { jobId: a.jobId, outcome: 'published' }), /Invalid outcome/);
    await finishPublishJob(client, { jobId: a.jobId, outcome: 'published', providerPostId: 'urn:li:share:123' });
    await assert.rejects(finishPublishJob(client, { jobId: a.jobId, outcome: 'published', providerPostId: 'duplicate' }), /Sending job unavailable/);
    await assert.rejects(cancelPublishJob(client, founder, workspaceId, first.jobId), /Pending job unavailable/);
    await assert.rejects(cancelPublishJob(client, outsider, workspaceId, later.jobId), /Access denied/);
    await cancelPublishJob(client, founder, workspaceId, later.jobId);
    await client.query("UPDATE publish_jobs SET lease_until = now() - interval '1 second' WHERE id = $1", [b.jobId]);
    assert.equal(await recoverExpiredPublishLeases(worker), 1);
    assert.equal(await recoverExpiredPublishLeases(worker), 0);
    const jobs = (await client.query('SELECT status FROM publish_jobs WHERE id = ANY($1::uuid[])', [[a.jobId, b.jobId]])).rows;
    assert.deepEqual(new Set(jobs.map((job) => job.status)), new Set(['published', 'uncertain']));
    const attempts = (await client.query('SELECT status, error_code FROM publish_attempts WHERE job_id = ANY($1::uuid[])', [[a.jobId, b.jobId]])).rows;
    assert.deepEqual(new Set(attempts.map((attempt) => attempt.status)), new Set(['published', 'uncertain']));
    assert.equal(attempts.find((attempt) => attempt.status === 'uncertain').error_code, 'lease_expired');
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await worker.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end(); await worker.end();
  }
});

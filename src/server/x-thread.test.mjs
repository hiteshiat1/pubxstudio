import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../db/migrate.mjs';
import { createSession } from '../../db/access.mjs';
import { createCredentialStore } from '../../db/credentials.mjs';
import { createContentItem, approveContentRevision } from '../../db/content.mjs';
import { schedulePublishJob, claimDuePublishJob, authorizePublishJob } from '../../db/queue.mjs';
import { parseXThread, prepareXThread, sendXThreadJob } from './x-thread.mjs';

test('X thread records IDs and reply links, resumes published prefix, and stops on uncertainty', async (t) => {
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
    const env = { PUBX_CREDENTIAL_ACTIVE_KEY_ID: 'v1', PUBX_CREDENTIAL_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }) };
    await createCredentialStore(client, env).store({ workspaceId, accountId, actorId: founderId,
      accessToken: 'secret', expiresAt: Date.now() + 60_000 });
    assert.deepEqual(parseXThread(JSON.stringify({ posts: ['one', 'two'] })), ['one', 'two']);
    assert.throws(() => parseXThread(JSON.stringify({ posts: ['one', 'a'.repeat(281)] })), /invalid_text/);
    const body = JSON.stringify({ posts: ['one', 'two', 'three'] });
    const item = await createContentItem(client, session, workspaceId, 'Thread', body);
    const approval = await approveContentRevision(client, session, workspaceId, item.revision.id, accountId);
    const due = new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const scheduled = await schedulePublishJob(client, session, { workspaceId, approvalId: approval.approvalId,
      scheduledAt: due, idempotencyKey: 'thread-job' });
    const authorize = (jobId) => authorizePublishJob(client, session, { workspaceId, jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true, confirmXCost: true });
    await assert.rejects(authorizePublishJob(client, session, { workspaceId, jobId: scheduled.jobId,
      expectedAccountId: accountId, expectedContentSha256: item.revision.content_sha256,
      confirmLivePost: true }), /unavailable/);
    await authorize(scheduled.jobId);
    assert.equal((await claimDuePublishJob(client)).jobId, scheduled.jobId);
    await prepareXThread(client, scheduled.jobId);
    await client.query(`UPDATE x_thread_parts SET status = 'published', provider_post_id = '111',
      finished_at = now() WHERE workspace_id = $1 AND job_id = $2 AND part_number = 1`, [workspaceId, scheduled.jobId]);
    let calls = 0;
    const fetchImpl = async (_url, options) => {
      calls++;
      const payload = JSON.parse(options.body);
      assert.equal(payload.text, calls === 1 ? 'two' : 'three');
      assert.equal(payload.reply.in_reply_to_tweet_id, calls === 1 ? '111' : '222');
      return { ok: true, status: 201, json: async () => ({ data: { id: calls === 1 ? '222' : '333' } }) };
    };
    const result = await sendXThreadJob({ client, jobId: scheduled.jobId, actorId: founderId, env, fetchImpl });
    assert.equal(result.providerPostId, '333');
    assert.equal(calls, 2);
    const parts = (await client.query('SELECT status, reply_to_post_id, provider_post_id FROM x_thread_parts WHERE job_id = $1 ORDER BY part_number', [scheduled.jobId])).rows;
    assert.deepEqual(parts.map((part) => part.provider_post_id), ['111', '222', '333']);
    assert.deepEqual(parts.map((part) => part.reply_to_post_id), [null, '111', '222']);
    const second = await schedulePublishJob(client, session, { workspaceId, approvalId: approval.approvalId,
      scheduledAt: due, idempotencyKey: 'thread-job-two' });
    await authorize(second.jobId);
    assert.equal((await claimDuePublishJob(client)).jobId, second.jobId);
    let attempted = 0;
    await assert.rejects(sendXThreadJob({ client, jobId: second.jobId, actorId: founderId, env,
      fetchImpl: async () => { attempted++; if (attempted === 1) return { ok: true, status: 201, json: async () => ({ data: { id: '444' } }) };
        throw new Error('timeout after acceptance'); } }), { outcome: 'uncertain' });
    assert.equal(attempted, 2);
    await assert.rejects(sendXThreadJob({ client, jobId: second.jobId, actorId: founderId, env,
      fetchImpl: async () => { attempted++; throw new Error('must not replay'); } }), /reconciliation/);
    assert.equal(attempted, 2);
    const secondParts = (await client.query('SELECT status, provider_post_id FROM x_thread_parts WHERE job_id = $1 ORDER BY part_number', [second.jobId])).rows;
    assert.deepEqual(secondParts.map((part) => part.status), ['published', 'uncertain', 'pending']);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

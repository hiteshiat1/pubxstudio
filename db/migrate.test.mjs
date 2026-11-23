import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import { migrate } from './migrate.mjs';

test('fresh install, upgrade, restart persistence, and constraints', async (t) => {
  const url = process.env.PUBX_TEST_DATABASE_URL;
  if (!url) return t.skip('Set PUBX_TEST_DATABASE_URL to a disposable PostgreSQL database');
  const schema = `pubx_test_${randomUUID().replaceAll('-', '')}`;
  let client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    assert.deepEqual(await migrate(url, { through: '001', schema }), ['001']);
    await client.query(`SET search_path TO "${schema}"`);
    const q = (sql, values) => client.query(sql, values);
    const user = (await q("INSERT INTO users (external_subject) VALUES ('test-user') RETURNING id")).rows[0].id;
    const ws1 = (await q("INSERT INTO workspaces (name) VALUES ('one') RETURNING id")).rows[0].id;
    const ws2 = (await q("INSERT INTO workspaces (name) VALUES ('two') RETURNING id")).rows[0].id;
    await q("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [ws1, user]);
    const account = (await q("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name) VALUES ($1, 'linkedin', 'person-1', 'Test') RETURNING id", [ws1])).rows[0].id;
    const item = (await q("INSERT INTO content_items (workspace_id, title, created_by) VALUES ($1, 'Draft', $2) RETURNING id", [ws1, user])).rows[0].id;
    const digest = createHash('sha256').update('draft body').digest('hex');
    const revision = (await q('INSERT INTO content_revisions (workspace_id, content_item_id, revision_number, body, content_sha256, created_by) VALUES ($1, $2, 1, $3, $4, $5) RETURNING id', [ws1, item, 'draft body', digest, user])).rows[0].id;
    const approval = (await q('INSERT INTO approvals (workspace_id, revision_id, account_id, approved_by) VALUES ($1, $2, $3, $4) RETURNING id', [ws1, revision, account, user])).rows[0].id;
    const job = (await q("INSERT INTO publish_jobs (workspace_id, approval_id, revision_id, account_id, requested_by, idempotency_key) VALUES ($1, $2, $3, $4, $5, 'once') RETURNING id", [ws1, approval, revision, account, user])).rows[0].id;
    await assert.rejects(q('INSERT INTO content_revisions (workspace_id, content_item_id, revision_number, body, content_sha256, created_by) VALUES ($1, $2, 2, $3, $4, $5)', [ws2, item, 'draft body', digest, user]), { code: '23503' });
    await assert.rejects(q("INSERT INTO publish_jobs (workspace_id, approval_id, revision_id, account_id, requested_by, idempotency_key) VALUES ($1, $2, $3, $4, $5, 'once')", [ws1, approval, revision, account, user]), { code: '23505' });
    await assert.rejects(q("INSERT INTO publish_attempts (workspace_id, job_id, attempt_number, status, finished_at) VALUES ($1, $2, 1, 'published', now())", [ws1, job]), { code: '23514' });
    await client.end(); // A new process/connection must see durable records.
    client = new pg.Client({ connectionString: url });
    await client.connect();
    assert.deepEqual(await migrate(url, { schema }), ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010']);
    assert.deepEqual(await migrate(url, { schema }), ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010']);
    await client.query(`SET search_path TO "${schema}"`);
    assert.equal((await client.query('SELECT body FROM content_revisions WHERE id = $1', [revision])).rows[0].body, 'draft body');
    assert.equal((await client.query('SELECT status FROM publish_jobs WHERE id = $1', [job])).rows[0].status, 'pending');
    await assert.rejects(client.query("UPDATE content_revisions SET body = 'changed' WHERE id = $1", [revision]), { code: 'P0001' });
    await assert.rejects(client.query('DELETE FROM content_revisions WHERE id = $1', [revision]), { code: 'P0001' });
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

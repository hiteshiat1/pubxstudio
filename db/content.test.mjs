import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from './migrate.mjs';
import { createSession } from './access.mjs';
import { addContentRevision, approveContentRevision, createContentItem, revokeContentApproval } from './content.mjs';

test('approval is bound to latest immutable revision and account, with audit and no bypass', async (t) => {
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
    const ids = {};
    for (const [index, role] of ['founder', 'operator', 'approver', 'outsider'].entries()) {
      ids[role] = (await q('INSERT INTO users (external_subject) VALUES ($1) RETURNING id', [`github:${index + 101}`])).rows[0].id;
    }
    const ws = (await q("INSERT INTO workspaces (name) VALUES ('first') RETURNING id")).rows[0].id;
    const other = (await q("INSERT INTO workspaces (name) VALUES ('second') RETURNING id")).rows[0].id;
    for (const role of ['founder', 'operator', 'approver']) await q('INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, $3)', [ws, ids[role], role]);
    await q("INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'founder')", [other, ids.outsider]);
    const sessions = {};
    for (const role of Object.keys(ids)) sessions[role] = (await createSession(client, ids[role])).token;
    const account = (await q("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name, status, credential_ciphertext, credential_key_id) VALUES ($1, 'linkedin', 'person-1', 'Test', 'connected', $2, 'test') RETURNING id", [ws, Buffer.from('encrypted-test-placeholder')])).rows[0].id;
    const otherAccount = (await q("INSERT INTO social_accounts (workspace_id, provider, provider_account_id, display_name) VALUES ($1, 'linkedin', 'other', 'Other') RETURNING id", [other])).rows[0].id;
    const { itemId, revision } = await createContentItem(client, sessions.operator, ws, 'Draft', 'First draft');
    await assert.rejects(approveContentRevision(client, sessions.operator, ws, revision.id, account), /Access denied/);
    await assert.rejects(approveContentRevision(client, sessions.outsider, ws, revision.id, account), /Access denied/);
    await assert.rejects(approveContentRevision(client, sessions.approver, ws, revision.id, otherAccount), /Account unavailable/);
    const approved = await approveContentRevision(client, sessions.approver, ws, revision.id, account);
    await assert.rejects(approveContentRevision(client, sessions.approver, ws, revision.id, account), { code: '23505' });
    const job = (await q("INSERT INTO publish_jobs (workspace_id, approval_id, revision_id, account_id, requested_by, idempotency_key) VALUES ($1, $2, $3, $4, $5, 'test-job') RETURNING id", [ws, approved.approvalId, revision.id, account, ids.founder])).rows[0].id;
    const next = await addContentRevision(client, sessions.operator, ws, itemId, 'Updated draft');
    assert.equal(next.revision_number, 2);
    assert.equal((await q('SELECT status FROM approvals WHERE id = $1', [approved.approvalId])).rows[0].status, 'revoked');
    assert.equal((await q('SELECT status FROM publish_jobs WHERE id = $1', [job])).rows[0].status, 'cancelled');
    await assert.rejects(approveContentRevision(client, sessions.approver, ws, revision.id, account), /Revision is not current/);
    const latestApproval = await approveContentRevision(client, sessions.approver, ws, next.id, account);
    await revokeContentApproval(client, sessions.founder, ws, latestApproval.approvalId);
    assert.deepEqual((await q('SELECT event, reason FROM approval_events ORDER BY happened_at, event')).rows.map((row) => row.reason).sort(), ['manual_approval', 'manual_approval', 'manual_revocation', 'new_revision']);
    await assert.rejects(q("UPDATE approval_events SET reason = 'new_revision' WHERE approval_id = $1", [approved.approvalId]), { code: 'P0001' });
    await assert.rejects(addContentRevision(client, sessions.outsider, ws, itemId, 'bad'), /Access denied/);
    await assert.rejects(revokeContentApproval(client, sessions.operator, ws, latestApproval.approvalId), /Access denied/);
  } finally {
    await client.query('SET search_path TO public').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await client.end();
  }
});

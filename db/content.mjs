import { createHash } from 'node:crypto';
import { requireMembership } from './access.mjs';

function digest(body) { return createHash('sha256').update(body).digest('hex'); }
function validText(value, limit) { return typeof value === 'string' && value.trim().length > 0 && value.length <= limit; }

export async function createContentItem(client, token, workspaceId, title, body) {
  if (!validText(title, 300) || !validText(body, 100_000)) throw new Error('Invalid content');
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder', 'operator']);
    const item = (await client.query('INSERT INTO content_items (workspace_id, title, created_by) VALUES ($1, $2, $3) RETURNING id', [workspaceId, title.trim(), actor.user_id])).rows[0];
    const revision = (await client.query(`INSERT INTO content_revisions
      (workspace_id, content_item_id, revision_number, body, content_sha256, created_by)
      VALUES ($1, $2, 1, $3, $4, $5) RETURNING id, revision_number, content_sha256`, [workspaceId, item.id, body, digest(body), actor.user_id])).rows[0];
    await client.query('COMMIT');
    return { itemId: item.id, revision };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function addContentRevision(client, token, workspaceId, itemId, body) {
  if (!validText(body, 100_000)) throw new Error('Invalid content');
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder', 'operator']);
    const item = await client.query('SELECT id FROM content_items WHERE workspace_id = $1 AND id = $2 FOR UPDATE', [workspaceId, itemId]);
    if (!item.rowCount) throw new Error('Content unavailable');
    const next = (await client.query('SELECT COALESCE(MAX(revision_number), 0) + 1 AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2', [workspaceId, itemId])).rows[0].n;
    const revision = (await client.query(`INSERT INTO content_revisions
      (workspace_id, content_item_id, revision_number, body, content_sha256, created_by)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, revision_number, content_sha256`, [workspaceId, itemId, next, body, digest(body), actor.user_id])).rows[0];
    const revoked = (await client.query(`UPDATE approvals a SET status = 'revoked', revoked_at = now()
      FROM content_revisions r WHERE a.workspace_id = $1 AND r.workspace_id = a.workspace_id
        AND r.id = a.revision_id AND r.content_item_id = $2 AND a.status = 'approved'
      RETURNING a.id, a.revision_id, a.account_id`, [workspaceId, itemId])).rows;
    for (const approval of revoked) {
      await client.query(`INSERT INTO approval_events
        (workspace_id, approval_id, revision_id, account_id, actor_id, event, reason)
        VALUES ($1, $2, $3, $4, $5, 'revoked', 'new_revision')`, [workspaceId, approval.id, approval.revision_id, approval.account_id, actor.user_id]);
    }
    if (revoked.length) {
      await client.query(`UPDATE publish_jobs SET status = 'cancelled', updated_at = now()
        WHERE workspace_id = $1 AND approval_id = ANY($2::uuid[]) AND status = 'pending'`, [workspaceId, revoked.map((approval) => approval.id)]);
    }
    await client.query('COMMIT');
    return revision;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function approveContentRevision(client, token, workspaceId, revisionId, accountId) {
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder', 'approver']);
    const revisionResult = await client.query(`SELECT r.id, r.content_item_id, r.revision_number, r.body, r.content_sha256
      FROM content_revisions r JOIN content_items i ON i.workspace_id = r.workspace_id AND i.id = r.content_item_id
      WHERE r.workspace_id = $1 AND r.id = $2 FOR UPDATE OF i`, [workspaceId, revisionId]);
    if (!revisionResult.rowCount) throw new Error('Revision unavailable');
    const revision = revisionResult.rows[0];
    const latest = (await client.query('SELECT MAX(revision_number) AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2', [workspaceId, revision.content_item_id])).rows[0].n;
    if (revision.revision_number !== latest || digest(revision.body) !== revision.content_sha256) throw new Error('Revision is not current');
    const account = await client.query("SELECT id FROM social_accounts WHERE workspace_id = $1 AND id = $2 AND status = 'connected'", [workspaceId, accountId]);
    if (!account.rowCount) throw new Error('Account unavailable');
    const approval = (await client.query(`INSERT INTO approvals (workspace_id, revision_id, account_id, approved_by)
      VALUES ($1, $2, $3, $4) RETURNING id`, [workspaceId, revisionId, accountId, actor.user_id])).rows[0];
    await client.query(`INSERT INTO approval_events
      (workspace_id, approval_id, revision_id, account_id, actor_id, event, reason)
      VALUES ($1, $2, $3, $4, $5, 'approved', 'manual_approval')`, [workspaceId, approval.id, revisionId, accountId, actor.user_id]);
    await client.query('COMMIT');
    return { approvalId: approval.id, revisionId, accountId };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function revokeContentApproval(client, token, workspaceId, approvalId) {
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder', 'approver']);
    const approvalResult = await client.query("SELECT id, revision_id, account_id FROM approvals WHERE workspace_id = $1 AND id = $2 AND status = 'approved' FOR UPDATE", [workspaceId, approvalId]);
    if (!approvalResult.rowCount) throw new Error('Approval unavailable');
    const approval = approvalResult.rows[0];
    await client.query("UPDATE approvals SET status = 'revoked', revoked_at = now() WHERE workspace_id = $1 AND id = $2", [workspaceId, approvalId]);
    await client.query(`INSERT INTO approval_events
      (workspace_id, approval_id, revision_id, account_id, actor_id, event, reason)
      VALUES ($1, $2, $3, $4, $5, 'revoked', 'manual_revocation')`, [workspaceId, approvalId, approval.revision_id, approval.account_id, actor.user_id]);
    await client.query("UPDATE publish_jobs SET status = 'cancelled', updated_at = now() WHERE workspace_id = $1 AND approval_id = $2 AND status = 'pending'", [workspaceId, approvalId]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

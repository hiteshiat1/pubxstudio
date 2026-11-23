import { createHash } from 'node:crypto';
import { createCredentialStore } from '../../db/credentials.mjs';
import { publishXPost, validateXText } from './x-posts.mjs';

const digest = (text) => createHash('sha256').update(text).digest('hex');

export function parseXThread(body) {
  if (typeof body !== 'string' || !body.trim()) throw new Error('Invalid X thread');
  let parts = [body];
  if (body.trimStart().startsWith('{')) {
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new Error('Invalid X thread'); }
    if (!parsed || !Array.isArray(parsed.posts) || Object.keys(parsed).length !== 1) throw new Error('Invalid X thread');
    parts = parsed.posts;
  }
  if (!parts.length || parts.length > 25) throw new Error('Invalid X thread');
  for (const part of parts) validateXText(part);
  return parts;
}

async function loadJob(client, jobId, lock = false) {
  const result = await client.query(`SELECT j.id, j.workspace_id, j.account_id, j.status, j.lease_until,
    r.body, r.content_sha256, a.status AS approval_status,
    sa.provider, sa.provider_account_id, sa.status AS account_status
    FROM publish_jobs j
    JOIN approvals a ON a.workspace_id = j.workspace_id AND a.id = j.approval_id
    JOIN content_revisions r ON r.workspace_id = j.workspace_id AND r.id = j.revision_id
    JOIN social_accounts sa ON sa.workspace_id = j.workspace_id AND sa.id = j.account_id
    WHERE j.id = $1 ${lock ? 'FOR UPDATE OF j' : ''}`, [jobId]);
  const job = result.rows[0];
  if (!job || job.status !== 'sending' || new Date(job.lease_until) <= new Date() ||
      job.approval_status !== 'approved' || job.provider !== 'x' || job.account_status !== 'connected' ||
      digest(job.body) !== job.content_sha256) throw new Error('X job unavailable');
  return job;
}

export async function prepareXThread(client, jobId) {
  await client.query('BEGIN');
  try {
    const job = await loadJob(client, jobId, true);
    const parts = parseXThread(job.body);
    for (let index = 0; index < parts.length; index++) {
      await client.query(`INSERT INTO x_thread_parts (workspace_id, job_id, part_number, text_sha256)
        VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [job.workspace_id, jobId, index + 1, digest(parts[index])]);
    }
    const rows = (await client.query('SELECT part_number, text_sha256 FROM x_thread_parts WHERE workspace_id = $1 AND job_id = $2 ORDER BY part_number',
      [job.workspace_id, jobId])).rows;
    if (rows.length !== parts.length || rows.some((row, index) => row.part_number !== index + 1 || row.text_sha256 !== digest(parts[index]))) {
      throw new Error('X thread changed');
    }
    await client.query('COMMIT');
    return { workspaceId: job.workspace_id, accountId: job.account_id, providerAccountId: job.provider_account_id, parts };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function sendXThreadJob({ client, jobId, actorId, env = process.env, fetchImpl = fetch }) {
  const thread = await prepareXThread(client, jobId);
  const { accessToken } = await createCredentialStore(client, env).read({ workspaceId: thread.workspaceId,
    accountId: thread.accountId, actorId });
  while (true) {
    await client.query('BEGIN');
    let next;
    try {
      await loadJob(client, jobId, true);
      const rows = (await client.query(`SELECT part_number, status, provider_post_id
        FROM x_thread_parts WHERE workspace_id = $1 AND job_id = $2 ORDER BY part_number FOR UPDATE`,
      [thread.workspaceId, jobId])).rows;
      const pendingIndex = rows.findIndex((row) => row.status !== 'published');
      if (pendingIndex === -1) {
        await client.query('COMMIT');
        const lastId = rows.at(-1).provider_post_id;
        return { providerPostId: lastId, providerUrl: `https://x.com/i/web/status/${lastId}` };
      }
      if (rows[pendingIndex].status !== 'pending' || rows.slice(pendingIndex + 1).some((row) => row.status !== 'pending')) {
        throw new Error('X thread needs reconciliation');
      }
      next = { number: rows[pendingIndex].part_number, text: thread.parts[pendingIndex],
        parentId: pendingIndex ? rows[pendingIndex - 1].provider_post_id : null };
      await client.query(`UPDATE x_thread_parts SET status = 'sending', reply_to_post_id = $3, started_at = now()
        WHERE workspace_id = $1 AND job_id = $2 AND part_number = $4`,
      [thread.workspaceId, jobId, next.parentId, next.number]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    let post;
    try {
      post = await publishXPost({ text: next.text, accessToken, replyToId: next.parentId,
        accountId: thread.providerAccountId, fetchImpl });
    } catch (error) {
      const status = error?.outcome === 'uncertain' ? 'uncertain' : 'failed';
      await client.query(`UPDATE x_thread_parts SET status = $4, error_code = $5, finished_at = now()
        WHERE workspace_id = $1 AND job_id = $2 AND part_number = $3 AND status = 'sending'`,
      [thread.workspaceId, jobId, next.number, status, error?.code || 'provider_outcome_unknown']);
      throw error;
    }
    const saved = await client.query(`UPDATE x_thread_parts SET status = 'published', provider_post_id = $4,
      finished_at = now() WHERE workspace_id = $1 AND job_id = $2 AND part_number = $3 AND status = 'sending' RETURNING part_number`,
    [thread.workspaceId, jobId, next.number, post.providerPostId]);
    if (!saved.rowCount) throw new Error('X post accepted but result needs reconciliation');
  }
}

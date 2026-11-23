import { createHash } from 'node:crypto';
import { requireMembership } from './access.mjs';

function validSchedule(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19) ? date : null;
}

export async function schedulePublishJob(client, token, { workspaceId, approvalId, scheduledAt, idempotencyKey }) {
  const schedule = validSchedule(scheduledAt);
  if (!schedule || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) {
    throw new Error('Invalid schedule');
  }
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder', 'operator']);
    const approval = await client.query(`SELECT a.id, a.revision_id, a.account_id, r.body, r.content_sha256,
      r.content_item_id, r.revision_number
      FROM approvals a JOIN content_revisions r ON r.workspace_id = a.workspace_id AND r.id = a.revision_id
      JOIN content_items i ON i.workspace_id = r.workspace_id AND i.id = r.content_item_id
      JOIN social_accounts sa ON sa.workspace_id = a.workspace_id AND sa.id = a.account_id
      WHERE a.workspace_id = $1 AND a.id = $2 AND a.status = 'approved' AND sa.status = 'connected'
      FOR UPDATE OF i`, [workspaceId, approvalId]);
    if (!approval.rowCount) throw new Error('Approval unavailable');
    const row = approval.rows[0];
    const latest = await client.query('SELECT MAX(revision_number) AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2', [workspaceId, row.content_item_id]);
    if (row.revision_number !== latest.rows[0].n ||
        createHash('sha256').update(row.body).digest('hex') !== row.content_sha256) throw new Error('Approval unavailable');
    const result = await client.query(`INSERT INTO publish_jobs
      (workspace_id, approval_id, revision_id, account_id, requested_by, idempotency_key, scheduled_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (workspace_id, idempotency_key) DO NOTHING RETURNING id, status, scheduled_at`,
    [workspaceId, approvalId, row.revision_id, row.account_id, actor.user_id, idempotencyKey, schedule]);
    let job = result.rows[0];
    if (!job) {
      const existing = await client.query(`SELECT id, status, scheduled_at FROM publish_jobs
        WHERE workspace_id = $1 AND idempotency_key = $2 AND approval_id = $3 AND revision_id = $4
          AND account_id = $5 AND requested_by = $6 AND scheduled_at = $7`,
      [workspaceId, idempotencyKey, approvalId, row.revision_id, row.account_id, actor.user_id, schedule]);
      if (!existing.rowCount) throw new Error('Idempotency key conflict');
      job = existing.rows[0];
    }
    await client.query('COMMIT');
    return { jobId: job.id, status: job.status, scheduledAt: job.scheduled_at };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function cancelPublishJob(client, token, workspaceId, jobId) {
  await client.query('BEGIN');
  try {
    await requireMembership(client, token, workspaceId, ['founder', 'operator']);
    const result = await client.query(`UPDATE publish_jobs SET status = 'cancelled', updated_at = now()
      WHERE workspace_id = $1 AND id = $2 AND status = 'pending' RETURNING id`, [workspaceId, jobId]);
    if (!result.rowCount) throw new Error('Pending job unavailable');
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function listPublishJobs(client, token, workspaceId) {
  await requireMembership(client, token, workspaceId);
  const result = await client.query(`SELECT j.id, j.status, j.scheduled_at, j.next_attempt_at, j.updated_at,
    j.account_id, j.revision_id, j.approval_id
    FROM publish_jobs j WHERE j.workspace_id = $1
    ORDER BY j.scheduled_at DESC, j.id DESC LIMIT 100`, [workspaceId]);
  return result.rows;
}

export async function authorizePublishJob(client, token, { workspaceId, jobId, expectedAccountId,
  expectedContentSha256, confirmLivePost, confirmXCost }) {
  if (confirmLivePost !== true || !/^[0-9a-f]{64}$/.test(expectedContentSha256 || '')) {
    throw new Error('Live authorization requires exact content confirmation');
  }
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder']);
    const result = await client.query(`SELECT j.id, j.status, j.account_id, r.body, r.content_sha256,
      r.revision_number, r.content_item_id, a.status AS approval_status,
      sa.provider, sa.status AS account_status, sa.token_expires_at
      FROM publish_jobs j
      JOIN approvals a ON a.workspace_id = j.workspace_id AND a.id = j.approval_id
      JOIN content_revisions r ON r.workspace_id = j.workspace_id AND r.id = j.revision_id
      JOIN content_items i ON i.workspace_id = r.workspace_id AND i.id = r.content_item_id
      JOIN social_accounts sa ON sa.workspace_id = j.workspace_id AND sa.id = j.account_id
      WHERE j.workspace_id = $1 AND j.id = $2 FOR UPDATE OF i, j`, [workspaceId, jobId]);
    const job = result.rows[0];
    if (!job || job.status !== 'pending' || job.approval_status !== 'approved' ||
        job.account_status !== 'connected' || job.account_id !== expectedAccountId ||
        job.content_sha256 !== expectedContentSha256 ||
        createHash('sha256').update(job.body).digest('hex') !== job.content_sha256 ||
        (job.token_expires_at && new Date(job.token_expires_at) <= new Date()) ||
        (job.provider === 'x' && confirmXCost !== true)) throw new Error('Live authorization unavailable');
    const latest = await client.query('SELECT MAX(revision_number) AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2',
      [workspaceId, job.content_item_id]);
    if (latest.rows[0].n !== job.revision_number) throw new Error('Live authorization unavailable');
    await client.query(`UPDATE publish_jobs SET live_authorized_by = $3, live_authorized_at = now(), updated_at = now()
      WHERE workspace_id = $1 AND id = $2`, [workspaceId, jobId, actor.user_id]);
    await client.query('COMMIT');
    return { jobId, accountId: job.account_id, contentSha256: job.content_sha256 };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function claimDuePublishJob(client, { leaseSeconds = 120, allowedProviders = ['linkedin', 'x'] } = {}) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900) throw new Error('Invalid lease');
  if (!Array.isArray(allowedProviders) || !allowedProviders.every((provider) => ['linkedin', 'x'].includes(provider))) {
    throw new Error('Invalid providers');
  }
  await client.query('BEGIN');
  try {
    const candidate = await client.query(`SELECT j.id, j.workspace_id, j.approval_id, j.revision_id, j.account_id,
      r.body, r.content_sha256, r.content_item_id, r.revision_number, sa.provider
      FROM publish_jobs j
      JOIN approvals a ON a.workspace_id = j.workspace_id AND a.id = j.approval_id
      JOIN content_revisions r ON r.workspace_id = j.workspace_id AND r.id = j.revision_id
      JOIN social_accounts sa ON sa.workspace_id = j.workspace_id AND sa.id = j.account_id
      WHERE j.status = 'pending' AND COALESCE(j.next_attempt_at, j.scheduled_at) <= now()
        AND j.live_authorized_at IS NOT NULL
        AND sa.provider = ANY($1::text[]) AND a.status = 'approved'
        AND sa.status = 'connected' AND sa.credential_ciphertext IS NOT NULL
        AND (sa.token_expires_at IS NULL OR sa.token_expires_at > now())
      ORDER BY COALESCE(j.next_attempt_at, j.scheduled_at), j.created_at, j.id
      FOR UPDATE OF j SKIP LOCKED LIMIT 1`, [allowedProviders]);
    if (!candidate.rowCount) { await client.query('COMMIT'); return null; }
    const job = candidate.rows[0];
    const latest = await client.query('SELECT MAX(revision_number) AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2', [job.workspace_id, job.content_item_id]);
    if (job.revision_number !== latest.rows[0].n ||
        createHash('sha256').update(job.body).digest('hex') !== job.content_sha256) {
      await client.query("UPDATE publish_jobs SET status = 'cancelled', updated_at = now() WHERE id = $1", [job.id]);
      await client.query('COMMIT');
      return null;
    }
    await client.query(`UPDATE publish_jobs SET status = 'sending', lease_until = now() + ($2::int * interval '1 second'),
      updated_at = now() WHERE id = $1`, [job.id, leaseSeconds]);
    await client.query(`INSERT INTO publish_attempts (workspace_id, job_id, attempt_number, status)
      SELECT $1, $2, COALESCE(MAX(attempt_number), 0) + 1, 'sending'
      FROM publish_attempts WHERE workspace_id = $1 AND job_id = $2`, [job.workspace_id, job.id]);
    await client.query('COMMIT');
    return { jobId: job.id, workspaceId: job.workspace_id, approvalId: job.approval_id,
      revisionId: job.revision_id, accountId: job.account_id, body: job.body, provider: job.provider };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function recoverExpiredPublishLeases(client) {
  await client.query('BEGIN');
  try {
    const jobs = await client.query(`UPDATE publish_jobs SET status = 'uncertain', lease_until = NULL,
      updated_at = now() WHERE status = 'sending' AND lease_until < now() RETURNING id, workspace_id`);
    for (const job of jobs.rows) {
      await client.query(`UPDATE publish_attempts SET status = 'uncertain', finished_at = now(), error_code = 'lease_expired'
        WHERE workspace_id = $1 AND job_id = $2 AND status = 'sending'`, [job.workspace_id, job.id]);
      await client.query(`UPDATE x_thread_parts SET status = 'uncertain', finished_at = now(), error_code = 'lease_expired'
        WHERE workspace_id = $1 AND job_id = $2 AND status = 'sending'`, [job.workspace_id, job.id]);
    }
    await client.query('COMMIT');
    return jobs.rowCount;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function reconcilePublishJob(client, token, { workspaceId, jobId, action, providerPostId = null,
  evidence }) {
  if (!['confirmed_published', 'confirmed_absent'].includes(action) ||
      typeof evidence !== 'string' || evidence.trim().length < 12 || evidence.length > 1000) {
    throw new Error('Invalid reconciliation');
  }
  await client.query('BEGIN');
  try {
    const actor = await requireMembership(client, token, workspaceId, ['founder']);
    const result = await client.query(`SELECT j.id, j.status, j.live_authorized_at, j.revision_id,
      a.status AS approval_status, sa.status AS account_status, sa.provider, sa.token_expires_at,
      r.content_item_id, r.revision_number
      FROM publish_jobs j
      JOIN approvals a ON a.workspace_id = j.workspace_id AND a.id = j.approval_id
      JOIN social_accounts sa ON sa.workspace_id = j.workspace_id AND sa.id = j.account_id
      JOIN content_revisions r ON r.workspace_id = j.workspace_id AND r.id = j.revision_id
      WHERE j.workspace_id = $1 AND j.id = $2 FOR UPDATE OF j`, [workspaceId, jobId]);
    const job = result.rows[0];
    if (!job || job.status !== 'uncertain') throw new Error('Uncertain job unavailable');
    const validId = job.provider === 'x' ? /^\d{1,19}$/.test(providerPostId || '')
      : /^urn:li:(share|ugcPost):[A-Za-z0-9_-]+$/.test(providerPostId || '');
    if (action === 'confirmed_published' && !validId) throw new Error('Invalid provider post ID');
    if (action === 'confirmed_absent' && providerPostId != null) throw new Error('Invalid reconciliation');
    const parts = job.provider === 'x'
      ? (await client.query(`SELECT part_number, status, provider_post_id FROM x_thread_parts
          WHERE workspace_id = $1 AND job_id = $2 ORDER BY part_number FOR UPDATE`, [workspaceId, jobId])).rows
      : [];
    const uncertainPart = parts.find((part) => part.status === 'uncertain' || part.status === 'sending');
    if (job.provider === 'x' && !uncertainPart &&
        !(action === 'confirmed_published' && parts.length && parts.every((part) => part.status === 'published') &&
          parts.at(-1).provider_post_id === providerPostId)) throw new Error('X part unavailable');
    if (uncertainPart) {
      await client.query(`UPDATE x_thread_parts SET status = $4, provider_post_id = $5,
        error_code = NULL, finished_at = now() WHERE workspace_id = $1 AND job_id = $2 AND part_number = $3`,
      [workspaceId, jobId, uncertainPart.part_number,
        action === 'confirmed_published' ? 'published' : 'pending', providerPostId]);
    }
    const hasRemaining = action === 'confirmed_absent' ||
      (job.provider === 'x' && parts.some((part) => part.part_number > uncertainPart?.part_number && part.status === 'pending'));
    if (hasRemaining) {
      const latest = await client.query('SELECT MAX(revision_number) AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2',
        [workspaceId, job.content_item_id]);
      if (job.approval_status !== 'approved' || job.account_status !== 'connected' ||
          !job.live_authorized_at || latest.rows[0].n !== job.revision_number ||
          (job.token_expires_at && new Date(job.token_expires_at) <= new Date())) {
        throw new Error('Cannot resume this job');
      }
    }
    const nextStatus = hasRemaining ? 'pending' : 'published';
    await client.query(`UPDATE publish_jobs SET status = $3, lease_until = NULL,
      next_attempt_at = CASE WHEN $3 = 'pending' THEN now() ELSE NULL END,
      updated_at = now() WHERE workspace_id = $1 AND id = $2`, [workspaceId, jobId, nextStatus]);
    await client.query(`INSERT INTO reconciliation_events
      (workspace_id, job_id, actor_id, action, provider_post_id, evidence)
      VALUES ($1, $2, $3, $4, $5, $6)`, [workspaceId, jobId, actor.user_id, action, providerPostId, evidence.trim()]);
    await client.query('COMMIT');
    return { jobId, status: nextStatus };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function finishPublishJob(client, { jobId, outcome, providerPostId = null, providerUrl = null,
  errorCode = null, retryAfterSeconds = null }) {
  if (!['published', 'failed', 'uncertain'].includes(outcome) ||
      (outcome === 'published' && (typeof providerPostId !== 'string' || !providerPostId.trim())) ||
      (providerUrl != null && (!/^https:\/\//.test(providerUrl) || providerUrl.length > 2000)) ||
      (errorCode != null && !/^[a-zA-Z0-9_-]{1,64}$/.test(errorCode)) ||
      (retryAfterSeconds != null && (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 0))) {
    throw new Error('Invalid outcome');
  }
  await client.query('BEGIN');
  try {
    const job = await client.query(`SELECT workspace_id FROM publish_jobs
      WHERE id = $1 AND status = 'sending' AND lease_until > now() FOR UPDATE`, [jobId]);
    if (!job.rowCount) throw new Error('Sending job unavailable');
    const attempts = await client.query('SELECT COUNT(*)::int AS n FROM publish_attempts WHERE workspace_id = $1 AND job_id = $2',
      [job.rows[0].workspace_id, jobId]);
    const retry = outcome === 'failed' && errorCode === 'rate_limited' && attempts.rows[0].n < 3 &&
      (retryAfterSeconds == null || retryAfterSeconds <= 604800);
    const retryDelay = retry ? Math.max(60 * 2 ** (attempts.rows[0].n - 1), retryAfterSeconds || 0) : null;
    await client.query(`UPDATE publish_jobs SET status = $2, lease_until = NULL,
      next_attempt_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + ($3::int * interval '1 second') END,
      updated_at = now() WHERE id = $1`, [jobId, retry ? 'pending' : outcome, retryDelay]);
    const attempt = await client.query(`UPDATE publish_attempts SET status = $3, provider_post_id = $4,
      provider_url = $5, error_code = $6, finished_at = now()
      WHERE workspace_id = $1 AND job_id = $2 AND status = 'sending' RETURNING id`,
    [job.rows[0].workspace_id, jobId, outcome, providerPostId, providerUrl, errorCode]);
    if (!attempt.rowCount) throw new Error('Sending attempt unavailable');
    await client.query('COMMIT');
    return { jobStatus: retry ? 'pending' : outcome, retryAfterSeconds: retryDelay };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

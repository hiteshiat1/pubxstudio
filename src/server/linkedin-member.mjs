import { createHash } from 'node:crypto';
import { createCredentialStore } from '../../db/credentials.mjs';
import { createLinkedInTextPost } from './linkedin-posts.mjs';

export async function publishLinkedInMemberJob({ client, jobId, actorId, env = process.env, fetchImpl = fetch }) {
  await client.query('BEGIN');
  try {
    const result = await client.query(`SELECT j.id, j.workspace_id, j.account_id, j.status, j.lease_until,
      a.status AS approval_status, r.body, r.content_sha256, r.revision_number, r.content_item_id,
      sa.status AS account_status, sa.provider
      FROM publish_jobs j
      JOIN approvals a ON a.workspace_id = j.workspace_id AND a.id = j.approval_id
      JOIN content_revisions r ON r.workspace_id = j.workspace_id AND r.id = j.revision_id
      JOIN content_items i ON i.workspace_id = r.workspace_id AND i.id = r.content_item_id
      JOIN social_accounts sa ON sa.workspace_id = j.workspace_id AND sa.id = j.account_id
      WHERE j.id = $1 FOR UPDATE OF i, a, sa, j`, [jobId]);
    const job = result.rows[0];
    if (!job || job.status !== 'sending' || new Date(job.lease_until) <= new Date() ||
        job.approval_status !== 'approved' || job.account_status !== 'connected' || job.provider !== 'linkedin' ||
        createHash('sha256').update(job.body).digest('hex') !== job.content_sha256) {
      throw new Error('LinkedIn job unavailable');
    }
    const latest = await client.query('SELECT MAX(revision_number) AS n FROM content_revisions WHERE workspace_id = $1 AND content_item_id = $2',
      [job.workspace_id, job.content_item_id]);
    if (latest.rows[0].n !== job.revision_number) throw new Error('LinkedIn approval is stale');
    const { accessToken } = await createCredentialStore(client, env).read({ workspaceId: job.workspace_id,
      accountId: job.account_id, actorId });
    const profileResponse = await fetchImpl('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, cache: 'no-store',
    });
    if (!profileResponse.ok) throw new Error('LinkedIn member identity unavailable');
    const profile = await profileResponse.json();
    if (typeof profile.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(profile.id)) {
      throw new Error('LinkedIn member identity invalid');
    }
    const post = await createLinkedInTextPost({ accessToken, authorUrn: `urn:li:person:${profile.id}`,
      text: job.body, fetchImpl });
    await client.query('COMMIT');
    return { providerPostId: post.postId, providerUrl: null };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

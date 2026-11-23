import { claimDuePublishJob, finishPublishJob, recoverExpiredPublishLeases } from '../../db/queue.mjs';
import { publishLinkedInMemberJob } from './linkedin-member.mjs';
import { sendXThreadJob } from './x-thread.mjs';

function enabledProviders(env) {
  if (env.PUBX_PUBLISHING_ENABLED !== '1') return [];
  return [env.PUBX_LINKEDIN_POSTING_ENABLED === '1' ? 'linkedin' : null,
    env.PUBX_X_POSTING_ENABLED === '1' ? 'x' : null].filter(Boolean);
}

function classify(error) {
  if (error?.outcome === 'uncertain' || error?.code === 'OUTCOME_UNCERTAIN') {
    return { outcome: 'uncertain', errorCode: 'provider_outcome_unknown' };
  }
  if (error?.code === 'RATE_LIMITED' || error?.code === 'rate_limited') {
    return { outcome: 'failed', errorCode: 'rate_limited' };
  }
  if (error?.code === 'AUTHORIZATION_FAILED') return { outcome: 'failed', errorCode: 'authorization_failed' };
  if (error?.code === 'PROVIDER_REJECTED' || error?.code === 'provider_rejected') {
    return { outcome: 'failed', errorCode: 'provider_rejected' };
  }
  // Unknown errors can occur after a provider accepted a request. Never auto-retry them.
  return { outcome: 'uncertain', errorCode: 'provider_outcome_unknown' };
}

export async function runOnePublishJob({ client, env = process.env, fetchImpl = fetch }) {
  await recoverExpiredPublishLeases(client);
  const providers = enabledProviders(env);
  if (!providers.length) return { status: 'disabled' };
  const job = await claimDuePublishJob(client, { allowedProviders: providers });
  if (!job) return { status: 'idle' };
  try {
    const founder = await client.query(`SELECT user_id FROM memberships WHERE workspace_id = $1 AND role = 'founder'
      ORDER BY created_at, user_id LIMIT 1`, [job.workspaceId]);
    if (!founder.rowCount) throw new Error('No founder');
    const actorId = founder.rows[0].user_id;
    const result = job.provider === 'linkedin'
      ? await publishLinkedInMemberJob({ client, jobId: job.jobId, actorId, env, fetchImpl })
      : await sendXThreadJob({ client, jobId: job.jobId, actorId, env, fetchImpl });
    await finishPublishJob(client, { jobId: job.jobId, outcome: 'published',
      providerPostId: result.providerPostId, providerUrl: result.providerUrl });
    return { status: 'published', jobId: job.jobId };
  } catch (error) {
    const { outcome, errorCode } = classify(error);
    await finishPublishJob(client, { jobId: job.jobId, outcome, errorCode }).catch(() => {});
    return { status: outcome, jobId: job.jobId };
  }
}

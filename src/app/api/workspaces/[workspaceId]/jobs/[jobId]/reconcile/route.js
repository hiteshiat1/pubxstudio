import { databasePool } from '../../../../../../../../db/pool.mjs';
import { reconcilePublishJob } from '../../../../../../../../db/queue.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, jobId } = await params;
  const client = await databasePool().connect();
  try {
    const input = await request.json();
    const result = await reconcilePublishJob(client, request.cookies.get('pubx_session')?.value,
      { workspaceId, jobId, action: input.action, providerPostId: input.providerPostId,
        evidence: input.evidence });
    return Response.json({ reconciliation: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Reconciliation unavailable' }, { status: 403 });
  } finally { client.release(); }
}

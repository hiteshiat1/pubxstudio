import { databasePool } from '../../../../../../../../db/pool.mjs';
import { authorizePublishJob } from '../../../../../../../../db/queue.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, jobId } = await params;
  try {
    const input = await request.json();
    const result = await authorizePublishJob(databasePool(), request.cookies.get('pubx_session')?.value,
      { workspaceId, jobId, expectedAccountId: input.expectedAccountId,
        expectedContentSha256: input.expectedContentSha256,
        confirmLivePost: input.confirmLivePost, confirmXCost: input.confirmXCost });
    return Response.json({ authorization: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Live authorization unavailable' }, { status: 403 });
  }
}

import { databasePool } from '../../../../../../../db/pool.mjs';
import { cancelPublishJob } from '../../../../../../../db/queue.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, jobId } = await params;
  try {
    await cancelPublishJob(databasePool(), request.cookies.get('pubx_session')?.value, workspaceId, jobId);
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: 'Pending job unavailable' }, { status: 404 });
  }
}

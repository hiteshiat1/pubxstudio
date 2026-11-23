import { databasePool } from '../../../../../../db/pool.mjs';
import { listPublishJobs, schedulePublishJob } from '../../../../../../db/queue.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId } = await params;
  try {
    const input = await request.json();
    const job = await schedulePublishJob(databasePool(), request.cookies.get('pubx_session')?.value,
      { workspaceId, approvalId: input.approvalId, scheduledAt: input.scheduledAt,
        idempotencyKey: input.idempotencyKey });
    return Response.json({ job }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Job unavailable or invalid' }, { status: 400 });
  }
}

export async function GET(request, { params }) {
  const { workspaceId } = await params;
  try {
    const jobs = await listPublishJobs(databasePool(), request.cookies.get('pubx_session')?.value, workspaceId);
    return Response.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

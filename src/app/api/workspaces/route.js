import { databasePool } from '../../../../db/pool.mjs';
import { listWorkspaces } from '../../../../db/access.mjs';

export async function GET(request) {
  try {
    const workspaces = await listWorkspaces(databasePool(), request.cookies.get('pubx_session')?.value);
    return Response.json({ workspaces }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}

import { databasePool } from '../../../../../../../db/pool.mjs';
import { setMemberRole } from '../../../../../../../db/access.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function PATCH(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, userId } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  const client = await databasePool().connect();
  try {
    const change = await setMemberRole(client, request.cookies.get('pubx_session')?.value, workspaceId, userId, body.role);
    return Response.json({ change });
  } catch { return Response.json({ error: 'Forbidden or invalid role' }, { status: 403 }); }
  finally { client.release(); }
}

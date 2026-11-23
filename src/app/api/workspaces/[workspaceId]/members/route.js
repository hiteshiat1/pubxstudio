import { databasePool } from '../../../../../../db/pool.mjs';
import { addMember } from '../../../../../../db/access.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  const client = await databasePool().connect();
  try {
    const member = await addMember(client, request.cookies.get('pubx_session')?.value, workspaceId, body.externalSubject, body.role);
    return Response.json({ member }, { status: 201 });
  } catch { return Response.json({ error: 'Forbidden or invalid member' }, { status: 403 }); }
  finally { client.release(); }
}

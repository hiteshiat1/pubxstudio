import { databasePool } from '../../../../../../db/pool.mjs';
import { createContentItem } from '../../../../../../db/content.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid request' }, { status: 400 }); }
  const client = await databasePool().connect();
  try {
    const result = await createContentItem(client, request.cookies.get('pubx_session')?.value, workspaceId, body.title, body.body);
    return Response.json(result, { status: 201 });
  } catch { return Response.json({ error: 'Content unavailable or invalid' }, { status: 403 }); }
  finally { client.release(); }
}

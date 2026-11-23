import { databasePool } from '../../../../../../../../db/pool.mjs';
import { appOrigin } from '@/server/github-login.mjs';
import { refreshXCredential } from '@/server/x-oauth.mjs';

export async function POST(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, accountId } = await params;
  const client = await databasePool().connect();
  try {
    const result = await refreshXCredential({ client,
      sessionToken: request.cookies.get('pubx_session')?.value, workspaceId, accountId });
    return Response.json({ accountId: result.accountId, expiresAt: result.expiresAt },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'X refresh unavailable' }, { status: 403 });
  } finally { client.release(); }
}

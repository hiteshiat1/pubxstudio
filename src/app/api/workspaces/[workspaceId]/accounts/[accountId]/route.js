import { databasePool } from '../../../../../../../db/pool.mjs';
import { getSocialAccount } from '../../../../../../../db/access.mjs';

export async function GET(request, { params }) {
  const { workspaceId, accountId } = await params;
  try {
    const account = await getSocialAccount(databasePool(), request.cookies.get('pubx_session')?.value, workspaceId, accountId);
    return Response.json({ account }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Account unavailable' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}

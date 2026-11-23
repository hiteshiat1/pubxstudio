import { databasePool } from '../../../../../../db/pool.mjs';
import { listSocialAccounts } from '../../../../../../db/access.mjs';

export async function GET(request, { params }) {
  const { workspaceId } = await params;
  try {
    const accounts = await listSocialAccounts(databasePool(), request.cookies.get('pubx_session')?.value, workspaceId);
    return Response.json({ accounts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

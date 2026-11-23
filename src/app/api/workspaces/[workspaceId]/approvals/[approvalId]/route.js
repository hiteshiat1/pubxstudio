import { databasePool } from '../../../../../../../db/pool.mjs';
import { revokeContentApproval } from '../../../../../../../db/content.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, approvalId } = await params;
  const client = await databasePool().connect();
  try {
    await revokeContentApproval(client, request.cookies.get('pubx_session')?.value, workspaceId, approvalId);
    return new Response(null, { status: 204 });
  } catch { return Response.json({ error: 'Approval unavailable' }, { status: 403 }); }
  finally { client.release(); }
}

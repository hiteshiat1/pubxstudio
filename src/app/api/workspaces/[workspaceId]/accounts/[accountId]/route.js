import { databasePool } from '../../../../../../../db/pool.mjs';
import { getSocialAccount } from '../../../../../../../db/access.mjs';
import { createCredentialStore } from '../../../../../../../db/credentials.mjs';
import { requireMembership } from '../../../../../../../db/access.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function GET(request, { params }) {
  const { workspaceId, accountId } = await params;
  try {
    const account = await getSocialAccount(databasePool(), request.cookies.get('pubx_session')?.value, workspaceId, accountId);
    return Response.json({ account }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Account unavailable' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request, { params }) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { workspaceId, accountId } = await params;
  const client = await databasePool().connect();
  try {
    const actor = await requireMembership(client, request.cookies.get('pubx_session')?.value, workspaceId, ['founder']);
    await createCredentialStore(client).revoke({ workspaceId, accountId, actorId: actor.user_id });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: 'Account unavailable' }, { status: 404 });
  } finally { client.release(); }
}

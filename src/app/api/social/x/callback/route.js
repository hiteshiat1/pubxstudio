import { NextResponse } from 'next/server';
import { databasePool } from '../../../../../../db/pool.mjs';
import { appOrigin } from '@/server/github-login.mjs';
import { completeXOAuth } from '@/server/x-oauth.mjs';

export async function GET(request) {
  const origin = appOrigin();
  const client = await databasePool().connect();
  try {
    const { workspaceId } = await completeXOAuth({ client,
      sessionToken: request.cookies.get('pubx_session')?.value,
      state: request.nextUrl.searchParams.get('state'),
      code: request.nextUrl.searchParams.get('code'),
      denied: request.nextUrl.searchParams.has('error') });
    return NextResponse.redirect(`${origin}/studio?x=connected&workspaceId=${encodeURIComponent(workspaceId)}`);
  } catch {
    return NextResponse.redirect(`${origin}/studio?x=failed`);
  } finally { client.release(); }
}

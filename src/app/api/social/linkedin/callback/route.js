import { NextResponse } from 'next/server';
import { databasePool } from '../../../../../../db/pool.mjs';
import { appOrigin } from '@/server/github-login.mjs';
import { completeLinkedInOAuth } from '@/server/linkedin-oauth.mjs';

export async function GET(request) {
  const origin = appOrigin();
  const client = await databasePool().connect();
  try {
    const { workspaceId } = await completeLinkedInOAuth({ client,
      sessionToken: request.cookies.get('pubx_session')?.value,
      state: request.nextUrl.searchParams.get('state'),
      code: request.nextUrl.searchParams.get('code'),
      denied: request.nextUrl.searchParams.has('error') });
    return NextResponse.redirect(`${origin}/studio?linkedin=connected&workspaceId=${encodeURIComponent(workspaceId)}`);
  } catch {
    return NextResponse.redirect(`${origin}/studio?linkedin=failed`);
  } finally { client.release(); }
}

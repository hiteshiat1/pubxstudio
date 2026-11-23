import { NextResponse } from 'next/server';
import { databasePool } from '../../../../../../db/pool.mjs';
import { startLinkedInOAuth } from '@/server/linkedin-oauth.mjs';

export async function GET(request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403 });
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  try {
    const url = await startLinkedInOAuth({ client: databasePool(),
      sessionToken: request.cookies.get('pubx_session')?.value, workspaceId });
    return NextResponse.redirect(url);
  } catch {
    return new Response('LinkedIn connection unavailable', { status: 403 });
  }
}

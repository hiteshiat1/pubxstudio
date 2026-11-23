import { NextResponse } from 'next/server';
import { databasePool } from '../../../../../../db/pool.mjs';
import { startXOAuth } from '@/server/x-oauth.mjs';

export async function GET(request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response('Forbidden', { status: 403 });
  try {
    const url = await startXOAuth({ client: databasePool(),
      sessionToken: request.cookies.get('pubx_session')?.value,
      workspaceId: request.nextUrl.searchParams.get('workspaceId') });
    return NextResponse.redirect(url);
  } catch {
    return new Response('X connection unavailable', { status: 403 });
  }
}

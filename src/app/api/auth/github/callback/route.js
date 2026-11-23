import { NextResponse } from 'next/server';
import { databasePool } from '../../../../../../db/pool.mjs';
import { appOrigin, completeGitHubLogin } from '@/server/github-login.mjs';

export async function GET(request) {
  const origin = appOrigin();
  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const cookieState = request.cookies.get('pubx_oauth_state')?.value;
  let response;
  if (request.nextUrl.searchParams.has('error')) {
    response = NextResponse.redirect(`${origin}/studio?auth=denied`);
  } else {
    const client = await databasePool().connect();
    try {
      const session = await completeGitHubLogin({ client, state, cookieState, code });
      response = NextResponse.redirect(`${origin}/studio`);
      response.cookies.set('pubx_session', session.token, {
        httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax',
        path: '/', maxAge: session.maxAge,
      });
    } catch {
      response = NextResponse.redirect(`${origin}/studio?auth=denied`);
    } finally { client.release(); }
  }
  response.cookies.set('pubx_oauth_state', '', {
    httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'lax',
    path: '/api/auth/github/callback', maxAge: 0,
  });
  return response;
}

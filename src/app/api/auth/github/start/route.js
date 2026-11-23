import { NextResponse } from 'next/server';
import { appOrigin, startGitHubLogin } from '@/server/github-login.mjs';

export async function GET() {
  try {
    const { state, url } = startGitHubLogin();
    const response = NextResponse.redirect(url);
    response.cookies.set('pubx_oauth_state', state, {
      httpOnly: true, secure: appOrigin().startsWith('https:'), sameSite: 'lax',
      path: '/api/auth/github/callback', maxAge: 600,
    });
    return response;
  } catch {
    return new Response('Login is not configured', { status: 503 });
  }
}

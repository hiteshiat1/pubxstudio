import { NextResponse } from 'next/server';
import { databasePool } from '../../../../../db/pool.mjs';
import { revokeSession } from '../../../../../db/access.mjs';
import { appOrigin } from '@/server/github-login.mjs';

export async function POST(request) {
  if (request.headers.get('origin') !== appOrigin()) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const token = request.cookies.get('pubx_session')?.value;
  if (token) await revokeSession(databasePool(), token);
  const response = NextResponse.redirect(`${appOrigin()}/studio`, { status: 303 });
  response.cookies.set('pubx_session', '', { httpOnly: true, secure: appOrigin().startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}

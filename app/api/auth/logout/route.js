import { NextResponse } from 'next/server';
import {
  authHeaders,
  getSessionToken,
  outSystemsUrl,
  SESSION_COOKIE,
} from '@/lib/server/outSystems';

export async function POST() {
  const token = await getSessionToken();
  if (token) {
    await fetch(outSystemsUrl('/T3RE_Core_AuthAPI/rest/Auth/logout'), {
      method: 'POST',
      headers: authHeaders(token),
      cache: 'no-store',
    }).catch(() => null);
  }

  const response = NextResponse.json({ success: true, data: null, errors: [] });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

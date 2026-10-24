import { NextResponse } from 'next/server';
import { outSystemsUrl, readJson, SESSION_COOKIE } from '@/lib/server/outSystems';

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!username || !password) {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'INVALID_LOGIN', message: 'Enter your username and password.' }] },
      { status: 400 },
    );
  }

  let backend;
  try {
    backend = await fetch(outSystemsUrl('/T3RE_Core_AuthAPI/rest/Auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: username, Password: password }),
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'AUTH_UNAVAILABLE', message: 'Login service is unavailable.' }] },
      { status: 502 },
    );
  }

  const payload = await readJson(backend);
  if (!backend.ok || !payload?.Success || !payload?.Token) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        errors: [{ code: 'INVALID_LOGIN', message: payload?.ErrorMessage || 'Invalid username or password.' }],
      },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ success: true, data: { authenticated: true }, errors: [] });
  response.cookies.set(SESSION_COOKIE, payload.Token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return response;
}

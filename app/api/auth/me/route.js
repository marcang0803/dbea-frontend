import { NextResponse } from 'next/server';
import { authHeaders, getSessionToken, outSystemsUrl, readJson } from '@/lib/server/outSystems';

export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'UNAUTHORIZED', message: 'Authentication required.' }] },
      { status: 401 },
    );
  }

  const backend = await fetch(outSystemsUrl('/T3RE_Core_AuthAPI/rest/Auth/me'), {
    headers: authHeaders(token),
    cache: 'no-store',
  }).catch(() => null);
  if (!backend) {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'AUTH_UNAVAILABLE', message: 'Authentication service is unavailable.' }] },
      { status: 502 },
    );
  }

  const payload = await readJson(backend);
  if (!backend.ok || !payload?.Success) {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'UNAUTHORIZED', message: 'Your session has expired.' }] },
      { status: 401 },
    );
  }

  return NextResponse.json({ success: true, data: { userId: payload.UserId }, errors: [] });
}

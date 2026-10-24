import { NextResponse } from 'next/server';
import {
  authHeaders,
  camelize,
  getSessionToken,
  outSystemsUrl,
  proxyEnvelope,
  readJson,
} from '@/lib/server/outSystems';

function routeFor(method, path) {
  const joined = path.join('/');

  if (method === 'GET' && joined === 'beneficiaries') {
    return '/T3RE_Sender_AS/rest/Beneficiary/beneficiaries';
  }
  if (method === 'GET' && joined === 'account/summary') {
    return '/T3RE_Notify_CS/rest/Account/summary';
  }
  if (method === 'GET' && joined === 'notifications') {
    return '/T3RE_Notify_AS/rest/Notification/notifications';
  }
  if (method === 'GET' && joined === 'notifications/unread-count') {
    return '/T3RE_Notify_AS/rest/Notification/notifications/unread-count';
  }
  if (method === 'PUT' && /^notifications\/[^/]+\/read$/.test(joined)) {
    return `/T3RE_Notify_AS/rest/Notification/${joined}`;
  }
  if (method === 'POST' && joined === 'otp/challenges') {
    return '/T3RE_Notify_CS/rest/Otp/challenges';
  }
  if (method === 'POST' && joined === 'remittance/quotes') {
    return '/T3RE_Remit_CS/rest/Quote/quotes';
  }

  const quoteMatch = joined.match(/^remittance\/quotes\/(\d+)$/);
  if (method === 'GET' && quoteMatch) {
    return `/T3RE_Remit_CS/rest/Quote/quotes/${quoteMatch[1]}`;
  }

  const sendMatch = joined.match(/^remittance\/(\d+)\/send$/);
  if (method === 'POST' && sendMatch) {
    return `/T3RE_Remit_CS/rest/Remit/remittances/${sendMatch[1]}/send`;
  }

  return '';
}

function backendBody(method, path, body) {
  const joined = path.join('/');
  if (method === 'POST' && joined === 'remittance/quotes') {
    return {
      BeneficiaryLinkId: body?.beneficiaryLinkId,
      AmountSGD: body?.amountSGD,
    };
  }
  if (method === 'POST' && /^remittance\/\d+\/send$/.test(joined)) {
    return {
      ChallengeId: body?.challengeId,
      OtpCode: body?.otpCode,
    };
  }
  return body;
}

async function authenticatedUserId(token) {
  const response = await fetch(outSystemsUrl('/T3RE_Core_AuthAPI/rest/Auth/me'), {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  const payload = await readJson(response);
  return response.ok && payload?.Success ? payload.UserId : null;
}

async function handle(request, context) {
  const { path = [] } = await context.params;
  const targetPath = routeFor(request.method, path);
  if (!targetPath) {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'NOT_FOUND', message: 'API route not found.' }] },
      { status: 404 },
    );
  }

  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'UNAUTHORIZED', message: 'Authentication required.' }] },
      { status: 401 },
    );
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(outSystemsUrl(targetPath));
  targetUrl.search = incomingUrl.search;
  if (request.method === 'GET' && path.join('/') === 'beneficiaries') {
    const userId = await authenticatedUserId(token).catch(() => null);
    if (!userId) {
      return NextResponse.json(
        { success: false, data: null, errors: [{ code: 'UNAUTHORIZED', message: 'Your session has expired.' }] },
        { status: 401 },
      );
    }
    targetUrl.searchParams.set('userId', String(userId));
  }

  let body;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const incomingBody = await request.json().catch(() => null);
    body = JSON.stringify(backendBody(request.method, path, incomingBody));
  }

  let backend;
  try {
    backend = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...authHeaders(token),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { success: false, data: null, errors: [{ code: 'BACKEND_UNAVAILABLE', message: 'Backend service is unavailable.' }] },
      { status: 502 },
    );
  }

  const payload = await readJson(backend);
  if (backend.ok && request.method === 'GET' && path.join('/') === 'beneficiaries') {
    const normalized = camelize(payload);
    const beneficiaries = Array.isArray(normalized?.data) ? normalized.data : [];
    const items = beneficiaries.map((beneficiary) => ({
      ...beneficiary,
      id: beneficiary.beneficiaryLinkId,
      accountLast4: String(beneficiary.accountId || '').slice(-4),
      bankName: beneficiary.bankName || 'Recipient bank',
      payoutCurrency: beneficiary.payoutCurrency || 'PHP',
    }));
    return NextResponse.json({ success: true, data: { items, total: items.length }, errors: [] });
  }
  return NextResponse.json(proxyEnvelope(backend, payload), { status: backend.status });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;

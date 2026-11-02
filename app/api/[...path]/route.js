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

  // P2: beneficiaries and sender onboarding
  if (['GET', 'POST'].includes(method) && joined === 'family/beneficiaries') {
    return '/T3RE_Sender_CS/rest/Family/beneficiaries';
  }

  if (method === 'DELETE' && /^family\/beneficiaries\/[^/]+$/.test(joined)) {
    return `/T3RE_Sender_CS/rest/Family/beneficiaries/${path.at(-1)}`;
  }

  if (method === 'GET' && joined === 'family/payout-options') {
    return '/T3RE_Sender_CS/rest/Family/payout-options';
  }

  if (method === 'POST' && joined === 'onboard/otp') {
    return '/T3RE_Sender_CS/rest/Onboard/otp';
  }

  if (method === 'POST' && joined === 'onboard/senders') {
    return '/T3RE_Sender_CS/rest/Onboard/senders';
  }

  // P3: account, notifications and OTP
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

  // Remittance
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

  // P4: preview a rate lock
  if (method === 'POST' && joined === 'rates/locks/preview') {
    return '/T3RE_Rate_CS/rest/Lock/locks/preview';
  }

  // P4: create a lock or retrieve the current user's locks
  if (['GET', 'POST'].includes(method) && joined === 'rates/locks') {
    return '/T3RE_Rate_CS/rest/Lock/locks';
  }

  // P4: create or retrieve rate alerts
  if (['GET', 'POST'].includes(method) && joined === 'rates/alerts') {
    return '/T3RE_Rate_AS/rest/RateAlert/alerts';
  }

  // P4: delete a particular rate alert
  const alertMatch = joined.match(/^rates\/alerts\/([^/]+)$/);

  if (method === 'DELETE' && alertMatch) {
    return `/T3RE_Rate_AS/rest/RateAlert/alerts/${alertMatch[1]}`;
  }

  return '';
}

function backendBody(method, path, body) {
  const joined = path.join('/');

  // Remittance quote
  if (method === 'POST' && joined === 'remittance/quotes') {
    return {
      BeneficiaryLinkId: body?.beneficiaryLinkId,
      AmountSGD: body?.amountSGD,
    };
  }

  // Remittance confirmation
  if (method === 'POST' && /^remittance\/\d+\/send$/.test(joined)) {
    return {
      ChallengeId: body?.challengeId,
      OtpCode: body?.otpCode,
    };
  }

  // P4: preview rate lock
  if (method === 'POST' && joined === 'rates/locks/preview') {
    return {
      BeneficiaryLinkId: body?.beneficiaryLinkId,
      AmountSGD: body?.amountSGD,
      Period: body?.period,
    };
  }

  // P4: create rate lock
  if (method === 'POST' && joined === 'rates/locks') {
    return {
      BeneficiaryLinkId: body?.beneficiaryLinkId,
      AmountSGD: body?.amountSGD,
      Period: body?.period,
      ChallengeId: body?.challengeId,
      OtpCode: body?.otpCode,
      ReferenceId: body?.referenceId,
    };
  }

  // P4: create rate alert
  if (method === 'POST' && joined === 'rates/alerts') {
    return {
      Corridor: body?.corridor,
      TargetRate: body?.targetRate,
    };
  }

  return body;
}

function isPublicRoute(method, path) {
  const joined = path.join('/');

  return (
    method === 'POST' &&
    ['onboard/otp', 'onboard/senders'].includes(joined)
  );
}

async function handle(request, context) {
  const { path = [] } = await context.params;
  const targetPath = routeFor(request.method, path);

  if (!targetPath) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        errors: [
          {
            code: 'NOT_FOUND',
            message: 'API route not found.',
          },
        ],
      },
      { status: 404 },
    );
  }

  const token = await getSessionToken();

  if (!token && !isPublicRoute(request.method, path)) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        errors: [
          {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        ],
      },
      { status: 401 },
    );
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(outSystemsUrl(targetPath));

  // Preserve query parameters from the frontend request.
  targetUrl.search = incomingUrl.search;

  let body;

  if (!['GET', 'HEAD'].includes(request.method)) {
    const incomingBody = await request.json().catch(() => null);

    body = JSON.stringify(
      backendBody(request.method, path, incomingBody),
    );
  }

  let backend;

  try {
    backend = await fetch(targetUrl, {
      method: request.method,
      headers: {
        ...(token ? authHeaders(token) : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        data: null,
        errors: [
          {
            code: 'BACKEND_UNAVAILABLE',
            message: 'Backend service is unavailable.',
          },
        ],
      },
      { status: 502 },
    );
  }

  const payload = await readJson(backend);

  // Keep the existing beneficiary response transformation.
  if (
    backend.ok &&
    request.method === 'GET' &&
    path.join('/') === 'family/beneficiaries'
  ) {
    const normalized = camelize(payload);
    const beneficiaries = Array.isArray(normalized?.data)
      ? normalized.data
      : [];

    const items = beneficiaries.map((beneficiary) => ({
      ...beneficiary,
      id: beneficiary.beneficiaryLinkId,
      isActive: true,
      relationshipLabel:
        beneficiary.relationshipLabel || beneficiary.relationship,
      accountLast4: String(beneficiary.accountId || '').slice(-4),
      bankName: beneficiary.partnerName || beneficiary.bankName || 'Recipient bank',
      payoutCurrency: beneficiary.payoutCurrency || 'PHP',
    }));

    return NextResponse.json({
      success: true,
      data: {
        items,
        total: items.length,
      },
      errors: [],
    });
  }

  return NextResponse.json(
    proxyEnvelope(backend, payload),
    { status: backend.status },
  );
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
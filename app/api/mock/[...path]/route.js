// Mock API for local development without OutSystems.
// Active only when NEXT_PUBLIC_USE_MOCK_API=true AND not a production build.
// Mirrors the P3 REST contracts and the { success, data, errors } envelope.
//
//   GET  /api/mock/account/summary              → C5 ViewAccountSummary
//   GET  /api/mock/notifications?page&pageSize  → A4 list
//   PUT  /api/mock/notifications/{id}/read      → A4 mark read
//   GET  /api/mock/notifications/unread-count   → A4 unread count
//   POST /api/mock/otp/challenges               → C13 RequestOTP
//   GET  /api/mock/beneficiaries                → P1 active beneficiary links
//   POST /api/mock/remittance/quotes            → P2 QuoteRemittance
//   GET  /api/mock/remittance/quotes/{id}       → P2 quote review
//   POST /api/mock/remittance/{id}/send         → P2 ProcessRemittance
//   POST /api/mock/dev/confirm                  → stands in for P2/P4/P6 composites that verify the OTP
//   POST /api/mock/dev/notify                   → adds a test notification (see /dev)

import { MOCK_OTP, store } from '@/lib/mock/mockStore';

const enabled = () =>
  process.env.NEXT_PUBLIC_USE_MOCK_API === 'true' && process.env.NODE_ENV !== 'production';

const ok = (data, status = 200, errors = []) => Response.json({ success: true, data, errors }, { status });
const fail = (status, code, message) =>
  Response.json({ success: false, data: null, errors: [{ code, message }] }, { status });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const unread = () => store.notifications.filter((n) => !n.isRead).length;
const formatMockAmount = (value) =>
  Number(value).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function handle(request, { params }) {
  if (!enabled()) return fail(404, 'NOT_FOUND', 'Mock API is disabled.');
  const { path } = await params;
  const route = `${request.method} ${path.join('/')}`;
  const url = new URL(request.url);
  await delay(350); // makes loading states visible

  // C5 ViewAccountSummary
  if (route === 'GET account/summary') {
    return ok({
      ...store.account,
      recentRemittances: store.remittances.slice(0, 5),
      unreadNotifications: unread(),
    });
  }

  // P1 beneficiary list used by P2's send screen.
  if (route === 'GET beneficiaries') {
    return ok({ items: store.beneficiaries });
  }

  // P2 QuoteRemittance. Values are deterministic so the confirmation screen
  // can be developed without calling the real banking services.
  if (route === 'POST remittance/quotes') {
    const body = await request.json().catch(() => ({}));
    const beneficiary = store.beneficiaries.find(
      (item) => item.id === Number(body.beneficiaryLinkId) && item.isActive,
    );
    const amountSGD = Number(body.amountSGD);
    if (!beneficiary) return fail(404, 'BENEFICIARY_NOT_FOUND', 'Beneficiary is not available.');
    if (!Number.isFinite(amountSGD) || amountSGD < 10) {
      return fail(400, 'INVALID_AMOUNT', 'Enter an amount of at least S$10.');
    }
    if (amountSGD > store.account.balance) {
      return fail(422, 'INSUFFICIENT_FUNDS', 'This amount is more than your available balance.');
    }

    const marketRate = 43.12;
    const customerRate = 42.53;
    const fee = 2.5;
    const recipientAmount = Number(((amountSGD - fee) * customerRate).toFixed(2));
    const bankRecipientAmount = Number(((amountSGD - 8) * 42.1).toFixed(2));
    const quote = {
      quoteId: store.nextQuoteId++,
      beneficiaryLinkId: beneficiary.id,
      beneficiary,
      amountSGD,
      marketRate,
      customerRate,
      fee,
      recipientAmount,
      bankRecipientAmount,
      savings: Number((recipientAmount - bankRecipientAmount).toFixed(2)),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    store.quotes.set(quote.quoteId, quote);
    return ok(quote, 201);
  }

  if (
    request.method === 'GET' &&
    path[0] === 'remittance' &&
    path[1] === 'quotes' &&
    path.length === 3
  ) {
    const quote = store.quotes.get(Number(path[2]));
    if (!quote) return fail(404, 'QUOTE_NOT_FOUND', 'This quote could not be found.');
    return ok(quote);
  }

  if (
    request.method === 'POST' &&
    path[0] === 'remittance' &&
    path[2] === 'send' &&
    path.length === 3
  ) {
    const quote = store.quotes.get(Number(path[1]));
    if (!quote) return fail(404, 'QUOTE_NOT_FOUND', 'This quote could not be found.');
    if (quote.sent) return fail(409, 'ALREADY_SENT', 'This quote has already been used.');
    if (Date.now() > Date.parse(quote.expiresAt)) {
      return fail(409, 'QUOTE_EXPIRED', 'This quote has expired. Please create a new one.');
    }

    const { challengeId, otpCode } = await request.json().catch(() => ({}));
    const challenge = store.challenges.get(challengeId);
    const sameReference = String(challenge?.referenceId) === String(quote.quoteId);
    const invalidChallenge =
      !challenge || challenge.used || challenge.purpose !== 'SEND' || !sameReference ||
      Date.now() > Date.parse(challenge.expiresAt) || challenge.attempts >= MOCK_OTP.MAX_ATTEMPTS;
    if (invalidChallenge || otpCode === MOCK_OTP.FORCE_EXPIRED_CODE) {
      return fail(409, 'OTP_INVALID', 'This code has expired or can no longer be used.');
    }
    challenge.attempts += 1;
    if (otpCode !== MOCK_OTP.CORRECT_CODE) {
      const attemptsLeft = MOCK_OTP.MAX_ATTEMPTS - challenge.attempts;
      if (attemptsLeft <= 0) return fail(409, 'OTP_INVALID', 'This code can no longer be used.');
      return fail(422, 'OTP_INCORRECT', `Incorrect code. ${attemptsLeft} tries left.`);
    }

    challenge.used = true;
    quote.sent = true;
    quote.status = 'COMPLETED';
    quote.tBankTxnId = `TBANK-${quote.quoteId}`;
    quote.completedOn = new Date().toISOString();
    quote.balanceAfter = Number((store.account.balance - quote.amountSGD).toFixed(2));
    store.account.balance = quote.balanceAfter;
    store.remittances.unshift({
      id: quote.quoteId,
      nickname: quote.beneficiary.nickname,
      amountSGD: quote.amountSGD,
      recipientAmount: quote.recipientAmount,
      payoutCurrency: quote.beneficiary.payoutCurrency,
      status: quote.status,
      createdOn: quote.completedOn,
    });
    store.notifications.unshift({
      id: store.nextNotificationId++,
      type: 'RECEIPT',
      title: `Sent to ${quote.beneficiary.nickname}`,
      message: `${formatMockAmount(quote.recipientAmount)} ${quote.beneficiary.payoutCurrency} was sent successfully.`,
      link: `/send/receipt?quoteId=${quote.quoteId}`,
      isRead: false,
      createdOn: quote.completedOn,
    });
    return ok({
      remittanceId: quote.quoteId,
      status: quote.status,
      tBankTxnId: quote.tBankTxnId,
      recipientAmount: quote.recipientAmount,
      balanceAfter: quote.balanceAfter,
    });
  }

  // A4 Notification
  if (route === 'GET notifications') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));
    const sorted = [...store.notifications].sort((a, b) => b.createdOn.localeCompare(a.createdOn));
    return ok({ items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length });
  }
  if (route === 'GET notifications/unread-count') return ok({ unread: unread() });
  if (request.method === 'PUT' && path[0] === 'notifications' && path[2] === 'read' && path.length === 3) {
    const item = store.notifications.find((n) => String(n.id) === path[1]);
    if (!item) return fail(404, 'NOT_FOUND', 'Notification not found.');
    item.isRead = true;
    return ok({ id: item.id, isRead: true });
  }

  // C13 RequestOTP
  if (route === 'POST otp/challenges') {
    const body = await request.json().catch(() => ({}));
    if (!['SEND', 'LOCK', 'ADVANCE'].includes(body.purpose) || !body.referenceId) {
      return fail(400, 'INVALID_REQUEST', 'purpose must be SEND, LOCK or ADVANCE, and referenceId is required.');
    }
    // Only one live code per purpose + reference (same rule as the real service).
    for (const c of store.challenges.values()) {
      if (c.purpose === body.purpose && c.referenceId === body.referenceId) c.used = true;
    }
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + MOCK_OTP.TTL_MS).toISOString();
    store.challenges.set(challengeId, { purpose: body.purpose, referenceId: body.referenceId, expiresAt, attempts: 0, used: false });
    return ok({ challengeId, maskedMobile: '+65 ••••4567', expiresAt }, 201);
  }

  // Dev helpers
  if (route === 'POST dev/confirm') {
    const { challengeId, otpCode, purpose, referenceId } = await request.json().catch(() => ({}));
    const c = store.challenges.get(challengeId);
    const invalid = () => fail(409, 'OTP_INVALID', 'This code has expired or can no longer be used.');
    if (!c || c.used || c.purpose !== purpose || c.referenceId !== referenceId) return invalid();
    if (otpCode === MOCK_OTP.FORCE_EXPIRED_CODE || Date.now() > Date.parse(c.expiresAt)) return invalid();
    if (c.attempts >= MOCK_OTP.MAX_ATTEMPTS) return invalid();
    c.attempts += 1;
    if (otpCode !== MOCK_OTP.CORRECT_CODE) {
      const left = MOCK_OTP.MAX_ATTEMPTS - c.attempts;
      if (left <= 0) return invalid();
      return fail(422, 'OTP_INCORRECT', `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
    }
    c.used = true;
    return ok({ verified: true });
  }
  if (route === 'POST dev/notify') {
    const n = {
      id: store.nextNotificationId++,
      type: 'RATE_ALERT',
      title: '1 SGD = 44.12 PHP',
      message: 'Test alert from the dev page.',
      link: '/notifications',
      isRead: false,
      createdOn: new Date().toISOString(),
    };
    store.notifications.unshift(n);
    return ok(n, 201);
  }

  return fail(404, 'NOT_FOUND', `No mock for ${route}.`);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;

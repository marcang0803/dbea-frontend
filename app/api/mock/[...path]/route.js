import { corridorForCode, corridorForCurrency } from '@/lib/corridors';
import { mockForwardRate } from '@/lib/mock/p4Fixtures';
// Mock API for local development without OutSystems.
// Active only when NEXT_PUBLIC_USE_MOCK_API=true AND not a production build.
// Mirrors the P3 REST contracts and the { success, data, errors } envelope.
//
//   GET  /api/mock/account/summary              → C5 ViewAccountSummary
//   GET  /api/mock/notifications?page&pageSize  → A4 list
//   PUT  /api/mock/notifications/{id}/read      → A4 mark read
//   GET  /api/mock/notifications/unread-count   → A4 unread count
//   POST /api/mock/otp/challenges               → C13 RequestOTP
//   GET  /api/mock/family/beneficiaries         → P1 active beneficiary links
//   POST /api/mock/remittance/quotes            → P2 QuoteRemittance
//   GET  /api/mock/remittance/quotes/{id}       → P2 quote review
//   POST /api/mock/remittance/{id}/send         → P2 ProcessRemittance
//   POST /api/mock/rates/locks/preview           → P4 PreviewLock
//   GET  /api/mock/rates/locks                   → P4 GetMyLocks
//   POST /api/mock/rates/locks                   → P4 CreateLock
//   GET  /api/mock/rates/alerts                  → P4 GetMyAlerts
//   POST /api/mock/rates/alerts                  → P4 CreateAlert
//   DELETE /api/mock/rates/alerts/{id}           → P4 DeleteAlert
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
const lockPeriods = new Set(['1M', '3M', '6M', '1Y']);

function maturityDateFor(period) {
  const months = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[period];
  const maturityDate = new Date();
  maturityDate.setUTCMonth(maturityDate.getUTCMonth() + months);
  return maturityDate.toISOString();
}

async function handle(request, { params }) {
  if (!enabled()) return fail(404, 'NOT_FOUND', 'Mock API is disabled.');
  const { path } = await params;
  const route = `${request.method} ${path.join('/')}`;
  const url = new URL(request.url);
  await delay(350); // makes loading states visible

  if (route === 'GET auth/me') {
    return ok({ userId: store.userId });
  }

  if (route === 'POST score') {
    const userId = Number(url.searchParams.get('UserId'));
    const accountId = url.searchParams.get('tBankAccountId');
    if (userId !== store.userId || accountId !== store.account.accountId) {
      return fail(400, 'INVALID_ACCOUNT', 'The user or account could not be verified.');
    }

    const snapshot = {
      id: store.nextScoreSnapshotId++,
      userId,
      score: 724,
      band: 'B',
      factorBreakdown: [
        { factor: 'Income stability', reason: 'Regular income history supports repayment capacity.' },
        { factor: 'Account activity', reason: 'Recent account activity is within the expected range.' },
        { factor: 'Existing obligations', reason: 'Current obligations are included in the assessment.' },
      ],
      createdOn: new Date().toISOString(),
    };
    store.scoreSnapshots.set(snapshot.id, snapshot);
    return ok(snapshot);
  }

  if (route === 'GET advances/me') {
    const advances = store.advances
      .filter((advance) => advance.userId === store.userId)
      .map((advance) => ({
        ...advance,
        repayments: store.repayments.filter(
          (repayment) => repayment.advanceId === advance.advanceId,
        ),
      }));

    return ok({
      userIdOut: store.userId,
      latestScore: 724,
      latestBand: 'B',
      advances,
    });
  }

  if (route === 'GET eligibility') {
    const userId = Number(url.searchParams.get('UserId'));
    const accountId = url.searchParams.get('tBankAccountId');
    const amount = Number(url.searchParams.get('RequestedAmount'));
    const tenor = Number(url.searchParams.get('SelectedTenorMonths'));
    const snapshotId = Number(url.searchParams.get('SnapshotId'));
    const snapshot = store.scoreSnapshots.get(snapshotId);

    if (userId !== store.userId || accountId !== store.account.accountId || !snapshot) {
      return fail(400, 'INVALID_SNAPSHOT', 'A valid score snapshot and account are required.');
    }
    if (!Number.isFinite(amount) || amount <= 0 || ![3, 6, 12].includes(tenor)) {
      return fail(400, 'INVALID_PLAN', 'Enter a positive amount and choose a supported plan term.');
    }

    const interestRate = 8;
    const interest = Number((amount * interestRate * tenor / 1200).toFixed(2));
    const monthlyInstalment = Number(((amount + interest) / tenor).toFixed(2));
    const maturityDate = new Date();
    maturityDate.setUTCMonth(maturityDate.getUTCMonth() + tenor);
    return ok({
      isEligible: amount <= 1500,
      score: snapshot.score,
      approvedBand: snapshot.band,
      maxAdvanceAmount: 1500,
      outSnapshotId: snapshot.id,
      isSnapshotValid: true,
      selectedPlanAmount: amount,
      selectedTenor: tenor,
      monthlyInstalment,
      maturityDate: maturityDate.toISOString(),
      bandProductId: 'BAND-B',
      tBankLoanProductId: 3201,
      interestRate,
      interest,
    });
  }

  if (route === 'GET advances') {
    const userId = Number(url.searchParams.get('userId'));
    const status = url.searchParams.get('status');
    const items = store.advances.filter(
      (advance) =>
        advance.userId === userId &&
        (!status || advance.status.toUpperCase() === status.toUpperCase()),
    );
    return ok(items);
  }

  if (
    request.method === 'GET' &&
    path[0] === 'advances' &&
    path.length === 3 &&
    path[2] === 'repayments'
  ) {
    const advanceId = Number(path[1]);
    const advanceExists = store.advances.some((advance) => advance.advanceId === advanceId);
    if (!advanceExists) return fail(404, 'ADVANCE_NOT_FOUND', 'Advance record not found.');
    return ok(store.repayments.filter((repayment) => repayment.advanceId === advanceId));
  }

  // C5 ViewAccountSummary
  if (route === 'GET account/summary') {
    return ok({
      ...store.account,
      recentRemittances: store.remittances.slice(0, 5),
      unreadNotifications: unread(),
    });
  }

  // P1 beneficiary list used by P2's send screen.
  if (route === 'GET family/beneficiaries') {
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

    // Mock-only reference rates (1 SGD = x), so non-PHP family members get sensible numbers.
    // PHP keeps the original values. Real rates come from the backend in live mode.
    const MOCK_MARKET_RATES = { PHP: 43.12, INR: 64.5, BDT: 89.9, IDR: 12050, MYR: 3.45, MMK: 1610, VND: 19250 };
    const marketRate = MOCK_MARKET_RATES[beneficiary.payoutCurrency] ?? 43.12;
    const customerRate = beneficiary.payoutCurrency === 'PHP' || !MOCK_MARKET_RATES[beneficiary.payoutCurrency]
      ? 42.53
      : Number((marketRate * 0.9863).toFixed(4));
    const bankRate = beneficiary.payoutCurrency === 'PHP' ? 42.1 : Number((marketRate * 0.9763).toFixed(4));
    const fee = 2.5;
    const recipientAmount = Number(((amountSGD - fee) * customerRate).toFixed(2));
    const bankRecipientAmount = Number(((amountSGD - 8) * bankRate).toFixed(2));
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

  // P4 PreviewLock. The mock rate is deterministic for each supported period.
  if (route === 'POST rates/locks/preview') {
    const body = await request.json().catch(() => ({}));
    const beneficiary = store.beneficiaries.find(
      (item) => item.id === Number(body.beneficiaryLinkId) && item.isActive,
    );
    const amountSGD = Number(body.amountSGD);
    const period = String(body.period || '').toUpperCase();

    if (!beneficiary) {
      return fail(400, 'INVALID_BENEFICIARY', 'Select an active beneficiary.');
    }
    if (!Number.isFinite(amountSGD) || amountSGD <= 0) {
      return fail(400, 'INVALID_AMOUNT', 'Enter an amount greater than S$0.');
    }
    if (!lockPeriods.has(period)) {
      return fail(400, 'INVALID_PERIOD', 'Period must be 1M, 3M, 6M or 1Y.');
    }

    const forwardRate = mockForwardRate(beneficiary.payoutCurrency, period);
    if (!corridorForCurrency(beneficiary.payoutCurrency) || !forwardRate) return fail(400, 'INVALID_CORRIDOR', 'No forward quote is available for this payout currency.');
    return ok({
      forwardRate,
      recipientAmount: Number((amountSGD * forwardRate).toFixed(2)),
      maturityDate: maturityDateFor(period),
    });
  }

  // P4 GetMyLocks
  if (route === 'GET rates/locks') {
    return ok([...store.rateLocks].sort((a, b) => b.createdOn.localeCompare(a.createdOn)));
  }

  // P4 CreateLock. This also verifies the LOCK OTP using the same referenceId.
  if (route === 'POST rates/locks') {
    const body = await request.json().catch(() => ({}));
    const beneficiary = store.beneficiaries.find(
      (item) => item.id === Number(body.beneficiaryLinkId) && item.isActive,
    );
    const amountSGD = Number(body.amountSGD);
    const period = String(body.period || '').toUpperCase();
    const referenceId = String(body.referenceId || '');

    if (!beneficiary || !Number.isFinite(amountSGD) || amountSGD <= 0 || !lockPeriods.has(period)) {
      return fail(400, 'INVALID_REQUEST', 'Beneficiary, amount and period are required.');
    }
    const lockedRate = mockForwardRate(beneficiary.payoutCurrency, period);
    if (!corridorForCurrency(beneficiary.payoutCurrency) || !lockedRate) return fail(400, 'INVALID_CORRIDOR', 'No forward quote is available for this payout currency.');
    if (!body.challengeId || !body.otpCode || !referenceId) {
      return fail(400, 'INVALID_REQUEST', 'Challenge ID, OTP code and reference ID are required.');
    }

    const challenge = store.challenges.get(body.challengeId);
    const sameReference = String(challenge?.referenceId) === referenceId;
    const invalidChallenge =
      !challenge ||
      challenge.used ||
      challenge.purpose !== 'LOCK' ||
      !sameReference ||
      Date.now() > Date.parse(challenge.expiresAt) ||
      challenge.attempts >= MOCK_OTP.MAX_ATTEMPTS;

    if (invalidChallenge || body.otpCode === MOCK_OTP.FORCE_EXPIRED_CODE) {
      return fail(409, 'OTP_INVALID', 'This code has expired or can no longer be used.');
    }

    challenge.attempts += 1;
    if (body.otpCode !== MOCK_OTP.CORRECT_CODE) {
      const attemptsLeft = MOCK_OTP.MAX_ATTEMPTS - challenge.attempts;
      if (attemptsLeft <= 0) {
        return fail(409, 'OTP_INVALID', 'This code can no longer be used.');
      }
      return fail(422, 'OTP_INCORRECT', `Incorrect code. ${attemptsLeft} tries left.`);
    }

    challenge.used = true;
    const lockId = store.nextRateLockId++;
    const createdOn = new Date().toISOString();
    const lock = {
      lockId,
      beneficiaryLinkId: beneficiary.id,
      fxForwardId: 9000 + lockId,
      quoteCurrency: beneficiary.payoutCurrency,
      lockedRate,
      amountSGD,
      period,
      maturityDate: maturityDateFor(period),
      status: 'ACTIVE',
      createdOn,
    };

    store.rateLocks.unshift(lock);
    store.notifications.unshift({
      id: store.nextNotificationId++,
      type: 'LOCK',
      title: `SGD→${beneficiary.payoutCurrency} rate locked`,
      message: `S$${formatMockAmount(amountSGD)} locked at ${lockedRate} ${beneficiary.payoutCurrency}.`,
      link: '/rates/locks',
      isRead: false,
      createdOn,
    });

    return ok(lock, 201);
  }

  // P4 GetMyAlerts
  if (route === 'GET rates/alerts') {
    return ok(store.rateAlerts.filter((alert) => alert.isActive === true).sort((a, b) => b.createdOn.localeCompare(a.createdOn)));
  }

  // P4 CreateAlert
  if (route === 'POST rates/alerts') {
    const body = await request.json().catch(() => ({}));
    const corridor = String(body.corridor || '').trim().toUpperCase();
    const targetRate = Number(body.targetRate);

    if (!corridorForCode(corridor)) return fail(400, 'INVALID_CORRIDOR', 'Select a supported currency corridor.');
    if (!Number.isFinite(targetRate) || targetRate <= 0) {
      return fail(400, 'INVALID_REQUEST', 'Corridor and a positive target rate are required.');
    }

    const alert = {
      alertId: store.nextRateAlertId++,
      userId: 51085,
      corridor,
      targetRate,
      isActive: true,
      lastTriggeredAt: null,
      createdOn: new Date().toISOString(),
    };
    store.rateAlerts.unshift(alert);
    return ok(alert, 201);
  }

  // P4 DeleteAlert
  if (
    request.method === 'DELETE' &&
    path[0] === 'rates' &&
    path[1] === 'alerts' &&
    path.length === 3
  ) {
    const index = store.rateAlerts.findIndex((item) => String(item.alertId) === path[2]);
    if (index < 0) return fail(404, 'ALERT_NOT_FOUND', 'Rate alert not found.');
    const [deleted] = store.rateAlerts.splice(index, 1);
    return ok({ alertId: deleted.alertId, deleted: true });
  }

  // A4 Notification
  if (route === 'GET notifications') {
    const page = Math.max(0, Number(url.searchParams.get('page')) || 0);
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || 20));
    const sorted = [...store.notifications].sort((a, b) => b.createdOn.localeCompare(a.createdOn));
    return ok({ itemsList: sorted.slice(page * pageSize, (page + 1) * pageSize), total: sorted.length });
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
    if (!['SEND', 'LOCK', 'ADVANCE', 'TOPUP'].includes(body.purpose) || !body.referenceId) {
      return fail(400, 'INVALID_REQUEST', 'purpose must be SEND, LOCK, ADVANCE or TOPUP, and referenceId is required.');
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
export const DELETE = handle;

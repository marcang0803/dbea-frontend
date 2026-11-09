// P1 mock: Top up. Mirrors T3RE_Sender_CS POST /Account/topup.
//
//   POST /api/mock/account/topup { amountSGD, requestId, challengeId, otpCode }
//     → 200 { amountSGD, newBalance, accountId }
//
// Verifies the TOPUP OTP from the shared mock store (123456 = correct, 000000 = expired),
// then adds the amount to the shared mock balance, so Home shows it straight away.
// This route is more specific than app/api/mock/[...path], so Next.js matches it first.

import { MOCK_OTP, store } from '@/lib/mock/mockStore';
import { mock } from '@/lib/mock/p1MockStore';
import { TOPUP_MAX, TOPUP_MIN } from '@/lib/p1Api';

export async function POST(request) {
  if (!mock.enabled()) return mock.fail(404, 'NOT_FOUND', 'Mock API is disabled.');
  const { amountSGD, requestId, challengeId, otpCode } = await mock.body(request);
  await mock.delay();

  const amount = Number(amountSGD);
  if (!Number.isFinite(amount) || amount < TOPUP_MIN || amount > TOPUP_MAX || Math.round(amount * 100) !== amount * 100) {
    return mock.fail(400, 'INVALID_AMOUNT', `Enter an amount between S$${TOPUP_MIN} and S$${TOPUP_MAX}.`);
  }
  if (!requestId || !challengeId || !otpCode) {
    return mock.fail(400, 'INVALID_REQUEST', 'Request ID, challenge ID and OTP code are required.');
  }

  // Same rules as P2's SEND and P4's LOCK mocks.
  const challenge = store.challenges.get(challengeId);
  const invalid =
    !challenge || challenge.used || challenge.purpose !== 'TOPUP' ||
    String(challenge.referenceId) !== String(requestId) ||
    Date.now() > Date.parse(challenge.expiresAt) || challenge.attempts >= MOCK_OTP.MAX_ATTEMPTS;
  if (invalid || otpCode === MOCK_OTP.FORCE_EXPIRED_CODE) {
    return mock.fail(409, 'OTP_INVALID', 'This code has expired or can no longer be used.');
  }
  challenge.attempts += 1;
  if (otpCode !== MOCK_OTP.CORRECT_CODE) {
    const left = MOCK_OTP.MAX_ATTEMPTS - challenge.attempts;
    if (left <= 0) return mock.fail(409, 'OTP_INVALID', 'This code can no longer be used.');
    return mock.fail(422, 'OTP_INCORRECT', `Incorrect code. ${left} tries left.`);
  }
  challenge.used = true;

  store.account.balance = Number((store.account.balance + amount).toFixed(2));
  return mock.ok({ amountSGD: amount, newBalance: store.account.balance, accountId: store.account.accountId });
}

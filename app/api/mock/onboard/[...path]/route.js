// P1 mock: C1 OnboardSender (public). Mirrors T3RE_Sender_CS /Onboard.
//
//   POST /api/mock/onboard/otp      { mobile }  → { challengeId, maskedMobile, expiresAt }
//   POST /api/mock/onboard/senders  { ... }     → 201 { senderId, customerId, sgdAccountId, balance }
//
// OTP 123456 = correct, 000000 = expired, anything else = incorrect. Username `demo` is taken.
// Mock mode has no real accounts, so log in afterwards as usual (P2's /login).

import { P1_MOCK, mock, p1Store } from '@/lib/mock/p1MockStore';

const REQUIRED = [
  'challengeId', 'otpCode', 'username', 'password', 'icNumber', 'documentTypeId', 'familyName',
  'givenName', 'genderId', 'dateOfBirth', 'mobile', 'email', 'addressLine1', 'postalCode',
];

async function handle(request, { params }) {
  if (!mock.enabled()) return mock.fail(404, 'NOT_FOUND', 'Mock API is disabled.');
  const { path } = await params;
  const route = `${request.method} ${path.join('/')}`;
  const body = await mock.body(request);
  await mock.delay();

  if (route === 'POST otp') {
    const mobile = String(body.mobile ?? '');
    if (!/^\+65[89]\d{7}$/.test(mobile)) {
      return mock.fail(400, 'INVALID_MOBILE', 'Enter a valid Singapore mobile number.');
    }
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + P1_MOCK.TTL_MS).toISOString();
    p1Store.challenges.set(challengeId, { mobile, expiresAt, used: false });
    return mock.ok({ challengeId, maskedMobile: `+65 ****${mobile.slice(-4)}`, expiresAt });
  }

  if (route === 'POST senders') {
    const missing = REQUIRED.filter((k) => body[k] === undefined || body[k] === '');
    if (missing.length) return mock.fail(400, 'VALIDATION_ERROR', `Missing: ${missing.join(', ')}`);
    if (Number(body.documentTypeId) === 1 && String(body.icNumber).length !== 9) {
      return mock.fail(400, 'INVALID_ID', 'Invalid NRIC/FIN number.');
    }

    const challenge = p1Store.challenges.get(body.challengeId);
    if (!challenge || challenge.used || new Date(challenge.expiresAt) < new Date() ||
        body.otpCode === P1_MOCK.FORCE_EXPIRED_CODE) {
      return mock.fail(409, 'CHALLENGE_INVALID', 'Your code has expired. Please request a new one.');
    }
    if (body.otpCode !== P1_MOCK.CORRECT_CODE) {
      return mock.fail(422, 'OTP_INCORRECT', 'Incorrect code. Please request a new one.');
    }
    challenge.used = true;

    const username = String(body.username).toLowerCase();
    if (p1Store.usernames.has(username)) {
      return mock.fail(409, 'USERNAME_TAKEN', 'This username is already taken.');
    }

    const userId = p1Store.nextUserId++;
    p1Store.usernames.add(username);
    return mock.ok(
      { senderId: userId - 59000, customerId: `T3RE${body.icNumber}`, sgdAccountId: `00000${userId}`, balance: 0 },
      201,
    );
  }

  return mock.fail(404, 'NOT_FOUND', `No mock for ${route}`);
}

export { handle as POST };

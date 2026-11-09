// In-memory data for P1's mock API (dev only). Restart `bun run dev` to reset.
//
// Family members live in the shared mock store (store.beneficiaries, P2's shape) so the
// Send screen's mock quotes can find anyone added on /family/new.
// Sign-up OTP: 123456 is correct, 000000 is treated as expired.

import { store } from '@/lib/mock/mockStore';

function seed() {
  return {
    usernames: new Set(['demo']), // taken usernames, to test the 409 path
    challenges: new Map(), // challengeId → { mobile, expiresAt, used }
    nextUserId: 60000,
    payoutOptions: [
      { corridorProductId: 'T3RE_PRD_SGD_PHP', country: 'PH', partnerName: 'SMU Bank', payoutCurrency: 'PHP' },
    ],
  };
}

export const p1Store = (globalThis.__remiteaseP1MockStore ??= seed());

/** Shared family list (seeded by P2 in mockStore.js; created here if it isn't there). */
export const family = () => (store.beneficiaries ??= []);

export const P1_MOCK = {
  CORRECT_CODE: '123456',
  FORCE_EXPIRED_CODE: '000000',
  TTL_MS: 5 * 60_000,
};

const enabled = () =>
  process.env.NEXT_PUBLIC_USE_MOCK_API === 'true' && process.env.NODE_ENV !== 'production';

export const mock = {
  enabled,
  ok: (data, status = 200) => Response.json({ success: true, data, errors: [] }, { status }),
  fail: (status, code, message) =>
    Response.json({ success: false, data: null, errors: [{ code, message }] }, { status }),
  delay: (ms = 350) => new Promise((r) => setTimeout(r, ms)),
  async body(request) {
    try {
      return await request.json();
    } catch {
      return {};
    }
  },
};

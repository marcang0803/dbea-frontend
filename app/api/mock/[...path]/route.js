// Mock API for local development without OutSystems.
// Active only when NEXT_PUBLIC_USE_MOCK_API=true AND not a production build.
// Mirrors the P3 REST contracts and the { success, data, errors } envelope.
//
//   GET  /api/mock/account/summary              → C5 ViewAccountSummary
//   GET  /api/mock/notifications?page&pageSize  → A4 list
//   PUT  /api/mock/notifications/{id}/read      → A4 mark read
//   GET  /api/mock/notifications/unread-count   → A4 unread count
//   POST /api/mock/otp/challenges               → C13 RequestOTP
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

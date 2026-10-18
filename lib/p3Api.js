// P3 API helpers (Home, Notifications, OTP).
//
// Calls ONLY our own Next.js `/api/...` routes. P2's server-side proxy forwards them to
// OutSystems and attaches the login token from the httpOnly cookie, so this file never
// sees a token, an OutSystems URL or a tBank/SMULab credential.
//
// Every OutSystems API returns the team envelope: { success, data, errors: [{ code, message }] }.
//
// Mock mode: with NEXT_PUBLIC_USE_MOCK_API=true (see .env.development), calls go to the built-in
// mock API at /api/mock/... instead, so the screens work before the OutSystems backend exists.

export const USE_MOCK_API = process.env.NEXT_PUBLIC_USE_MOCK_API === 'true';
export const API_BASE = USE_MOCK_API ? '/api/mock' : '/api';

export class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // HTTP status (0 = network error)
    this.errors = errors; // envelope errors[] from the backend
  }
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError('Network error. Check your connection and try again.', 0);
  }

  let envelope = null;
  try {
    envelope = await res.json();
  } catch {
    // Non-JSON body (e.g. proxy error page) is handled below as a failed request.
  }

  if (res.status === 401) {
    // Pages send the user to /login (see isSessionExpired below).
    throw new ApiError('Your session has expired. Please log in again.', 401);
  }

  if (!res.ok || !envelope || envelope.success === false) {
    const errors = Array.isArray(envelope?.errors) ? envelope.errors : [];
    const message = errors[0]?.message || `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, errors);
  }

  // A successful call can still carry non-fatal warnings, e.g. { code: 'PARTIAL' } from C5.
  return {
    data: envelope.data,
    warnings: Array.isArray(envelope.errors) ? envelope.errors : [],
  };
}

export const p3Api = {
  /** C5 ViewAccountSummary → { accountId, balance, currency, recentRemittances[], unreadNotifications } */
  getAccountSummary: (opts) => request(`${API_BASE}/account/summary`, opts),

  /** A4 Notification (own inbox) → { items[], total } */
  listNotifications: (page = 1, pageSize = 20, opts) =>
    request(
      `${API_BASE}/notifications?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`,
      opts,
    ),

  /** A4 Notification → { id, isRead } */
  markNotificationRead: (id) =>
    request(`${API_BASE}/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' }),

  /** A4 Notification → { unread } */
  getUnreadCount: (opts) => request(`${API_BASE}/notifications/unread-count`, opts),

  /** C13 RequestOTP → { challengeId, maskedMobile, expiresAt } */
  requestOtp: (purpose, referenceId) =>
    request(`${API_BASE}/otp/challenges`, { method: 'POST', body: { purpose, referenceId } }),
};

/** True when the user must log in again. */
export function isSessionExpired(err) {
  return err instanceof ApiError && err.status === 401;
}

/** Fired after the inbox changes, so the unread badge refreshes immediately. */
export const NOTIFICATIONS_CHANGED_EVENT = 'remitease:notifications-changed';

export function announceNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }
}

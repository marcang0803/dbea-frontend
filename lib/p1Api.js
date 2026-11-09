// P1 API helpers: Sign-up (C1 OnboardSender), Family (C2 ManageFamily) and Top up.
// Login lives in P2's /login page and /api/auth/login route.
//
// Same rules as lib/p3Api.js: the browser calls ONLY our own `/api/...` routes. P2's
// server-side proxy forwards them to OutSystems and attaches the login token from the
// httpOnly cookie, so this file never sees a token, an OutSystems URL or a credential.
//
// Error format: the team uses errors: [{ code, message }]. The current P1 OutSystems
// services still return errors as plain strings (["Incorrect code..."]), so every error
// is normalised here to { code, message }. Pages only ever see the object form.

import { API_BASE, ApiError } from '@/lib/p3Api';

/** Turns any backend error item (string or object) into { code, message }. */
export function normaliseErrors(raw, status) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (typeof e === 'string') return { code: String(status), message: e };
      if (e && typeof e === 'object') {
        return {
          code: String(e.code ?? e.Code ?? status),
          message: String(e.message ?? e.Message ?? ''),
        };
      }
      return null;
    })
    .filter((e) => e && e.message);
}

/** fetch wrapper for P1 calls. Returns { data, warnings }; throws ApiError on failure. */
async function request(path, { method = 'GET', body, signal } = {}) {
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
    // Non-JSON body (e.g. a proxy error page) is treated as a failed request below.
  }

  const errors = normaliseErrors(envelope?.errors, res.status);

  if (res.status === 401) {
    throw new ApiError('Your session has expired. Please log in again.', 401, errors);
  }

  // OutSystems omits `success` when it is false, so the HTTP status decides.
  if (!res.ok || !envelope || envelope.success === false) {
    const message = errors[0]?.message || `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, errors);
  }

  return { data: envelope.data, warnings: errors };
}

export const p1Api = {
  // ---- C1 OnboardSender (public, no login) ----

  /** POST /Onboard/otp → { challengeId, maskedMobile, expiresAt } */
  requestSignupOtp: (mobile) =>
    request(`${API_BASE}/onboard/otp`, { method: 'POST', body: { mobile } }),

  /**
   * POST /Onboard/senders → { senderId, customerId, sgdAccountId, balance? }
   * body: { challengeId, otpCode, username, password, icNumber, documentTypeId, familyName,
   *         givenName, genderId, dateOfBirth, mobile, email, addressLine1, postalCode,
   *         educationLevelId? }
   */
  createSender: (body) => request(`${API_BASE}/onboard/senders`, { method: 'POST', body }),

  // ---- C2 ManageFamily (needs login) ----

  /** GET /Family/payout-options?country= → [{ corridorProductId, country?, partnerName?, payoutCurrency }] */
  getPayoutOptions: (country, opts) =>
    request(
      `${API_BASE}/family/payout-options${country ? `?country=${encodeURIComponent(country)}` : ''}`,
      opts,
    ),

  /**
   * GET /Family/beneficiaries. P2's proxy reshapes the OutSystems array into
   * { items: [{ id, beneficiaryLinkId, nickname, relationshipLabel, accountLast4, payoutCurrency, ... }], total }.
   * Use familyItems(data) to read it.
   */
  listFamily: (opts) => request(`${API_BASE}/family/beneficiaries`, opts),

  /**
   * POST /Family/beneficiaries → { beneficiaryLinkId, nickname, relationship, payoutCurrency }
   * body: { familyName, givenName, relationship, genderId?, country, corridorProductId, accountId, nickname }
   */
  addFamilyMember: (body) => request(`${API_BASE}/family/beneficiaries`, { method: 'POST', body }),

  /** DELETE /Family/beneficiaries/{id} → { removed: true } */
  removeFamilyMember: (beneficiaryLinkId) =>
    request(`${API_BASE}/family/beneficiaries/${encodeURIComponent(beneficiaryLinkId)}`, {
      method: 'DELETE',
    }),

  // ---- Top up (needs login + TOPUP OTP) ----

  /**
   * POST /Account/topup → { amountSGD, newBalance, accountId }
   * body: { amountSGD, requestId, challengeId, otpCode }
   * requestId is the OTP referenceId: the OTP is only valid for this one top-up.
   */
  topUp: ({ amountSGD, requestId, challengeId, otpCode }) =>
    request(`${API_BASE}/account/topup`, {
      method: 'POST',
      body: { amountSGD, requestId, challengeId, otpCode },
    }),
};

// Top-up limits (must match the OutSystems check in /Account/topup).
export const TOPUP_MIN = 10;
export const TOPUP_MAX = 5000;
export const TOPUP_QUICK_AMOUNTS = [50, 100, 200, 500];

/**
 * Family list → [{ id, nickname, relationship, accountLast4, payoutCurrency }].
 * Accepts the proxy shape ({ items }) and the raw OutSystems array.
 */
export function familyItems(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  return list
    .filter((m) => m && m.isActive !== false)
    .map((m) => ({
      id: m.beneficiaryLinkId ?? m.id,
      nickname: m.nickname || 'Family member',
      relationship: m.relationship || m.relationshipLabel || '',
      accountLast4: m.accountLast4 || String(m.accountId ?? '').slice(-4),
      payoutCurrency: m.payoutCurrency || '',
    }));
}

// ---- Form option lists (values match the OutSystems/SMULab ids) ----

export const RELATIONSHIPS = ['Mother', 'Father', 'Son', 'Daughter', 'Spouse', 'Sibling', 'Other'];

export const GENDERS = [
  { id: 1, label: 'Male' },
  { id: 2, label: 'Female' },
];

// SMULab Party document types (Party has no FIN type, so FIN holders use 1).
export const DOCUMENT_TYPES = [
  { id: 1, label: 'NRIC / FIN' },
  { id: 3, label: 'Passport' },
];

// Payout corridors (SGD → local currency). `code` is what we send as `country`;
// `currency` must match the corridor product's PAYOUTCURRENCY in SMULab Product.
export const PAYOUT_COUNTRIES = [
  { code: 'PH', label: 'Philippines', currency: 'PHP' },
  { code: 'IN', label: 'India', currency: 'INR' },
  { code: 'BD', label: 'Bangladesh', currency: 'BDT' },
  { code: 'ID', label: 'Indonesia', currency: 'IDR' },
  { code: 'MY', label: 'Malaysia', currency: 'MYR' },
  { code: 'MM', label: 'Myanmar', currency: 'MMK' },
  { code: 'VN', label: 'Vietnam', currency: 'VND' },
];

/**
 * Keeps only the payout options for one country. Uses the option's `country` when the
 * backend sends it, otherwise its payout currency (the Product COUNTRY attribute may be
 * missing). Never falls back to other countries' options.
 */
export function payoutOptionsFor(options, countryCode) {
  const country = PAYOUT_COUNTRIES.find((c) => c.code === countryCode);
  if (!country || !Array.isArray(options)) return [];
  return options.filter((o) =>
    o?.country
      ? String(o.country).toUpperCase() === country.code ||
        String(o.country).toLowerCase() === country.label.toLowerCase()
      : String(o?.payoutCurrency || '').toUpperCase() === country.currency,
  );
}

// Singapore mobile numbers are sent as +65XXXXXXXX.
export const MOBILE_PREFIX = '+65';

import { ADVANCE_MESSAGES } from '../advanceState.mjs';

const BASE = '/T3RE_Advance_CS/rest/AdvanceAccept';
const integer = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
const keyValid = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
const moneyValid = (value) => /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(String(value)) && Number(value) > 0 && Number(value) <= 1000;
const camelize = (value) => Array.isArray(value) ? value.map(camelize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key[0].toLowerCase() + key.slice(1), camelize(child)])) : value;

function result(status, data = null, code = '', message = '') {
  return { status, body: { success: status >= 200 && status < 300 && !code, data, errors: code ? [{ code, message: message || ADVANCE_MESSAGES[code] || 'Your request could not be completed.' }] : [] } };
}

// Keeps operation IDs and versions even on 409/503. Dropping these would prevent
// safe recovery/cancellation and could encourage a second financial request.
function normalize(status, payload) {
  const data = camelize(payload);
  // Only this proxy can attest that it never forwarded an acceptance.
  if (data && typeof data === 'object') delete data.requestNotForwarded;
  const code = data?.errorCode || (status >= 400 ? data?.errors?.[0]?.code || 'ADVANCE_UNAVAILABLE' : '');
  if (code || data?.success === false) return result(status, data, code || 'ADVANCE_UNAVAILABLE');
  return result(status, data);
}

/** Server-only gateway. Dependencies are injected for HTTP integration tests. */
export function createAdvanceGateway({ baseUrl, serviceKey = '', acceptanceEnabled = false, siteOrigin = '', fetchImpl = fetch, timeoutMs = 90000 }) {
  const base = baseUrl.replace(/\/$/, '');
  let browserOrigin = '';
  try {
    if (siteOrigin) {
      const configured = new URL(siteOrigin);
      if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password || configured.pathname !== '/' || configured.search || configured.hash) throw new Error('Invalid site origin');
      browserOrigin = configured.origin;
    }
  } catch { browserOrigin = null; }
  async function upstream(path, token, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetchImpl(base + path, {
      method,
      headers: { Accept: 'application/json', Token: token, Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('Invalid upstream JSON'); }
    return { status: response.status, payload };
  }

  return async function handle(request, path, token) {
    const joined = path.join('/');
    const isAcceptance = request.method === 'POST' && joined === 'acceptances';
    const reject = (status, code, message) => result(status, isAcceptance ? { requestNotForwarded: true } : null, code, message);
    let acceptanceForwarded = false;
    const statusMatch = joined.match(/^operations\/by-request\/([A-Za-z0-9._:-]{1,100})$/);
    const cancelMatch = joined.match(/^operations\/([1-9]\d*)\/cancel$/);
    const allowed = (request.method === 'GET' && (joined === 'eligibility' || statusMatch)) ||
      (request.method === 'POST' && (joined === 'acceptances' || cancelMatch));
    if (!allowed) return result(404, null, 'NOT_FOUND', 'Advance API route not found.');
    if (!token) return reject(401, 'UNAUTHENTICATED');
    const url = new URL(request.url);
    if (request.method === 'POST' && browserOrigin === null) return reject(503, 'SERVICE_CONFIGURATION');
    if (request.method === 'POST' && (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (request.headers.get('origin') && request.headers.get('origin') !== (browserOrigin || url.origin)))) {
      return reject(403, 'ORIGIN_MISMATCH');
    }
    try {
      const identity = await upstream('/T3RE_Core_AuthAPI/rest/Auth/me', token);
      if (identity.status >= 500) return reject(502, 'AUTH_UNAVAILABLE', 'Login verification is temporarily unavailable.');
      const user = camelize(identity.payload);
      if (identity.status !== 200 || !user?.success || !integer(user.userId)) return reject(401, 'UNAUTHENTICATED');

      if (request.method === 'GET' && joined === 'eligibility') {
        const amount = url.searchParams.get('amount');
        const months = url.searchParams.get('months');
        const snapshotId = url.searchParams.get('snapshotId') || '';
        if (!moneyValid(amount) || !integer(months) || Number(months) > 6 || (snapshotId && !integer(snapshotId))) {
          return result(400, null, 'INVALID_INPUT', 'Enter an amount up to S$1,000 and a term from 1 to 6 months.');
        }
        if (!serviceKey.trim()) return result(503, null, 'SERVICE_CONFIGURATION');
        // Browser-supplied user/account IDs are never forwarded. Core establishes
        // the caller, and Sender supplies that caller's own bank mapping.
        const sender = await upstream(`/T3RE_Sender_AS/rest/Sender/senders/by-user/${user.userId}`, token, {
          headers: { 'X-RE-Service-Key': serviceKey, 'X-RE-User-Id': String(user.userId) },
        });
        const owner = camelize(sender.payload);
        if (sender.status !== 200 || !owner?.success || !String(owner?.data?.sgdAccountId || '').trim()) {
          return result(sender.status >= 400 ? sender.status : 503, null, 'OWNER_BANK_MAPPING', 'Your linked bank account could not be confirmed.');
        }
        const query = new URLSearchParams({ UserId: String(user.userId), tBankAccountId: owner.data.sgdAccountId, RequestedAmount: amount, SelectedTenorMonths: months });
        if (snapshotId) query.set('SnapshotId', snapshotId);
        const offer = await upstream(`/T3RE_Score_CS/rest/ScoreCS/eligibility?${query}`, token);
        const normalized = normalize(offer.status, offer.payload);
        if (normalized.body.success) normalized.body.data = { ...normalized.body.data, acceptanceAvailable: acceptanceEnabled };
        return normalized;
      }

      if (statusMatch) {
        const response = await upstream(`${BASE}/operations/by-request/${encodeURIComponent(statusMatch[1])}`, token);
        return normalize(response.status, response.payload);
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(400, 'INVALID_INPUT', 'Enter the required advance details.');
      if (cancelMatch) {
        if (!integer(cancelMatch[1]) || !integer(body.expectedVersion)) return result(400, null, 'INVALID_INPUT', 'Refresh the request status before canceling.');
        const response = await upstream(`${BASE}/operations/${cancelMatch[1]}/cancel?ExpectedVersion=${body.expectedVersion}`, token, { method: 'POST', body: {} });
        return normalize(response.status, response.payload);
      }

      // Enable only for a ready, authorized demo environment. Normal monthly
      // collection is unavailable; this gate never replaces C9's own checks.
      if (!acceptanceEnabled) return reject(503, 'BORROWING_UNAVAILABLE');
      const requestKey = request.headers.get('Idempotency-Key');
      if (!keyValid(requestKey)) return reject(400, 'INVALID_REQUEST_KEY', 'A request reference is required.');
      if (!moneyValid(body.amount) || !integer(body.months) || Number(body.months) > 6 || !integer(body.snapshotId) ||
        typeof body.challengeId !== 'string' || !body.challengeId.trim() || body.challengeId.length > 50 || !/^\d{6}$/.test(String(body.otpCode)) ||
        !['Owned', 'Rent'].includes(body.residenceStatus) || !Number.isInteger(body.yearsAtResidence) || body.yearsAtResidence < 0 || body.yearsAtResidence > 120 ||
        !Number.isInteger(body.numberOfCreditCards) || body.numberOfCreditCards < 0 || body.numberOfCreditCards > 100 || Number(body.sendToBeneficiaryLinkId || 0) !== 0) {
        return reject(400, 'INVALID_INPUT', 'Check your offer, residence details and six-digit code.');
      }
      acceptanceForwarded = true;
      const response = await upstream(`${BASE}/advances`, token, {
        method: 'POST', headers: { 'Idempotency-Key': requestKey },
        body: { amount: Number(body.amount), months: Number(body.months), snapshotId: String(body.snapshotId), challengeId: body.challengeId, otpCode: String(body.otpCode), residenceStatus: body.residenceStatus, yearsAtResidence: body.yearsAtResidence, numberOfCreditCards: body.numberOfCreditCards, sendToBeneficiaryLinkId: 0 },
      });
      return normalize(response.status, response.payload);
    } catch {
      // Never retry a POST after an ambiguous response. The client retains its
      // original request key and performs only a status GET to recover.
      return result(502, isAcceptance && !acceptanceForwarded ? { requestNotForwarded: true } : null, 'ADVANCE_UNAVAILABLE', 'We could not confirm the response. Check your request status before trying again.');
    }
  };
}

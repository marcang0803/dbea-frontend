import { ApiError } from '@/lib/p3Api';
import { isAdvanceOperation } from '@/lib/advanceState.mjs';

export class AdvanceApiError extends ApiError {
  constructor(message, status, errors = [], data = null) {
    super(message, status, errors);
    this.data = data;
    this.code = errors[0]?.code || '';
  }
}

async function call(path, { method = 'GET', body, requestKey, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin', cache: 'no-store', signal,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(requestKey ? { 'Idempotency-Key': requestKey } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new AdvanceApiError('The response could not be confirmed. Check your request status before trying again.', 0);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new AdvanceApiError(payload?.errors?.[0]?.message || 'Advance services are unavailable.', response.status, payload?.errors || [], payload?.data);
  }
  return payload.data;
}

async function callOperation(path, options) {
  const data = await call(path, options);
  if (!isAdvanceOperation(data)) {
    throw new AdvanceApiError('The response could not be confirmed. Check your request status before trying again.', 502);
  }
  return data;
}

// P6 always uses the authenticated real proxy. It must not combine a mock OTP
// challenge with a real bank acceptance when the other dev screens use mocks.
export const p6Api = {
  getIdentity: async () => {
    const data = await call('/api/auth/me');
    if (!Number.isSafeInteger(Number(data?.userId)) || Number(data.userId) <= 0) {
      throw new AdvanceApiError('Your account could not be verified. Please try again.', 502);
    }
    return String(data.userId);
  },
  getActiveAdvances: async (options) => {
    const data = await call('/api/advance/active', options);
    if (typeof data?.hasActiveAdvance !== 'boolean') throw new AdvanceApiError('Your existing advances could not be checked. Please try again.', 502);
    return data;
  },
  getOffer: ({ amount, months, snapshotId = '' }, options) => call(`/api/advance/eligibility?${new URLSearchParams({ amount, months, ...(snapshotId ? { snapshotId } : {}) })}`, options),
  accept: (body, requestKey) => callOperation('/api/advance/acceptances', { method: 'POST', body, requestKey }),
  getStatus: (requestKey, options) => callOperation(`/api/advance/operations/by-request/${encodeURIComponent(requestKey)}`, options),
  getCurrent: (options) => callOperation('/api/advance/operations/current', options),
  resumeFunding: (operationId, body) => callOperation(`/api/advance/operations/${operationId}/resume-funding`, { method: 'POST', body }),
  cancel: (operationId, expectedVersion) => callOperation(`/api/advance/operations/${operationId}/cancel`, { method: 'POST', body: { expectedVersion } }),
  requestOtp: (purpose, referenceId) => call('/api/otp/challenges', { method: 'POST', body: { purpose, referenceId } }),
};

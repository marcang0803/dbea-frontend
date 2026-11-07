// P5 advance APIs. Browser requests go through the local Next.js proxy only.

import { API_BASE, ApiError, request, USE_MOCK_API } from '@/lib/p3Api';
import { p3Api } from '@/lib/p3Api';

function withQuery(path, values) {
  const query = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  return `${path}?${query.toString()}`;
}

export function normalizeBand(value) {
  const band = String(value ?? '').trim().replace(/^band(?:\s+|$)/i, '').trim();
  return band || '—';
}

export async function getAdvanceUserId(opts) {
  const authPath = USE_MOCK_API ? `${API_BASE}/auth/me` : '/api/auth/me';
  const { data } = await request(authPath, opts);
  const userId = data?.userId;

  if (userId == null) {
    throw new ApiError('Your user details are not available.', 502);
  }

  return userId;
}

export async function getAdvanceContext(opts) {
  const [userId, account] = await Promise.all([
    getAdvanceUserId(opts),
    p3Api.getAccountSummary(opts),
  ]);
  const tBankAccountId = account.data?.accountId;

  if (!tBankAccountId) {
    throw new ApiError('Your account details are not available.', 502);
  }

  return { userId, tBankAccountId };
}

export const p5Api = {
  getMyAdvanceData: (userId, opts) =>
    request(withQuery(`${API_BASE}/advances/me`, { UserId: userId }), opts),

  createScoreSnapshot: (userId, tBankAccountId, opts) =>
    request(
      withQuery(`${API_BASE}/score`, {
        UserId: userId,
        tBankAccountId,
      }),
      { ...opts, method: 'POST' },
    ),

  checkEligibility: (
    { userId, tBankAccountId, requestedAmount, selectedTenorMonths, snapshotId },
    opts,
  ) =>
    request(
      withQuery(`${API_BASE}/eligibility`, {
        UserId: userId,
        tBankAccountId,
        RequestedAmount: requestedAmount,
        SelectedTenorMonths: selectedTenorMonths,
        SnapshotId: snapshotId,
      }),
      opts,
    ),

};

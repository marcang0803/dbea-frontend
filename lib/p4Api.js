// P4 rate-lock and rate-alert API helpers.
//
// Browser code calls only the local Next.js /api routes.
// The server-side proxy attaches the authenticated user's token and forwards
// the requests to the relevant OutSystems modules.

import { API_BASE, request } from '@/lib/p3Api';

export const p4Api = {
  /**
   * C6 PreviewLock
   * Returns: { forwardRate, recipientAmount, maturityDate }
   */
  previewLock: ({ beneficiaryLinkId, amountSGD, period }) =>
    request(`${API_BASE}/rates/locks/preview`, {
      method: 'POST',
      body: {
        beneficiaryLinkId,
        amountSGD,
        period,
      },
    }),

  /**
   * C6 CreateLock
   * The referenceId must be exactly the same value used when requesting
   * the LOCK OTP challenge.
   */
  createLock: ({
    beneficiaryLinkId,
    amountSGD,
    period,
    challengeId,
    otpCode,
    referenceId,
  }) =>
    request(`${API_BASE}/rates/locks`, {
      method: 'POST',
      body: {
        beneficiaryLinkId,
        amountSGD,
        period,
        challengeId,
        otpCode,
        referenceId,
      },
    }),

  /**
   * C6 GetMyLocks
   * Returns the authenticated user's rate locks.
   */
  listLocks: (opts) => request(`${API_BASE}/rates/locks`, opts),

  /**
   * A5 GetMyAlerts
   * Returns the authenticated user's rate alerts.
   */
  listAlerts: (opts) => request(`${API_BASE}/rates/alerts`, opts),

  /**
   * A5 CreateAlert
   */
  createAlert: ({ corridor, targetRate }) =>
    request(`${API_BASE}/rates/alerts`, {
      method: 'POST',
      body: {
        corridor,
        targetRate,
      },
    }),

  /**
   * A5 DeleteAlert
   */
  deleteAlert: (alertId) =>
    request(`${API_BASE}/rates/alerts/${encodeURIComponent(alertId)}`, {
      method: 'DELETE',
    }),
};
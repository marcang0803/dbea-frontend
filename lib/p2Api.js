// P2 remittance API helpers.
// Browser code only calls the local Next.js /api routes. The real proxy will
// attach authentication and forward these requests to OutSystems later.

import { API_BASE, request } from '@/lib/p3Api';

export const p2Api = {
  listBeneficiaries: (opts) => request(`${API_BASE}/beneficiaries`, opts),

  createQuote: (beneficiaryLinkId, amountSGD) =>
    request(`${API_BASE}/remittance/quotes`, {
      method: 'POST',
      body: { beneficiaryLinkId, amountSGD },
    }),

  getQuote: (quoteId, opts) =>
    request(`${API_BASE}/remittance/quotes/${encodeURIComponent(quoteId)}`, opts),

  sendRemittance: (quoteId, challengeId, otpCode) =>
    request(`${API_BASE}/remittance/${encodeURIComponent(quoteId)}/send`, {
      method: 'POST',
      body: { challengeId, otpCode },
    }),
};

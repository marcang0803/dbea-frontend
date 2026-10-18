// In-memory data for the mock API (dev only). Shapes follow the P3 contracts in the
// P3 build guide (A4 Notification, C5 ViewAccountSummary, C13 RequestOTP).
// Kept on globalThis so it survives hot reloads; restart `npm run dev` to reset it.

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

function seed() {
  return {
    account: { accountId: '0000006066', balance: 1734.98, currency: 'SGD' },
    remittances: [
      { id: 105, nickname: 'Mum', amountSGD: 500, recipientAmount: 21264, payoutCurrency: 'PHP', status: 'COMPLETED', createdOn: minutesAgo(35) },
      { id: 104, nickname: 'Brother', amountSGD: 200, recipientAmount: 8505.4, payoutCurrency: 'PHP', status: 'DEBITED', createdOn: minutesAgo(60 * 26) },
      { id: 103, nickname: 'Mum', amountSGD: 450, recipientAmount: 19130.5, payoutCurrency: 'PHP', status: 'COMPLETED', createdOn: minutesAgo(60 * 24 * 30) },
      { id: 102, nickname: 'Daughter', amountSGD: 150, recipientAmount: null, payoutCurrency: 'PHP', status: 'FAILED', createdOn: minutesAgo(60 * 24 * 41) },
      { id: 101, nickname: 'Mum', amountSGD: 400, recipientAmount: 17020, payoutCurrency: 'PHP', status: 'COMPLETED', createdOn: minutesAgo(60 * 24 * 60) },
    ],
    notifications: [
      { id: 7, type: 'RECEIPT', title: 'Sent to Mum', message: 'PHP 21,264.00 is on its way to Mum.', link: '/home', isRead: false, createdOn: minutesAgo(35) },
      { id: 6, type: 'RATE_ALERT', title: '1 SGD = 44.05 PHP', message: 'Your target rate was reached. Tap to lock it.', link: '/rates/lock?corridor=SGD-PHP', isRead: false, createdOn: minutesAgo(90) },
      { id: 5, type: 'LOCK', title: 'Rate locked', message: 'S$400 locked at 43.90 PHP until 18 Nov.', link: '/rates/locks', isRead: true, createdOn: minutesAgo(60 * 24 * 2) },
      { id: 4, type: 'ADVANCE', title: 'Advance approved', message: 'S$400 was sent to Mum. First instalment due 3 Nov.', link: '/advance/me', isRead: true, createdOn: minutesAgo(60 * 24 * 5) },
      { id: 3, type: 'REPAYMENT', title: 'Instalment paid', message: 'S$136.20 paid. 2 instalments left.', link: '/advance/me', isRead: true, createdOn: minutesAgo(60 * 24 * 12) },
    ],
    nextNotificationId: 8,
    challenges: new Map(), // challengeId → { purpose, referenceId, expiresAt, attempts, used }
  };
}

export const store = (globalThis.__remiteaseMockStore ??= seed());

export const MOCK_OTP = {
  CORRECT_CODE: '123456',
  FORCE_EXPIRED_CODE: '000000', // lets you see the "expired" path without waiting 10 minutes
  MAX_ATTEMPTS: 5,
  TTL_MS: 10 * 60_000,
};

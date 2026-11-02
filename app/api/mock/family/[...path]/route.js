// P1 mock: C2 ManageFamily. Mirrors T3RE_Sender_CS /Family as seen THROUGH P2's proxy
// (the proxy reshapes GET /beneficiaries into { items, total }).
//
//   GET    /api/mock/family/payout-options?country=  → [{ corridorProductId, country, partnerName, payoutCurrency }]
//   GET    /api/mock/family/beneficiaries            → { items: [...], total }
//   POST   /api/mock/family/beneficiaries            → 201 { beneficiaryLinkId, nickname, relationship, payoutCurrency }
//   DELETE /api/mock/family/beneficiaries/{id}       → { removed: true }
//
// This route is more specific than app/api/mock/[...path], so it handles every family/* call.
// It uses the shared store.beneficiaries list, so P2's Send mock sees the same people.

import { family, mock, p1Store } from '@/lib/mock/p1MockStore';
import { RELATIONSHIPS } from '@/lib/p1Api';

async function handle(request, { params }) {
  if (!mock.enabled()) return mock.fail(404, 'NOT_FOUND', 'Mock API is disabled.');
  const { path } = await params;
  const route = `${request.method} ${path.join('/')}`;
  const url = new URL(request.url);
  await mock.delay();

  if (route === 'GET payout-options') {
    const country = url.searchParams.get('country');
    return mock.ok(p1Store.payoutOptions.filter((o) => !country || o.country === country));
  }

  if (route === 'GET beneficiaries') {
    const items = family()
      .filter((f) => f.isActive)
      .map((f) => ({ ...f, beneficiaryLinkId: f.id, relationship: f.relationship ?? f.relationshipLabel }));
    return mock.ok({ items, total: items.length });
  }

  if (route === 'POST beneficiaries') {
    const b = await mock.body(request);
    const nickname = String(b.nickname ?? '').trim();
    const accountId = String(b.accountId ?? '').trim();
    if (!RELATIONSHIPS.includes(b.relationship) || !/^\d{6,20}$/.test(accountId) || !nickname ||
        !String(b.familyName ?? '').trim() || !String(b.givenName ?? '').trim()) {
      return mock.fail(400, 'VALIDATION_ERROR', 'Invalid relationship, account or nickname');
    }
    const option = p1Store.payoutOptions.find((o) => o.corridorProductId === b.corridorProductId);
    if (!option) return mock.fail(400, 'UNKNOWN_PAYOUT_OPTION', 'Unknown payout option');
    if (family().some((f) => f.isActive && f.accountId === accountId)) {
      return mock.fail(409, 'DUPLICATE_ACCOUNT', 'This account is already saved');
    }
    const id = Math.max(300, ...family().map((f) => Number(f.id) || 0)) + 1;
    family().push({
      id,
      nickname,
      relationship: b.relationship,
      relationshipLabel: b.relationship,
      bankName: option.partnerName,
      accountId,
      accountLast4: accountId.slice(-4),
      payoutCurrency: option.payoutCurrency,
      corridorProductId: option.corridorProductId,
      isActive: true,
    });
    return mock.ok({ beneficiaryLinkId: id, nickname, relationship: b.relationship, payoutCurrency: option.payoutCurrency }, 201);
  }

  if (request.method === 'DELETE' && path[0] === 'beneficiaries' && path.length === 2) {
    const member = family().find((f) => f.isActive && String(f.id) === path[1]);
    if (!member) return mock.fail(404, 'NOT_FOUND', 'Family member not found');
    member.isActive = false; // soft delete, like A2
    return mock.ok({ removed: true });
  }

  return mock.fail(404, 'NOT_FOUND', `No mock for ${route}`);
}

export { handle as GET, handle as POST, handle as DELETE };

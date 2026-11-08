import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createAdvanceGateway } from '../lib/server/advanceGateway.mjs';
import { acceptanceView, canCancelAcceptance, canDiscardUnsubmittedAcceptance, canResumeAcceptanceFunding } from '../lib/advanceState.mjs';
import { safeLoginReturn, advanceReturnPath } from '../lib/loginReturn.mjs';

// Local HTTP provider, not a replacement bank. Shapes are based on the captured
// 6 November dev responses. No test calls a real bank, OTP or notification API.
test('P6 gateway over HTTP: identity, recovery and financial boundaries', async (t) => {
  const calls = [];
  let mode = 'normal';
  const server = http.createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const url = new URL(request.url, 'http://test-provider');
    calls.push({ method: request.method, url, headers: request.headers, body: raw ? JSON.parse(raw) : null });
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (url.pathname.endsWith('/Auth/me')) return json(200, { Success: mode !== 'expired', UserId: mode === 'expired' ? 0 : 51178 });
    if (url.pathname.endsWith('/senders/by-user/51178')) return json(200, { success: true, data: { tBankCustomerId: '0000003203', sgdAccountId: '0000006729' } });
    if (url.pathname.endsWith('/Advance/advances')) return json(mode === 'active-unavailable' ? 503 : 200, { Success: true, Data: mode === 'active-empty' ? [] : [{ Id: 14, UserId: mode === 'active-wrong-owner' ? 999 : 51178, Status: 'ACTIVE' }], Errors: [] });
    if (url.pathname.endsWith('/ScoreCS/advances/me')) return json(200, { UserIdOut: 51178, LatestScore: 99, LatestBand: 'A', advances: [{ Id: 14, UserId: 51178, Status: 'ACTIVE', ...(mode.startsWith('records-') ? { Repayments: [{ Id: 7, AdvanceId: mode === 'records-bound' ? 14 : 15, UserId: 51178 }] } : {}) }, { Id: 15, UserId: 999, Status: 'ACTIVE' }] });
    if (url.pathname.endsWith('/ScoreCS/eligibility')) return json(200, { IsEligible: true, IsSnapshotValid: true, OutSnapshotId: 66, SelectedPlanAmount: 100, SelectedTenor: Number(url.searchParams.get('SelectedTenorMonths')), MonthlyInstalment: 100.6 / Number(url.searchParams.get('SelectedTenorMonths')), Interest: 0.6, InterestRate: 0.0477, ApprovedBand: 'Band B', MaxAdvanceAmount: 500, MaturityDate: '2027-01-06' });
    if (request.method === 'POST' && url.pathname.endsWith('/AdvanceAccept/advances')) {
      if (mode === 'demo-funding-pending') return json(502, { operationId: 6, status: 'DEPOSIT_IN_FLIGHT', version: 8, loanAccountId: 'test-loan-6782', needsReconciliation: true, dispatchOutstanding: true, errorCode: 'DEMO_FUNDING_RECONCILIATION_REQUIRED' });
      if (mode === 'timeout-after-accept') return; // Request arrived; result is unknown to the caller.
      if (mode === 'html-after-accept') { response.writeHead(500, { 'Content-Type': 'text/html' }); return response.end('<h1>Proxy error</h1>'); }
      return json(503, { operationId: 6, status: 'RECEIVED', errorCode: 'INTEREST_REPAYMENT_CONTRACT_PENDING', version: 1, ...(mode === 'forged-local-proof' ? { requestNotForwarded: true } : {}) });
    }
    if (url.pathname.includes('/operations/by-request/') || url.pathname.endsWith('/operations/current')) return json(200, { success: true, operationId: 6, status: 'RECEIVED', version: 1, canResumeFunding: true });
    if (url.pathname.endsWith('/operations/11/resume-funding')) return json(502, { operationId: 11, status: 'DEPOSIT_IN_FLIGHT', version: 13, needsReconciliation: true, errorCode: 'DEMO_FUNDING_RECONCILIATION_REQUIRED' });
    if (url.pathname.endsWith('/operations/6/cancel')) return json(200, { success: true, operationId: 6, status: 'CANCELED', version: 2 });
    return json(501, { errorCode: 'UNMODELED_TEST_ENDPOINT' });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const gateway = (extra = {}) => createAdvanceGateway({ baseUrl, serviceKey: 'test-team-key', acceptanceEnabled: true, ...extra });
  const make = (path, body, extra = {}) => new Request(`http://localhost:3000/api/advance/${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': 'stable-request-key' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const body = { amount: 100, months: 3, snapshotId: '66', challengeId: 'test-challenge', otpCode: '123456', residenceStatus: 'Rent', yearsAtResidence: 2, numberOfCreditCards: 0 };
  const financialCalls = () => calls.filter((c) => c.method === 'POST' && c.url.pathname.endsWith('/AdvanceAccept/advances'));

  await t.test('active lookup derives the owner and returns only availability', async () => {
    calls.length = 0;
    mode = 'normal';
    const result = await gateway()(make('active?userId=999&status=CLOSED'), ['active'], 'test-session');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data, { hasActiveAdvance: true });
    const lookup = calls.at(-1);
    assert.equal(lookup.url.searchParams.get('userId'), '51178');
    assert.equal(lookup.url.searchParams.get('status'), 'ACTIVE');
    assert.equal(lookup.headers['x-re-user-id'], '51178');
    assert.equal(lookup.headers['x-re-service-key'], 'test-team-key');
    assert.equal(lookup.headers.authorization, 'Bearer test-session');
    assert(calls.every(call => call.method === 'GET'));
  });

  await t.test('active lookup distinguishes an empty result from failed or wrong-owner results', async () => {
    for (const [scenario, status] of [['active-empty', 200], ['active-unavailable', 502], ['active-wrong-owner', 502]]) {
      mode = scenario;
      const result = await gateway()(make('active'), ['active'], 'test-session');
      assert.equal(result.status, status);
      if (status === 200) assert.deepEqual(result.body.data, { hasActiveAdvance: false });
      else assert.equal(result.body.data, null);
    }
    const missingKey = await gateway({ serviceKey: '' })(make('active'), ['active'], 'test-session');
    assert.equal(missingKey.status, 503);
    mode = 'normal';
  });

  await t.test('My Advance proxy removes other-owner records and unscoped score summaries', async () => {
    const result = await gateway()(make('records?UserId=999'), ['records'], 'test-session');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data.advances, [{ id: 14, userId: 51178, status: 'ACTIVE' }]);
    assert.equal(result.body.data.latestScore, undefined);
    assert.equal(result.body.data.latestBand, undefined);
    assert.equal(calls.at(-1).url.searchParams.get('UserId'), '51178');
  });

  await t.test('My Advance accepts bound history and rejects history for another advance', async () => {
    mode = 'records-bound';
    const bound = await gateway()(make('records'), ['records'], 'test-session');
    assert.equal(bound.status, 200);
    assert.equal(bound.body.data.advances[0].repayments[0].advanceId, 14);
    mode = 'records-foreign-history';
    const foreign = await gateway()(make('records'), ['records'], 'test-session');
    assert.equal(foreign.status, 502);
    assert.equal(foreign.body.data, null);
    mode = 'normal';
  });

  await t.test('missing session never contacts a provider', async () => {
    calls.length = 0;
    const result = await gateway()(make('eligibility?amount=100&months=3'), ['eligibility'], '');
    assert.equal(result.status, 401); assert.equal(calls.length, 0);
  });
  await t.test('expired identity stops before owner lookup', async () => {
    calls.length = 0; mode = 'expired';
    const result = await gateway()(make('eligibility?amount=100&months=3'), ['eligibility'], 'test-token');
    assert.equal(result.status, 401); assert.equal(calls.length, 1); mode = 'normal';
  });
  await t.test('eligibility binds caller/account server-side despite spoofed query', async () => {
    calls.length = 0;
    const result = await gateway()(make('eligibility?amount=100&months=3&UserId=999&tBankAccountId=foreign'), ['eligibility'], 'test-token');
    assert.equal(result.status, 200); assert.equal(result.body.data.outSnapshotId, 66);
    const sender = calls.find((c) => c.url.pathname.includes('/senders/'));
    assert.equal(sender.headers['x-re-user-id'], '51178'); assert.equal(sender.headers['x-re-service-key'], 'test-team-key');
    const score = calls.find((c) => c.url.pathname.endsWith('/eligibility'));
    assert.equal(score.url.searchParams.get('UserId'), '51178'); assert.equal(score.url.searchParams.get('tBankAccountId'), '0000006729');
    assert.equal(result.body.data.monthlyInstalment, 100.6 / 3);
  });
  await t.test('P5 plan terms 3, 6 and 12 reach quote and acceptance unchanged', async () => {
    for (const months of [3, 6, 12]) {
      calls.length = 0;
      const quote = await gateway()(make(`eligibility?amount=100&months=${months}`), ['eligibility'], 'test-token');
      assert.equal(quote.status, 200); assert.equal(quote.body.data.selectedTenor, months);
      assert.equal(calls.at(-1).url.searchParams.get('SelectedTenorMonths'), String(months));
      calls.length = 0;
      await gateway()(make('acceptances', { ...body, months }), ['acceptances'], 'test-token');
      assert.equal(calls.filter(c => c.method === 'POST').length, 1);
      assert.equal(calls.at(-1).body.months, months);
    }
  });
  await t.test('unoffered terms stop before quote or financial forwarding', async () => {
    for (const months of [0, 1, 2, 4, 5, 7, 11, 13]) {
      calls.length = 0;
      const quote = await gateway()(make(`eligibility?amount=100&months=${months}`), ['eligibility'], 'test-token');
      assert.equal(quote.status, 400); assert.equal(calls.length, 1);
      calls.length = 0;
      const acceptance = await gateway()(make('acceptances', { ...body, months }), ['acceptances'], 'test-token');
      assert.equal(acceptance.status, 400); assert.equal(calls.filter(c => c.method === 'POST').length, 0);
    }
  });
  await t.test('disabled borrowing cannot be enabled by a browser field', async () => {
    calls.length = 0;
    const result = await gateway({ acceptanceEnabled: false })(make('acceptances', { ...body, acceptanceEnabled: true }), ['acceptances'], 'test-token');
    assert.equal(result.status, 503); assert.equal(result.body.errors[0].code, 'BORROWING_UNAVAILABLE'); assert.equal(financialCalls().length, 0);
  });
  await t.test('invalid monetary precision never reaches eligibility', async () => {
    calls.length = 0;
    const result = await gateway()(make('eligibility?amount=100.001&months=3'), ['eligibility'], 'test-token');
    assert.equal(result.status, 400); assert.equal(calls.length, 1);
  });
  await t.test('503 retains operation/version and original idempotency key', async () => {
    calls.length = 0;
    const result = await gateway()(make('acceptances', { ...body, userId: 999, serviceKey: 'injected' }), ['acceptances'], 'test-token');
    assert.equal(result.status, 503); assert.equal(result.body.success, false);
    assert.equal(result.body.data.operationId, 6); assert.equal(result.body.data.version, 1);
    assert.equal(result.body.errors[0].code, 'INTEREST_REPAYMENT_CONTRACT_PENDING');
    assert.equal(financialCalls().length, 1); assert.equal(financialCalls()[0].headers['idempotency-key'], 'stable-request-key');
    assert.equal(financialCalls()[0].body.userId, undefined); assert.equal(financialCalls()[0].body.serviceKey, undefined);
  });

  await t.test('uncertain demo deposit preserves its journal and never retries acceptance', async () => {
    calls.length = 0; mode = 'demo-funding-pending';
    const result = await gateway()(make('acceptances', body), ['acceptances'], 'test-token');
    assert.equal(result.status, 502);
    assert.equal(result.body.data.status, 'DEPOSIT_IN_FLIGHT');
    assert.equal(result.body.data.operationId, 6);
    assert.equal(result.body.data.version, 8);
    assert.equal(result.body.data.needsReconciliation, true);
    assert.equal(result.body.data.dispatchOutstanding, true);
    assert.equal(result.body.data.loanAccountId, 'test-loan-6782');
    assert.equal(result.body.errors[0].code, 'DEMO_FUNDING_RECONCILIATION_REQUIRED');
    assert.match(result.body.errors[0].message, /deposit needs checking/);
    assert.equal(financialCalls().length, 1);
    assert.equal(financialCalls()[0].headers['idempotency-key'], 'stable-request-key');
    mode = 'normal';
  });
  await t.test('cross-origin mutation is denied before authentication/provider calls', async () => {
    calls.length = 0;
    const result = await gateway()(make('acceptances', body, { Origin: 'https://unrelated.example' }), ['acceptances'], 'test-token');
    assert.equal(result.status, 403); assert.equal(calls.length, 0);
    assert.equal(result.body.errors[0].code, 'ORIGIN_MISMATCH');
    assert.equal(canDiscardUnsubmittedAcceptance(result.body.data, false), true);
  });
  await t.test('configured browser origin accepts loopback even when Next uses localhost internally', async () => {
    calls.length = 0;
    const result = await gateway({ siteOrigin: 'http://127.0.0.1:3086' })(make('acceptances', body, { Origin: 'http://127.0.0.1:3086', 'Sec-Fetch-Site': 'same-origin' }), ['acceptances'], 'test-token');
    assert.equal(result.status, 503); assert.equal(result.body.data.operationId, 6);
    assert.equal(financialCalls().length, 1);
    assert.equal(canDiscardUnsubmittedAcceptance(result.body.data, false), false);
  });
  await t.test('configured origin is not overridden by forwarded headers or a different scheme/port', async () => {
    for (const origin of ['https://unrelated.example', 'https://127.0.0.1:3086', 'http://127.0.0.1:3087', 'http://localhost:3000']) {
      calls.length = 0;
      const result = await gateway({ siteOrigin: 'http://127.0.0.1:3086' })(make('acceptances', body, { Origin: origin, 'X-Forwarded-Host': new URL(origin).host, 'X-Forwarded-Proto': new URL(origin).protocol.slice(0, -1) }), ['acceptances'], 'test-token');
      assert.equal(result.status, 403); assert.equal(calls.length, 0);
      assert.equal(result.body.data.requestNotForwarded, true);
    }
  });
  await t.test('cross-site indication and malformed server origin fail closed', async () => {
    for (const options of [{ siteOrigin: 'http://127.0.0.1:3086', crossSite: true }, { siteOrigin: 'https://example.com/extra' }]) {
      calls.length = 0;
      const result = await gateway(options)(make('acceptances', body, { Origin: 'http://127.0.0.1:3086', ...(options.crossSite ? { 'Sec-Fetch-Site': 'cross-site' } : {}) }), ['acceptances'], 'test-token');
      assert.ok([403, 503].includes(result.status)); assert.equal(calls.length, 0);
      assert.equal(result.body.data.requestNotForwarded, true);
    }
  });
  await t.test('a downstream response cannot claim that the proxy never forwarded it', async () => {
    calls.length = 0; mode = 'forged-local-proof';
    const result = await gateway()(make('acceptances', body), ['acceptances'], 'test-token');
    assert.equal(financialCalls().length, 1);
    assert.notEqual(result.body.data.requestNotForwarded, true);
    assert.equal(canDiscardUnsubmittedAcceptance(result.body.data, false), false);
    mode = 'normal';
  });
  await t.test('unrecognized paths do not become an arbitrary backend proxy', async () => {
    calls.length = 0;
    const result = await gateway()(make('operations/by-request/x'), ['operations', 'by-request', '../../foreign'], 'test-token');
    assert.equal(result.status, 404); assert.equal(calls.length, 0);
  });
  await t.test('cancellation preserves expected version and uses the owner session', async () => {
    calls.length = 0;
    const result = await gateway()(make('operations/6/cancel', { expectedVersion: 1 }), ['operations', '6', 'cancel'], 'test-token');
    assert.equal(result.body.data.status, 'CANCELED');
    const cancel = calls.at(-1); assert.equal(cancel.url.searchParams.get('ExpectedVersion'), '1'); assert.equal(cancel.headers.authorization, 'Bearer test-token');
  });
  await t.test('active lookup uses the current bearer only and disabled acceptance hides funding confirmation', async () => {
    calls.length = 0;
    const read = await gateway({ acceptanceEnabled: false })(make('operations/current?UserId=999'), ['operations', 'current'], 'test-token');
    assert.equal(read.body.data.canResumeFunding, false);
    assert.equal(calls.at(-1).url.search, '');
    assert.equal(calls.at(-1).headers.authorization, 'Bearer test-token');
    assert(calls.every(c => c.method === 'GET'));
  });
  await t.test('funding resume forwards only fresh code/version to the existing operation and never retries', async () => {
    calls.length = 0;
    const body = { expectedVersion: 9, challengeId: 'new-funding-challenge', otpCode: '111111', amount: 999, userId: 999, loanAccountId: 'other-loan' };
    const reply = await gateway()(make('operations/11/resume-funding', body), ['operations', '11', 'resume-funding'], 'test-token');
    assert.equal(reply.status, 502);
    assert.equal(reply.body.data.operationId, 11);
    assert.equal(calls.filter(c => c.method === 'POST').length, 1);
    assert.deepEqual(calls.at(-1).body, { expectedVersion: 9, challengeId: 'new-funding-challenge', code: '111111' });
    calls.length = 0;
    const disabled = await gateway({ acceptanceEnabled: false })(make('operations/11/resume-funding', body), ['operations', '11', 'resume-funding'], 'test-token');
    assert.equal(disabled.status, 503);
    assert(calls.every(c => c.method === 'GET'));
  });
  await t.test('HTML after a submitted request causes no automatic retry', async () => {
    calls.length = 0; mode = 'html-after-accept';
    const result = await gateway()(make('acceptances', body), ['acceptances'], 'test-token');
    assert.equal(result.status, 502); assert.equal(financialCalls().length, 1); mode = 'normal';
    assert.equal(canDiscardUnsubmittedAcceptance(result.body.data, false), false);
  });
  await t.test('timeout after receipt is unknown, then recovery uses a GET only', async () => {
    calls.length = 0; mode = 'timeout-after-accept';
    const result = await gateway({ timeoutMs: 100 })(make('acceptances', body), ['acceptances'], 'test-token');
    assert.equal(result.status, 502); assert.equal(financialCalls().length, 1);
    assert.equal(canDiscardUnsubmittedAcceptance(result.body.data, false), false);
    mode = 'normal';
    const recovered = await gateway()(make('operations/by-request/stable-request-key'), ['operations', 'by-request', 'stable-request-key'], 'test-token');
    assert.equal(recovered.body.data.status, 'RECEIVED'); assert.equal(financialCalls().length, 1);
  });
});

test('only a first locally rejected attempt permits releasing its reference', () => {
  assert.equal(canDiscardUnsubmittedAcceptance({ requestNotForwarded: true }, false), true);
  assert.equal(canDiscardUnsubmittedAcceptance({ requestNotForwarded: true }, true), false);
  assert.equal(canDiscardUnsubmittedAcceptance({ requestNotForwarded: true, operationId: 6 }, false), false);
  for (const data of [null, {}, { status: 'UNKNOWN' }, { errorCode: 'FORBIDDEN' }, { errorCode: 'NOT_FOUND' }]) {
    assert.equal(canDiscardUnsubmittedAcceptance(data, false), false);
  }
  assert.equal(acceptanceView({ status: 'NOT_SUBMITTED', errorCode: 'ORIGIN_MISMATCH' }).title, 'Request not submitted');
  assert.equal(acceptanceView({ status: 'UNKNOWN', errorCode: 'REQUEST_NOT_VISIBLE' }).title, 'Request status unavailable');
});

test('a successful HTTP response or loan reference alone never means funded success', () => {
  assert.equal(acceptanceView({ success: true, status: 'RECEIVED' }).tone, 'pending');
  assert.equal(acceptanceView({ status: 'A8_ACTIVATION_PENDING', loanAccountId: 'loan' }).tone, 'pending');
  assert.equal(acceptanceView({ status: 'COMPLETED', advanceId: 0, loanAccountId: 'loan' }).tone, 'pending');
  assert.equal(acceptanceView({ status: 'COMPLETED', advanceId: 8, loanAccountId: 'loan' }).tone, 'success');
  assert.equal(canCancelAcceptance({ status: 'RECEIVED', operationId: 6, version: 1 }), true);
  assert.equal(canCancelAcceptance({ status: 'RECEIVED', operationId: 6, version: 1, needsReconciliation: true }), false);
  assert.equal(canCancelAcceptance({ status: 'RECEIVED', operationId: 6, version: 1, dispatchOutstanding: true }), false);
  assert.equal(canCancelAcceptance({ status: 'RECEIVED', operationId: 6, version: 1, loanAccountId: 'loan' }), false);
  assert.equal(canCancelAcceptance({ status: 'RECEIVED', operationId: 6, version: 1, advanceId: 8 }), false);
  assert.equal(canCancelAcceptance({ status: 'RECONCILE', operationId: 6, version: 1 }), false);
});

test('login returns to the requested app page and rejects external or executable destinations', () => {
  assert.equal(safeLoginReturn('/send/confirm?quoteId=quote-1'), '/send/confirm?quoteId=quote-1');
  for (const value of [null, '', 'https://other.example', '//other.example', '/\\other.example', 'javascript:alert(1)', '/\n/other.example', '/%2f%2fother.example', '/api/auth/logout', '/login?next=/login', '/advance/../../api/auth/logout']) {
    assert.equal(safeLoginReturn(value), '/home', String(value));
  }
});

test('login preserves offer inputs but a pending request resumes only its original reference', () => {
  const draft = advanceReturnPath({ amount: '125.50', months: '3', snapshotId: '66' });
  const loginUrl = new URL(`/login?${new URLSearchParams({ next: draft })}`, 'http://localhost');
  const returned = safeLoginReturn(loginUrl.searchParams.get('next'));
  const query = new URL(returned, 'http://localhost').searchParams;
  assert.equal(query.get('amount'), '125.50');
  assert.equal(query.get('months'), '3');
  assert.equal(query.get('snapshotId'), '66');
  const pending = advanceReturnPath({ amount: '999', months: '6', requestKey: 'same-request:1' });
  assert.equal(safeLoginReturn(pending), '/advance/accept?requestKey=same-request%3A1');
  assert.equal(new URL(pending, 'http://localhost').searchParams.has('amount'), false);
});


test('funding recovery requires a complete original quote and blocks uncertain deposits', () => {
  const op = { operationId: 11, version: 9, status: 'APPROVAL_RECORDED', loanAccountId: 'loan', currentBankStatus: 'Open', canResumeFunding: true, fundingOtpReference: 'ADVANCE-FUND-11', originalAmount: 100, originalMonths: 1, originalMonthlyInstalment: 100.4, originalTotalInterest: 0.4, originalMaturityDate: '2026-12-07' };
  assert.equal(canResumeAcceptanceFunding(op), true);
  for (const change of [{ fundingAttempted: true }, { fundingRecorded: true }, { needsReconciliation: true }, { dispatchOutstanding: true }, { originalAmount: 0 }, { originalMaturityDate: '2026-02-30' }, { currentBankStatus: 'Pending' }, { fundingOtpReference: '66' }, { originalTotalInterest: 20 }]) assert.equal(Boolean(canResumeAcceptanceFunding({ ...op, ...change })), false);
});


test('funding recovery retains historical terms and supports a recorded twelve-month loan', () => {
  const base = { operationId: 11, version: 9, status: 'APPROVAL_RECORDED', loanAccountId: 'loan', currentBankStatus: 'Open', canResumeFunding: true, fundingOtpReference: 'ADVANCE-FUND-11', originalAmount: 100, originalMaturityDate: '2027-11-08' };
  for (const [months, monthly, interest] of [[1,100.4,0.4],[2,50.2,0.4],[12,8.4,0.8]]) assert.equal(canResumeAcceptanceFunding({ ...base, originalMonths: months, originalMonthlyInstalment: monthly, originalTotalInterest: interest }), true);
  assert.equal(canResumeAcceptanceFunding({ ...base, originalMonths: 13, originalMonthlyInstalment: 8, originalTotalInterest: 4 }), false);
});

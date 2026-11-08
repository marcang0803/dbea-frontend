import { test, expect } from '@playwright/test';

const OFFER = {
  isEligible: true, isSnapshotValid: true, outSnapshotId: 66,
  selectedPlanAmount: 100, selectedTenor: 3, monthlyInstalment: 100.6 / 3,
  interest: 0.6, interestRate: 0.0477, approvedBand: 'Band B',
  maxAdvanceAmount: 500, maturityDate: '2027-01-07', acceptanceAvailable: true,
};
const RECEIVED = { operationId: 6, status: 'RECEIVED', version: 1, needsReconciliation: false };

// Browser-only responses: no session, SMS, OutSystems or bank request leaves the test.
async function installApi(page, { offer = OFFER, accept, status, cancel, challenge, current, resume, active = false } = {}) {
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const call = { path, query: new URL(request.url()).search, method: request.method(), body: request.postDataJSON(), key: request.headers()['idempotency-key'] };
    calls.push(call);
    let reply;
    if (path === '/api/advance/active') reply = { data: { hasActiveAdvance: active } };
    else if (path === '/api/advance/eligibility') reply = { data: offer };
    else if (path === '/api/otp/challenges') reply = challenge ? await challenge(call) : { data: { challengeId: 'browser-test-challenge', maskedMobile: '+65 ****0000', expiresAt: new Date(Date.now() + 300_000).toISOString() } };
    else if (path === '/api/advance/acceptances') reply = accept ? await accept(call) : { data: RECEIVED };
    else if (path === '/api/advance/operations/current') reply = current ? await current(call) : { status: 404, errors: [{ code: 'NOT_FOUND' }] };
    else if (path === '/api/advance/operations/11/resume-funding') reply = resume ? await resume(call) : { status: 501 };
    else if (path.startsWith('/api/advance/operations/by-request/')) reply = status ? await status(call) : { data: RECEIVED };
    else if (path === '/api/advance/operations/6/cancel') reply = cancel ? await cancel(call) : { data: { ...RECEIVED, status: 'CANCELED', version: 2 } };
    else reply = { status: 501, errors: [{ code: 'UNEXPECTED_TEST_ROUTE' }] };
    if (reply.abort) return route.abort('failed');
    const httpStatus = reply.status || 200;
    await route.fulfill({ status: httpStatus, contentType: 'application/json', body: JSON.stringify({ success: httpStatus < 400, data: reply.data ?? null, errors: reply.errors || [] }) });
  });
  return calls;
}

async function reviewOffer(page) {
  await page.goto('/advance/accept');
  await page.getByRole('button', { name: 'Check my terms' }).click();
}

async function openOtp(page) {
  await reviewOffer(page);
  await page.getByLabel('Residence status', { exact: true }).selectOption('Rent');
  await page.getByLabel('Years at this address').fill('2');
  await page.getByLabel('Number of credit cards').fill('0');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue with SMS code' }).click();
}

test('direct P6 review blocks an active borrower before quote and SMS requests', async ({ page }) => {
  const calls = await installApi(page, { active: true });
  await page.goto('/advance/accept');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page.getByRole('heading', { name: 'You already have an active advance' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toHaveCount(0);
  expect(calls.map(call => call.path)).toEqual(['/api/advance/active']);
});

test('an advance opened in another tab is checked again before requesting SMS', async ({ page }) => {
  const calls = await installApi(page);
  await reviewOffer(page);
  await page.getByLabel('Residence status', { exact: true }).selectOption('Rent');
  await page.getByLabel('Years at this address').fill('2');
  await page.getByLabel('Number of credit cards').fill('0');
  await page.getByRole('checkbox').check();
  await page.route('**/api/advance/active', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { hasActiveAdvance: true }, errors: [] }) }));
  await page.getByRole('button', { name: 'Continue with SMS code' }).click();
  await expect(page.getByRole('heading', { name: 'You already have an active advance' })).toBeVisible();
  expect(calls.filter(call => call.path.includes('/otp/') || call.path.endsWith('/acceptances'))).toHaveLength(0);
});

test('details and consent cannot change during the pre-SMS active lookup', async ({ page }) => {
  await installApi(page);
  await reviewOffer(page);
  await page.getByLabel('Residence status', { exact: true }).selectOption('Rent');
  await page.getByLabel('Years at this address').fill('2');
  await page.getByLabel('Number of credit cards').fill('0');
  await page.getByRole('checkbox').check();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/advance/active', async route => {
    await pending;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: { hasActiveAdvance: false }, errors: [] }) });
  });
  await page.getByRole('button', { name: 'Continue with SMS code' }).click();
  await expect(page.getByLabel('Residence status', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Years at this address')).toBeDisabled();
  await expect(page.getByLabel('Number of credit cards')).toBeDisabled();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  release();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a blocked undispatched request explains the active advance and retains its reference', async ({ page }) => {
  const calls = await installApi(page, { active: true, status: () => ({ data: { ...RECEIVED, status: 'READY_TO_APPLY', version: 4 } }) });
  await page.goto('/advance/accept?requestKey=existing-request');
  await expect(page.getByRole('heading', { name: 'You already have an active advance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View your current advance' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('requestKey')).toBe('existing-request');
  expect(calls.every(call => call.method === 'GET')).toBe(true);
});

test('P5 confirmation entry preserves the selected amount, term and snapshot for P6', async ({ page }) => {
  await installApi(page, { offer: { ...OFFER, selectedPlanAmount: 125.5, selectedTenor: 3, monthlyInstalment: 126.1 / 3 } });
  await page.goto('/advance/confirm?amount=125.50&months=3&snapshotId=66');
  await expect(page.getByLabel('How much do you need? SGD')).toHaveValue('125.50');
  await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('3');
  const [request] = await Promise.all([
    page.waitForRequest('**/api/advance/eligibility?**'),
    page.getByRole('button', { name: 'Check my terms' }).click(),
  ]);
  const query = new URL(request.url()).searchParams;
  expect(query.get('amount')).toBe('125.50');
  expect(query.get('months')).toBe('3');
  expect(query.get('snapshotId')).toBe('66');
  await expect(page.getByRole('heading', { name: 'A few details for the bank' })).toBeVisible();
});

test('disabled acceptance still shows real returned terms without requesting OTP', async ({ page }) => {
  const calls = await installApi(page, { offer: { ...OFFER, acceptanceAvailable: false } });
  await reviewOffer(page);
  await expect(page.getByText('Quoted total repayment', { exact: true }).locator('..')).toContainText('100.60');
  await expect(page.getByRole('button', { name: 'Confirmation unavailable' })).toBeDisabled();
  expect(calls.map((call) => call.path)).toEqual(['/api/advance/active', '/api/advance/eligibility']);
});

test('a matching six-month offer preserves the handoff term', async ({ page }) => {
  await installApi(page, { offer: { ...OFFER, selectedPlanAmount: 500, selectedTenor: 6, monthlyInstalment: 84 } });
  await page.goto('/advance/confirm?amount=500&months=6&snapshotId=66');
  await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('6');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('6');
  await expect(page.getByRole('heading', { name: 'A few details for the bank' })).toBeVisible();
});

for (const width of [1440, 390]) {
  test(`an adjusted term requires an explicit choice without resetting the request at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const calls = await installApi(page, { offer: { ...OFFER, selectedPlanAmount: 500 } });
    await page.goto('/advance/confirm?amount=500&months=6&snapshotId=66');
    const term = page.getByLabel('Repayment term', { exact: true });
    await page.getByRole('button', { name: 'Check my terms' }).click();
    await expect(term).toHaveValue('6');
    await expect(page.getByRole('status')).toContainText('You requested S$500.00 over 6 months');
    await expect(page.getByRole('status')).toContainText('S$500.00 over 3 months');
    await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('adjusted-offer.png'), fullPage: true });
    await page.getByRole('button', { name: 'Refresh terms' }).click();
    await expect(term).toHaveValue('6');
    await page.getByRole('button', { name: 'Review this offer' }).click();
    await expect(term).toHaveValue('3');
    await expect(page.getByRole('heading', { name: 'A few details for the bank' })).toBeVisible();
    await page.getByLabel('Residence status', { exact: true }).selectOption('Rent');
    await page.getByLabel('Years at this address').fill('2');
    await page.getByLabel('Number of credit cards').fill('0');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continue with SMS code' }).click();
    await page.getByLabel('One-time code').fill('111111');
    await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
    const quotes = calls.filter(call => call.path.endsWith('/eligibility'));
    expect(quotes).toHaveLength(2);
    expect(quotes.every(call => new URLSearchParams(call.query).get('months') === '6')).toBe(true);
    expect(calls.find(call => call.path.endsWith('/acceptances')).body.months).toBe(3);
  });
}

test('an adjusted amount also requires choosing the returned offer', async ({ page }) => {
  const calls = await installApi(page);
  await page.goto('/advance/confirm?amount=500&months=3&snapshotId=66');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page.getByLabel('How much do you need? SGD')).toHaveValue('500');
  await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review this offer' }).click();
  await expect(page.getByLabel('How much do you need? SGD')).toHaveValue('100');
  await expect(page.getByRole('heading', { name: 'A few details for the bank' })).toBeVisible();
  expect(calls.map(call => call.path)).toEqual(['/api/advance/active', '/api/advance/eligibility']);
});

test('uncertain funding retains one borrowing request through reload and later confirmation', async ({ page }) => {
  let confirmed = false;
  const pending = { operationId: 6, version: 8, status: 'DEPOSIT_IN_FLIGHT', loanAccountId: 'test-loan-6782', needsReconciliation: true, dispatchOutstanding: true, errorCode: 'DEMO_FUNDING_RECONCILIATION_REQUIRED' };
  const calls = await installApi(page, {
    accept: () => ({ status: 502, data: pending }),
    status: () => ({ data: confirmed ? { ...pending, status: 'COMPLETED', version: 11, advanceId: 12, needsReconciliation: false, dispatchOutstanding: false, errorCode: '' } : pending }),
  });
  await openOtp(page);
  await page.getByLabel('One-time code').fill('111111');
  await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(page.getByText('Your loan was approved, but its deposit needs checking.', { exact: false })).toBeVisible();
  const key = new URL(page.url()).searchParams.get('requestKey');
  await expect(page.getByRole('button', { name: 'Cancel this request' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('requestKey')).toBe(key);
  confirmed = true;
  await page.getByRole('button', { name: 'Check request status' }).click();
  await expect(page.getByRole('heading', { name: 'Advance confirmed' })).toBeVisible();
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Explore repayment simulation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toHaveCount(0);
  expect(calls.filter(call => call.path.endsWith('/acceptances'))).toHaveLength(1);
});

for (const [name, changes] of [
  ['missing maturity', { maturityDate: null }],
  ['impossible maturity', { maturityDate: '2027-02-30' }],
  ['missing maximum amount', { maxAdvanceAmount: null }],
  ['unsupported amount', { selectedPlanAmount: 1001, maxAdvanceAmount: 1500 }],
  ['fractional cents', { selectedPlanAmount: 100.001 }],
  ['unsupported term', { selectedTenor: 7 }],
]) {
  test(`an offer with ${name} cannot open confirmation`, async ({ page }) => {
    await installApi(page, { offer: { ...OFFER, ...changes } });
    await reviewOffer(page);
    await expect(page.getByRole('heading', { name: 'No advance available right now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toHaveCount(0);
  });
}

test('OTP keeps keyboard focus inside the modal and returns it on close', async ({ page }) => {
  await installApi(page);
  await openOtp(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('One-time code')).toBeFocused();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press(index < 4 ? 'Tab' : 'Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toBeFocused();
});

test('P6 OTP fits the phone viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApi(page);
  await openOtp(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('One-time code')).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('phone-otp.png') });
});

test('P6 modal blocks background editing while requesting and cannot close during submission', async ({ page }) => {
  let releaseChallenge;
  let releaseAcceptance;
  const challengeReply = new Promise((resolve) => { releaseChallenge = resolve; });
  const acceptanceReply = new Promise((resolve) => { releaseAcceptance = resolve; });
  await installApi(page, { challenge: () => challengeReply, accept: () => acceptanceReply });
  await openOtp(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Sending a code to your phone…')).toBeVisible();
  await page.getByLabel('How much do you need? SGD').evaluate((element) => element.focus());
  await expect(page.getByLabel('How much do you need? SGD')).not.toBeFocused();
  releaseChallenge({ data: { challengeId: 'delayed-test-challenge', maskedMobile: '+65 ****0000', expiresAt: new Date(Date.now() + 300_000).toISOString() } });
  await dialog.getByLabel('One-time code').fill('111111');
  await dialog.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await page.getByLabel('How much do you need? SGD').evaluate((element) => element.focus());
  await expect(page.getByLabel('How much do you need? SGD')).not.toBeFocused();
  releaseAcceptance({ data: RECEIVED });
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
});

test('an expired unused OTP cannot be submitted and can be replaced', async ({ page }) => {
  let challenges = 0;
  const calls = await installApi(page, { challenge: () => ({ data: {
    challengeId: `expiry-test-${++challenges}`, maskedMobile: '+65 ****0000',
    expiresAt: new Date(Date.now() + (challenges === 1 ? -60_000 : 300_000)).toISOString(),
  } }) });
  await openOtp(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Code expired. Request a new one.')).toBeVisible();
  await expect(dialog.getByLabel('One-time code')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Confirm advance', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Send a new code', exact: true }).click();
  await expect(dialog.getByLabel('One-time code')).toBeEnabled();
  expect(challenges).toBe(2);
  expect(calls.filter((call) => call.path.endsWith('/acceptances'))).toHaveLength(0);
});

test('wrong-code retry retains the challenge and request key without resending OTP', async ({ page }) => {
  let attempts = 0;
  const calls = await installApi(page, { accept: () => ++attempts === 1
    ? { status: 422, data: RECEIVED, errors: [{ code: 'OTP_INCORRECT', message: 'The code is incorrect. Please try again.' }] }
    : { status: 202, data: { ...RECEIVED, status: 'APPROVAL_PENDING', version: 2 } } });
  await openOtp(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('One-time code').fill('111111');
  await dialog.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('incorrect');
  await expect(dialog.getByRole('button', { name: /Send a new code|Resend code/ })).toBeDisabled();
  await dialog.getByLabel('One-time code').fill('222222');
  await dialog.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
  const submissions = calls.filter((call) => call.path.endsWith('/acceptances'));
  expect(submissions).toHaveLength(2);
  expect(submissions[0].key).toBeTruthy();
  expect(submissions[1].key).toBe(submissions[0].key);
  expect(submissions[1].body.challengeId).toBe(submissions[0].body.challengeId);
  expect(calls.filter((call) => call.path.endsWith('/otp/challenges'))).toHaveLength(1);
});

for (const [name, data, status = 200] of [
  ['missing operation', null],
  ['backend local-only status', { ...RECEIVED, status: 'NOT_SUBMITTED' }],
  ['backend local-only error state', { ...RECEIVED, status: 'NOT_SUBMITTED' }, 409],
]) {
  test(`acceptance with ${name} retains recovery instead of reopening editable terms`, async ({ page }) => {
    const calls = await installApi(page, { accept: () => ({ data, status }) });
    await openOtp(page);
    await page.getByLabel('One-time code').fill('111111');
    await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check request status' })).toBeVisible();
    await expect(page).toHaveURL(/requestKey=/);
    await expect(page.getByLabel('How much do you need? SGD')).toHaveCount(0);
    expect(calls.filter((call) => call.path.endsWith('/acceptances'))).toHaveLength(1);
  });
}

test('unknown submission and 404 status preserve the original reference across reload', async ({ page }) => {
  const calls = await installApi(page, { accept: () => ({ abort: true }), status: () => ({ status: 404, errors: [{ code: 'NOT_FOUND' }] }) });
  await openOtp(page);
  await page.getByLabel('One-time code').fill('111111');
  await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
  const key = new URL(page.url()).searchParams.get('requestKey');
  await page.getByRole('button', { name: 'Check request status' }).click();
  await expect(page.getByRole('heading', { name: 'Request status unavailable' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Request status unavailable' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('requestKey')).toBe(key);
  expect(await page.evaluate(() => sessionStorage.getItem('remitease:p6:pending-request'))).toBe(key);
  await expect(page.getByRole('button', { name: 'Review another offer' })).toHaveCount(0);
  expect(calls.filter((call) => call.path.endsWith('/acceptances'))).toHaveLength(1);
});

test('only proven local rejection releases a new reference', async ({ page }) => {
  await installApi(page, { accept: () => ({ status: 503, data: { requestNotForwarded: true }, errors: [{ code: 'BORROWING_UNAVAILABLE' }] }) });
  await openOtp(page);
  await page.getByLabel('One-time code').fill('111111');
  await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request not submitted' })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('requestKey')).toBe(false);
  expect(await page.evaluate(() => sessionStorage.getItem('remitease:p6:pending-request'))).toBeNull();
  await page.getByRole('button', { name: 'Return to review' }).click();
  await expect(page.getByRole('button', { name: 'Check my terms' })).toBeVisible();
});

test('cancellation conflict adopts the returned reconciliation state', async ({ page }) => {
  const calls = await installApi(page, { cancel: () => ({ status: 409, data: { ...RECEIVED, status: 'RECONCILE', version: 2, needsReconciliation: true }, errors: [{ code: 'RECONCILIATION_REQUIRED', message: 'Check the payment status.' }] }) });
  await page.goto('/advance/accept?requestKey=cancellation-conflict');
  await page.getByRole('button', { name: 'Cancel this request' }).click();
  await expect(page.locator('main').getByRole('alert')).toContainText('Check the payment status');
  await expect(page.getByRole('button', { name: 'Cancel this request' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check request status' })).toBeVisible();
  expect(calls.find((call) => call.path.endsWith('/cancel')).body.expectedVersion).toBe(1);
  await expect(page).toHaveURL(/requestKey=cancellation-conflict/);
});

test('malformed cancellation success keeps the existing reference in recovery', async ({ page }) => {
  await installApi(page, { cancel: () => ({ data: null }) });
  await page.goto('/advance/accept?requestKey=cancellation-unknown');
  await page.getByRole('button', { name: 'Cancel this request' }).click();
  await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check request status' })).toBeVisible();
  await expect(page.getByLabel('How much do you need? SGD')).toHaveCount(0);
  await expect(page).toHaveURL(/requestKey=cancellation-unknown/);
});

test('a malformed status response cannot erase an existing request', async ({ page }) => {
  await installApi(page, { status: () => ({ data: { success: true } }) });
  await page.goto('/advance/accept?requestKey=status-unknown');
  await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check request status' })).toBeVisible();
  await expect(page.getByLabel('How much do you need? SGD')).toHaveCount(0);
  await expect(page).toHaveURL(/requestKey=status-unknown/);
});

const RECOVERABLE = { operationId: 11, version: 9, requestKey: 'original-approved-request', status: 'APPROVAL_RECORDED', loanAccountId: 'test-existing-loan', currentBankStatus: 'Open', canResumeFunding: true, fundingRecorded: false, fundingAttempted: false, fundingOtpReference: 'ADVANCE-FUND-11', originalAmount: 100, originalMonths: 1, originalMonthlyInstalment: 100.4, originalTotalInterest: 0.4, originalMaturityDate: '2026-12-07' };

test('conflicting acceptance adopts the owned original request instead of retaining a missing new key', async ({ page }) => {
  const calls = await installApi(page, { accept: () => ({ status: 409, data: { ...RECOVERABLE, errorCode: 'ACCEPTANCE_IN_PROGRESS' }, errors: [{ code: 'ACCEPTANCE_IN_PROGRESS' }] }) });
  await openOtp(page);
  await page.getByLabel('One-time code').fill('111111');
  await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(page).toHaveURL(/requestKey=original-approved-request$/);
  await expect(page.getByRole('heading', { name: /Loan approved.*funding pending/ })).toBeVisible();
  await expect(page.getByText('7 Dec 2026', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('remitease:p6:pending-request'))).toBe(RECOVERABLE.requestKey);
  expect(calls.filter(x => x.path.endsWith('/acceptances'))).toHaveLength(1);
});

test('missing rejected key finds the active original request using GET only', async ({ page }) => {
  const calls = await installApi(page, { status: () => ({ status: 404, errors: [{ code: 'NOT_FOUND' }] }), current: () => ({ data: RECOVERABLE }) });
  await page.goto('/advance/accept?requestKey=rejected-new-key');
  await expect(page).toHaveURL(/requestKey=original-approved-request$/);
  await expect(page.getByRole('heading', { name: /Loan approved.*funding pending/ })).toBeVisible();
  expect(calls.every(x => x.method === 'GET')).toBe(true);
  await expect(page.getByRole('button', { name: 'Cancel this request' })).toHaveCount(0);
});

test('funding confirmation uses a fresh loan-specific OTP and resumes only the existing loan', async ({ page }) => {
  let attempts = 0;
  const calls = await installApi(page, {
    status: () => ({ data: RECOVERABLE }),
    resume: () => ++attempts === 1
      ? { status: 422, data: { operationId: 11, version: 11, status: 'APPROVAL_RECORDED', originalAmount: 0, canResumeFunding: false }, errors: [{ code: 'FUNDING_OTP_NOT_VERIFIED', message: 'The code could not be verified.' }] }
      : { data: { ...RECOVERABLE, status: 'COMPLETED', advanceId: 12, canResumeFunding: false, version: 15 } },
  });
  await page.goto('/advance/accept?requestKey=original-approved-request');
  await page.getByRole('button', { name: 'Confirm funding with SMS code' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('One-time code').fill('111111');
  await dialog.getByRole('button', { name: 'Confirm funding', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be verified');
  await dialog.getByLabel('One-time code').fill('222222');
  await dialog.getByRole('button', { name: 'Confirm funding', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Advance confirmed' })).toBeVisible();
  expect(calls.filter(x => x.path.endsWith('/acceptances'))).toHaveLength(0);
  expect(calls.find(x => x.path.endsWith('/otp/challenges')).body).toEqual({ purpose: 'ADVANCE', referenceId: 'ADVANCE-FUND-11' });
  expect(calls.filter(x => x.path.endsWith('/resume-funding')).map(x => x.body.expectedVersion)).toEqual([9, 11]);
});

test('unknown recovery response disables another funding attempt until status is checked', async ({ page }) => {
  const calls = await installApi(page, { status: () => ({ data: RECOVERABLE }), resume: () => ({ abort: true }) });
  await page.goto('/advance/accept?requestKey=original-approved-request');
  await page.getByRole('button', { name: 'Confirm funding with SMS code' }).click();
  await page.getByRole('dialog').getByLabel('One-time code').fill('111111');
  await page.getByRole('button', { name: 'Confirm funding', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm funding with SMS code' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check request status' })).toBeVisible();
  expect(calls.filter(x => x.path.endsWith('/resume-funding'))).toHaveLength(1);
  await expect(page).toHaveURL(/requestKey=original-approved-request$/);
});


for (const [name, previous, shouldReview] of [
  ['completed funded request', { ...RECEIVED, status: 'COMPLETED', advanceId: 14, loanAccountId: 'existing-loan' }, true],
  ['pending request', { ...RECEIVED, status: 'APPROVAL_RECORDED', loanAccountId: 'existing-loan' }, false],
  ['incomplete completion', { ...RECEIVED, status: 'COMPLETED', advanceId: 0, loanAccountId: 'existing-loan' }, false],
  ['completion needing reconciliation', { ...RECEIVED, status: 'COMPLETED', advanceId: 14, loanAccountId: 'existing-loan', needsReconciliation: true }, false],
  ['completion with a public reconciliation flag', { ...RECEIVED, status: 'COMPLETED', advanceId: 14, loanAccountId: 'existing-loan', reconciliationRequired: true }, false],
  ['completion with outstanding dispatch', { ...RECEIVED, status: 'COMPLETED', advanceId: 14, loanAccountId: 'existing-loan', dispatchOutstanding: true }, false],
  ['cancellation with outstanding dispatch', { ...RECEIVED, status: 'CANCELED', dispatchOutstanding: true }, false],
  ['decline needing reconciliation', { ...RECEIVED, status: 'DECLINED', needsReconciliation: true }, false],
]) {
  test(`new offer handoff after ${name} keeps the correct recovery boundary`, async ({ page }) => {
    const calls = await installApi(page, { status: () => ({ data: previous }) });
    await page.goto('/advance/accept?requestKey=previous-request');
    await expect(page.getByText('Request reference: previous-request')).toBeVisible();
    await page.evaluate(() => sessionStorage.setItem('remitease:p6:pending-request', 'previous-request'));
    await page.goto('/advance/confirm?amount=125.50&months=3&snapshotId=66');
    if (shouldReview) {
      await expect(page.getByLabel('How much do you need? SGD')).toHaveValue('125.50');
      await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('3');
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('remitease:p6:pending-request'))).toBeNull();
    } else {
      await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
      await expect(page.getByLabel('How much do you need? SGD')).toHaveCount(0);
      expect(await page.evaluate(() => sessionStorage.getItem('remitease:p6:pending-request'))).toBe('previous-request');
    }
    expect(calls.filter(call => call.method !== 'GET')).toHaveLength(0);
  });
}


test('P5 twelve-month handoff remains twelve months through quote and confirmation', async ({ page }) => {
  const calls = await installApi(page, { offer: { ...OFFER, selectedTenor: 12, monthlyInstalment: 8.4, interest: 0.8, maturityDate: '2027-11-08' } });
  await page.goto('/advance/confirm?amount=100&months=12&snapshotId=66');
  const term = page.getByLabel('Repayment term', { exact: true });
  await expect(term).toHaveValue('12');
  await expect(term.locator('option')).toHaveText(['3 months', '6 months', '12 months']);
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(term).toHaveValue('12');
  await page.getByLabel('Residence status', { exact: true }).selectOption('Rent');
  await page.getByLabel('Years at this address').fill('2');
  await page.getByLabel('Number of credit cards').fill('0');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continue with SMS code' }).click();
  await page.getByLabel('One-time code').fill('111111');
  await page.getByRole('button', { name: 'Confirm advance', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirmation pending' })).toBeVisible();
  expect(calls.filter(x => x.path.endsWith('/acceptances'))).toHaveLength(1);
  expect(calls.find(x => x.path.endsWith('/acceptances')).body.months).toBe(12);
  expect(new URLSearchParams(calls.find(x => x.path.endsWith('/eligibility')).query).get('months')).toBe('12');
});

test('a twelve-month plan denied by P5 remains unavailable for confirmation', async ({ page }) => {
  const calls = await installApi(page, { offer: { ...OFFER, selectedTenor: 12, isEligible: false } });
  await page.goto('/advance/confirm?amount=100&months=12&snapshotId=66');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page.getByRole('heading', { name: 'No advance available right now' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with SMS code' })).toHaveCount(0);
  expect(calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

test('an obsolete offer link cannot submit a different term than the dropdown shows', async ({ page }) => {
  const calls = await installApi(page);
  await page.goto('/advance/accept?amount=100&months=2');
  await expect(page.getByRole('alert').filter({ hasText: 'no longer offered' })).toBeVisible();
  await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('3');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page.getByRole('heading', { name: 'A few details for the bank' })).toBeVisible();
  expect(new URLSearchParams(calls.find(call => call.path.endsWith('/eligibility')).query).get('months')).toBe('3');
  expect(calls.filter(call => call.method !== 'GET')).toHaveLength(0);
});

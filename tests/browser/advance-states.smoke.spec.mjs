import { test, expect } from '@playwright/test';

const OFFER = {
  isEligible: true, isSnapshotValid: true, outSnapshotId: 66,
  selectedPlanAmount: 100, selectedTenor: 2, monthlyInstalment: 50.298322116,
  interest: 0.596644232, interestRate: 0.0477, approvedBand: 'Band B',
  maxAdvanceAmount: 500, maturityDate: '2027-01-07', acceptanceAvailable: true,
};
const RECEIVED = { operationId: 6, status: 'RECEIVED', version: 1, needsReconciliation: false };

// Browser-only responses: no session, SMS, OutSystems or bank request leaves the test.
async function installApi(page, { offer = OFFER, accept, status, cancel, challenge } = {}) {
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const call = { path, method: request.method(), body: request.postDataJSON(), key: request.headers()['idempotency-key'] };
    calls.push(call);
    let reply;
    if (path === '/api/advance/eligibility') reply = { data: offer };
    else if (path === '/api/otp/challenges') reply = challenge ? await challenge(call) : { data: { challengeId: 'browser-test-challenge', maskedMobile: '+65 ****0000', expiresAt: new Date(Date.now() + 300_000).toISOString() } };
    else if (path === '/api/advance/acceptances') reply = accept ? await accept(call) : { data: RECEIVED };
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

test('P5 confirmation entry preserves the selected amount, term and snapshot for P6', async ({ page }) => {
  await installApi(page, { offer: { ...OFFER, selectedPlanAmount: 125.5, selectedTenor: 3 } });
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
  expect(calls.map((call) => call.path)).toEqual(['/api/advance/eligibility']);
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

import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

// Actual services; no mocked responses, saved credentials, OTP extraction or
// financial POST retries. The user signs in and submits the code themselves.
test('real OTP request and Product 205 rejection recover and cancel safely', async ({ page }, info) => {
  test.skip(process.env.P6_E2E_INTERACTIVE !== '1', 'Requires a person to sign in and enter their SMS code.');
  test.setTimeout(600_000);
  const evidence = { mode: 'actual dev services', result: 'IN_PROGRESS', phase: 'STARTING', loginStatuses: [], acceptancePosts: 0, mockRequests: 0, bankFundingVerified: false, monthlyInterestVerified: false };
  const checkpoint = async (phase) => {
    evidence.phase = phase;
    await writeFile(info.outputPath('live-progress.json'), JSON.stringify(evidence, null, 2));
    console.log(`P6 live stage: ${phase}`);
  };
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST') evidence.loginStatuses.push(response.status());
  });
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/api/mock/')) evidence.mockRequests++;
    if (path === '/api/advance/acceptances' && request.method() === 'POST') {
      evidence.acceptancePosts++;
      evidence.requestKey = request.headers()['idempotency-key'];
    }
  });
  const responseFor = (path) => page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === 'POST', { timeout: 180_000 });
  try {
    await page.goto('/advance/accept?amount=100&months=2');
    await page.getByRole('button', { name: 'Check my terms' }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await page.evaluate(() => { document.title = 'P6 Playwright test - sign in'; });
    await page.bringToFront();
    await checkpoint('WAITING_FOR_LOGIN_IN_TEST_WINDOW');
    console.log('ACTION: Sign in as constructionworker in this test browser. Keep credentials out of chat.');
    // App Router navigation need not produce a full document load event.
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 300_000 }).toBe('/advance/accept');
    await checkpoint('CHECKING_REAL_OFFER');

    const offerReply = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/advance/eligibility', { timeout: 100_000 });
    await page.getByRole('button', { name: /^(Check my terms|Refresh terms)$/ }).click();
    const offerResponse = await offerReply;
    const offer = await offerResponse.json();
    evidence.offer = { status: offerResponse.status(), eligible: offer.data?.isEligible, amount: offer.data?.selectedPlanAmount, months: offer.data?.selectedTenor, snapshotId: offer.data?.outSnapshotId };
    expect(offerResponse.status()).toBe(200);
    expect(offer.data?.isEligible).toBe(true);
    expect(offer.data?.acceptanceAvailable).toBe(true);
    expect(offer.data?.selectedPlanAmount).toBe(100);
    expect(offer.data?.selectedTenor).toBe(2);
    await page.screenshot({ path: info.outputPath('actual-offer.png'), fullPage: true });

    // Explicit dev-fixture facts, visible and editable before the user submits.
    await page.getByLabel('Residence status', { exact: true }).selectOption('Owned');
    await page.getByLabel('Years at this address').fill('2');
    await page.getByLabel('Number of credit cards').fill('0');
    await page.getByRole('checkbox').check();
    const otpReply = responseFor('/api/otp/challenges');
    await checkpoint('REQUESTING_ONE_SMS');
    await page.getByRole('button', { name: 'Continue with SMS code' }).click();
    const otpResponse = await otpReply;
    const otp = await otpResponse.json();
    evidence.otpRequest = { status: otpResponse.status(), success: otp.success === true, hasChallenge: Boolean(otp.data?.challengeId), recipientLast4: String(otp.data?.maskedMobile || '').replace(/\D/g, '').slice(-4) };
    expect(otpResponse.ok()).toBe(true);
    expect(otp.success).toBe(true);
    expect(otp.data?.challengeId).toBeTruthy();
    expect(evidence.otpRequest.recipientLast4).toBe('9104');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.evaluate(() => { document.title = 'P6 Playwright test - enter SMS code'; });

    const acceptanceReply = responseFor('/api/advance/acceptances');
    await checkpoint('WAITING_FOR_USER_SMS_CONFIRMATION');
    console.log('ACTION: Enter the SMS code and click Confirm advance yourself. Expected result: Product 205 borrowing unavailable, not a funded loan.');
    const acceptanceResponse = await acceptanceReply;
    const acceptance = await acceptanceResponse.json();
    evidence.acceptance = { httpStatus: acceptanceResponse.status(), errorCode: acceptance.errors?.[0]?.code, status: acceptance.data?.status, operationId: acceptance.data?.operationId, version: acceptance.data?.version, advanceId: acceptance.data?.advanceId || 0, hasLoanAccount: Boolean(acceptance.data?.loanAccountId) };
    await checkpoint('CHECKING_BACKEND_RESULT');
    expect(evidence.acceptancePosts).toBe(1);
    expect(acceptanceResponse.status()).toBe(503);
    expect(evidence.acceptance.errorCode).toBe('INTEREST_REPAYMENT_CONTRACT_PENDING');
    expect(evidence.acceptance.advanceId).toBe(0);
    expect(evidence.acceptance.hasLoanAccount).toBe(false);
    await expect(page.getByRole('heading', { name: 'Borrowing temporarily unavailable' })).toBeVisible();
    await checkpoint('CHECKING_OWNER_RECOVERY');

    const statusReply = page.waitForResponse((response) => new URL(response.url()).pathname.includes('/api/advance/operations/by-request/'), { timeout: 100_000 });
    await page.getByRole('button', { name: 'Check request status' }).click();
    const statusResponse = await statusReply;
    const status = await statusResponse.json();
    expect(statusResponse.status()).toBe(200);
    expect(status.data?.operationId).toBe(evidence.acceptance.operationId);
    expect(status.data?.status).toBe('RECEIVED');

    const cancelReply = responseFor(`/api/advance/operations/${evidence.acceptance.operationId}/cancel`);
    await checkpoint('CANCELING_UNDISPATCHED_TEST_REQUEST');
    await page.getByRole('button', { name: 'Cancel this request' }).click();
    const cancelResponse = await cancelReply;
    const canceled = await cancelResponse.json();
    evidence.cleanup = { status: cancelResponse.status(), operationStatus: canceled.data?.status };
    expect(cancelResponse.status()).toBe(200);
    expect(canceled.data?.status).toBe('CANCELED');
    await expect(page.getByRole('heading', { name: 'Request canceled' })).toBeVisible();
    expect(evidence.mockRequests).toBe(0);
    expect(evidence.acceptancePosts).toBe(1);
    await page.screenshot({ path: info.outputPath('canceled-test-request.png'), fullPage: true });
    evidence.result = 'PASS: actual OTP request, deliberate backend block, owner recovery and cancellation';
    await checkpoint('COMPLETE');
  } finally {
    // Contains only whitelisted non-secret observations, never request bodies,
    // auth headers/cookies, password, OTP, storage state or raw provider traffic.
    try {
      if (!page.isClosed()) evidence.lastPath = new URL(page.url()).pathname;
      await writeFile(info.outputPath('live-evidence.json'), JSON.stringify(evidence, null, 2));
      await info.attach('live-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    } finally {
      // Close before Playwright's failure-artifact collection, so an entered
      // password or code cannot enter an automatic page error-context snapshot.
      await page.close();
    }
  }
});

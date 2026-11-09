import { test, expect } from '@playwright/test';

// Person-assisted offer review only. No OTP, acceptance or cancellation is sent.
// The former rejection test is retired: a valid confirmation can now fund a loan.
test('real offer review shows quoted terms without borrowing', async ({ page }) => {
  test.skip(process.env.P6_E2E_INTERACTIVE !== '1', 'Requires a person to sign in.');
  test.setTimeout(360_000);
  let financialRequests = 0;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET' && (path.startsWith('/api/advance/') || path.startsWith('/api/otp/'))) {
      financialRequests++;
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  try {
    await page.goto('/advance/accept?amount=100&months=3');
    await page.getByRole('button', { name: 'Check my terms' }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.evaluate(() => { document.title = 'P6 offer review - sign in'; });
    await page.bringToFront();
    console.log('ACTION: Sign in in this test window. This check reviews the offer only.');
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 300_000 }).toBe('/advance/accept');
    const offerReply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/advance/eligibility');
    await page.getByRole('button', { name: /^(Check my terms|Refresh terms)$/ }).click();
    const response = await offerReply;
    const offer = await response.json();
    expect(response.status()).toBe(200);
    expect(offer.data?.isEligible).toBe(true);
    expect(offer.data?.selectedPlanAmount).toBe(100);
    expect(offer.data?.selectedTenor).toBe(3);
    expect(financialRequests).toBe(0);
  } finally {
    // Close before failure-artifact collection can capture an entered password.
    await page.close();
  }
});

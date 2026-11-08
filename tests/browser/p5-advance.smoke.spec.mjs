import { test, expect } from '@playwright/test';

// Entirely controlled browser responses: no account, score, SMS or bank writes.
async function installApi(page, { active = false, activeUnavailable = false, clamp = true, termCaps = false, records } = {}) {
  const calls = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    calls.push({ path: url.pathname, method: route.request().method() });
    let status = 200;
    let data;
    let errors = [];
    if (url.pathname === '/api/auth/me') data = { userId: 51 };
    else if (url.pathname === '/api/account/summary') data = { accountId: '0000001234' };
    else if (url.pathname === '/api/advance/active') {
      status = activeUnavailable ? 503 : 200;
      data = activeUnavailable ? null : { hasActiveAdvance: active };
      errors = activeUnavailable ? [{ code: 'ACTIVE_ADVANCE_LOOKUP_UNAVAILABLE', message: 'Your existing advances could not be checked. Please try again before applying.' }] : [];
    } else if (url.pathname === '/api/score') data = { id: 66, userId: 51, score: 60, band: 'Band B', factorBreakdown: 'AvgRemit:600', createdOn: '2026-11-08' };
    else if (['/api/eligibility', '/api/advance/eligibility'].includes(url.pathname)) {
      const amount = Number(url.searchParams.get('RequestedAmount') || url.searchParams.get('amount'));
      const requestedTerm = Number(url.searchParams.get('SelectedTenorMonths') || url.searchParams.get('months'));
      const months = clamp ? 3 : requestedTerm;
      data = { isEligible: true, isSnapshotValid: true, outSnapshotId: 66, selectedPlanAmount: Math.min(amount, 500), selectedTenor: months, monthlyInstalment: (Math.min(amount, 500) + 3) / months, interest: 3, interestRate: 0.0477, approvedBand: 'Band B', maxAdvanceAmount: 500, maturityDate: '2027-02-08', acceptanceAvailable: true };
      if (termCaps && requestedTerm === 3) data = { ...data, selectedPlanAmount: Math.min(amount, 200), maxAdvanceAmount: 200 };
    } else if (url.pathname === '/api/advance/records') data = { advances: records ?? [{ id: 14, userId: 51, amount: 100, tenorMonths: 1, monthlyInstalment: 100.4, status: 'ACTIVE', nextDueDate: '2026-12-07', loanAccountId: '0000006826', repayments: [] }] };
    else { status = 501; errors = [{ message: `Unexpected test route ${url.pathname}` }]; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, data, errors }) });
  });
  return calls;
}

test('P5 disables advertised terms when eligibility returns a different term', async ({ page }) => {
  await installApi(page);
  await page.goto('/advance/offer');
  await expect(page.getByRole('heading', { name: '3 months', exact: true }).locator('../..')).toContainText('Eligible');
  for (const months of [6, 12]) {
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: `${months} months`, exact: true }) });
    await expect(card).toContainText('Not eligible');
    await expect(card).toContainText(`This ${months}-month plan is unavailable`);
    await expect(card.getByRole('button', { name: 'Choose this plan' })).toHaveCount(0);
  }
  const href = await page.getByRole('link', { name: 'Continue to confirmation' }).getAttribute('href');
  const query = new URL(href, 'http://test.invalid').searchParams;
  expect(Object.fromEntries(query)).toEqual({ amount: '500', months: '3', snapshotId: '66' });
});

test('a genuinely approved six-month plan reaches P6 unchanged', async ({ page }) => {
  await installApi(page, { clamp: false });
  await page.goto('/advance/offer');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '6 months', exact: true }) });
  await card.getByRole('button', { name: 'Choose this plan' }).click();
  await page.getByRole('link', { name: 'Continue to confirmation' }).click();
  await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('6');
  await expect(page.getByLabel('How much do you need? SGD')).toHaveValue('500');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page.getByRole('heading', { name: 'A few details for the bank' })).toBeVisible();
  await expect(page.getByLabel('Repayment term', { exact: true })).toHaveValue('6');
});

test('amount feedback prevents over-limit and stale-plan handoffs', async ({ page }) => {
  const calls = await installApi(page);
  await page.goto('/advance/offer');
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toBeVisible();
  const amount = page.getByLabel('Requested amount (SGD)');
  await amount.fill('600');
  await expect(page.getByText('Your current maximum is S$500.00. Enter an amount within this limit.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  expect(calls.filter(call => call.path === '/api/eligibility')).toHaveLength(3);
  await amount.fill('400');
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveAttribute('href', /amount=400&months=3&snapshotId=66/);
});

test('a lower cap for another term does not block an exact eligible plan', async ({ page }) => {
  await installApi(page, { clamp: false, termCaps: true });
  await page.goto('/advance/offer');
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '6 months', exact: true }) });
  await card.getByRole('button', { name: /^(Choose this plan|Selected plan)$/ }).click();
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveAttribute('href', /amount=500&months=6&snapshotId=66/);
});

for (const width of [390, 1440]) {
test(`an active borrower can compare offers without applying at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const calls = await installApi(page, { active: true, clamp: false });
  await page.goto('/advance/offer');
  await expect(page.getByRole('heading', { name: 'You already have an active advance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View your current advance' })).toHaveAttribute('href', '/advance/me');
  await expect(page.getByText('60', { exact: true })).toBeVisible();
  await expect(page.getByText('Band B', { exact: true })).toBeVisible();
  for (const months of [3, 6, 12]) await expect(page.getByRole('heading', { name: `${months} months`, exact: true })).toBeVisible();
  await expect(page.getByText('For reference', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^(Choose this plan|Selected plan)$/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveCount(0);
  await page.getByLabel('Requested amount (SGD)').fill('400');
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page.getByText('S$400.00 requested', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveCount(0);
  expect(calls.filter(call => call.path === '/api/score')).toHaveLength(1);
  expect(calls.filter(call => call.path.includes('/otp/') || call.path.includes('/acceptances'))).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('active-advance-browse.png'), fullPage: true });
});
}

test('an unavailable active check never permits continuing to confirmation', async ({ page }) => {
  await installApi(page, { activeUnavailable: true });
  await page.goto('/advance/offer');
  await expect(page.locator('main').getByRole('alert')).toContainText('Your existing advances could not be checked');
  await expect(page.getByRole('link', { name: 'Continue to confirmation' })).toHaveCount(0);
});

test('My Advance renders live IDs and history without React key warnings', async ({ page }, info) => {
  const keyWarnings = [];
  page.on('console', message => { if (/unique.*key|same key/.test(message.text())) keyWarnings.push(message.text()); });
  await installApi(page, { records: [
    { id: 14, amount: 100, tenorMonths: 1, monthlyInstalment: 100.4, status: 'ACTIVE', nextDueDate: '2026-12-07', loanAccountId: '0000006826' },
    { id: 15, amount: 200, tenorMonths: 3, status: 'CLOSED', repayments: [{ id: 7, dueDate: '2026-10-07', amount: 201, status: 'PAID' }] },
  ] });
  await page.goto('/advance/me');
  await expect(page.getByText('Advance #14', { exact: true })).toBeVisible();
  await expect(page.getByText('Advance #15', { exact: true })).toBeVisible();
  await expect(page.getByText('CLOSED', { exact: true })).toBeVisible();
  await expect(page.getByText('PAID', { exact: true })).toBeVisible();
  await expect(page.getByText('Latest credit score')).toHaveCount(0);
  expect(keyWarnings).toEqual([]);
  await page.screenshot({ path: info.outputPath('my-advance-ids.png'), fullPage: true });
});

test('invalid duplicate advance IDs produce a usable error instead of duplicate cards', async ({ page }) => {
  await installApi(page, { records: [{ id: 14 }, { id: 14 }] });
  await page.goto('/advance/me');
  await expect(page.locator('main').getByRole('alert')).toContainText('missing or duplicate record IDs');
  await expect(page.getByRole('article')).toHaveCount(0);
});

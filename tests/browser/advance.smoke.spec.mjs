import { test, expect } from '@playwright/test';

test('desktop review uses two columns without horizontal overflow', async ({ page }, info) => {
  await page.goto('/advance/accept');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('with clear terms');
  const form = page.locator('main form');
  const summary = page.getByRole('complementary', { name: 'Your advance terms' });
  await expect(summary.getByRole('heading', { name: 'Your terms, in one place' })).toBeVisible();
  const [formBox, summaryBox, mainBox] = await Promise.all([form.boundingBox(), summary.boundingBox(), page.locator('main').boundingBox()]);
  expect(mainBox.width).toBeGreaterThan(1000);
  expect(summaryBox.x).toBeGreaterThan(formBox.x + formBox.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('desktop-review.png'), fullPage: true });
});

test('phone review fits the viewport and keeps its form usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/advance/accept');
  await expect(page.getByLabel('How much do you need? SGD')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check my terms' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your terms, in one place' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('phone-review.png'), fullPage: true });
});

test('checking terms without a session preserves the draft through the login redirect', async ({ page }) => {
  await page.goto('/advance/accept');
  await page.getByLabel('How much do you need? SGD').fill('125.50');
  await page.getByLabel('Repayment term', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Check my terms' }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
  const next = new URL(page.url()).searchParams.get('next');
  const draft = new URL(next, 'http://test.invalid');
  expect(draft.pathname).toBe('/advance/accept');
  expect(draft.searchParams.get('amount')).toBe('125.50');
  expect(draft.searchParams.get('months')).toBe('3');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
});

test('an existing request keeps its reference when login is required', async ({ page }) => {
  await page.goto('/advance/accept?requestKey=browser-smoke-recovery');
  await expect(page).toHaveURL(/\/login\?next=/);
  const next = new URL(page.url()).searchParams.get('next');
  expect(new URL(next, 'http://test.invalid').searchParams.get('requestKey')).toBe('browser-smoke-recovery');
});

test('a real browser POST from the loopback page reaches authentication instead of a false origin rejection', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'remitease_session', value: 'invalid-browser-diagnostic-token', url: baseURL }]);
  await page.goto('/advance/accept');
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/advance/acceptances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json();
    return { status: response.status, code: data.errors?.[0]?.code, notForwarded: data.data?.requestNotForwarded };
  });
  expect(result).toEqual({ status: 401, code: 'UNAUTHENTICATED', notForwarded: true });
});

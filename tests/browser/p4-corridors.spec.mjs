import { mkdirSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Run against the local dev mock server; never a banking environment.
const base = 'http://127.0.0.1:3095';
test('P4 alerts validate corridors and retain precise positive targets', async ({ request }) => {
  for (const currency of ['PHP', 'INR', 'BDT', 'IDR', 'MYR', 'MMK', 'VND']) {
    const response = await request.post(`${base}/api/mock/rates/alerts`, { data: { corridor: `SGD-${currency}`, targetRate: 0.00000123 } });
    expect(response.status()).toBe(201);
    const { data } = await response.json();
    expect(data.alertId).toBeGreaterThan(0);
    expect(data.targetRate).toBe(0.00000123);
    await request.delete(`${base}/api/mock/rates/alerts/${data.alertId}`);
    const list = await (await request.get(`${base}/api/mock/rates/alerts`)).json();
    expect(list.data.some(item => item.alertId === data.alertId)).toBe(false);
    expect(list.data.every(item => item.isActive)).toBe(true);
  }
  const invalid = await request.post(`${base}/api/mock/rates/alerts`, { data: { corridor: 'SGD-XXX', targetRate: 1 } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).errors[0].code).toBe('INVALID_CORRIDOR');
  const zero = await request.post(`${base}/api/mock/rates/alerts`, { data: { corridor: 'SGD-INR', targetRate: 0 } });
  expect(zero.status()).toBe(400);
});
test('P4 mock locks use each beneficiary currency and preserve OTP binding', async ({ request }) => {
  for (const [beneficiaryLinkId, currency, rate] of [[301, 'PHP', 43.9], [304, 'INR', 64.2], [305, 'VND', 19250]]) {
    const quote = await (await request.post(`${base}/api/mock/rates/locks/preview`, { data: { beneficiaryLinkId, amountSGD: 100, period: '1M' } })).json();
    expect(quote.data.forwardRate).toBe(rate);
    expect(quote.data.recipientAmount).toBe(100 * rate);
    const referenceId = `p4-test-${currency}-${Date.now()}`;
    const challenge = await (await request.post(`${base}/api/mock/otp/challenges`, { data: { purpose: 'LOCK', referenceId } })).json();
    const data = { beneficiaryLinkId, amountSGD: 100, period: '1M', referenceId, challengeId: challenge.data.challengeId, otpCode: '123456' };
    const wrong = await request.post(`${base}/api/mock/rates/locks`, { data: { ...data, referenceId: 'wrong' } });
    expect(wrong.status()).toBe(409);
    const created = await request.post(`${base}/api/mock/rates/locks`, { data });
    expect(created.status()).toBe(201);
    expect((await created.json()).data.quoteCurrency).toBe(currency);
  }
});
for (const width of [390, 1440]) {
 test(`P4 alert labels and lock missing-currency state at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${base}/rates/alerts`);
  await expect(page.locator('#alert-corridor option')).toHaveCount(7);
  await page.locator('#alert-corridor').selectOption('SGD-VND');
  mkdirSync('test-results/p4-visual', { recursive: true });
  await expect(page.locator('article').filter({ hasText: 'SGD-VND' }).first()).toContainText('19250 VND');
  await expect(page.locator('#target-rate')).toHaveAttribute('step', 'any');
  await page.screenshot({ path: `test-results/p4-visual/alerts-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.route('**/api/mock/family/beneficiaries', route => route.fulfill({ json: { success: true, data: { items: [{ id: 888, nickname: 'Missing currency', isActive: true }], total: 1 }, errors: [] } }));
  await page.goto(`${base}/rates/lock`);
  await expect(page.locator('main').getByRole('alert')).toContainText('no payout currency');
  await page.screenshot({ path: `test-results/p4-visual/missing-currency-${width}.png`, fullPage: true });
  await expect(page.getByRole('button', { name: 'Preview rate', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 });
}
test('P4 browser previews and confirms an INR mock lock', async ({ page }) => {
 await page.goto(`${base}/rates/lock`);
 await page.locator('input[type=radio][value="304"]').check();
 await page.locator('input[type=number]').fill('100');
 await page.getByRole('button', { name: 'Preview rate', exact: true }).click();
 await expect(page.getByText('S$1 = 64.2 INR')).toBeVisible();
 await page.getByRole('button', { name: 'Confirm and lock rate' }).click();
 await page.getByLabel('One-time code').fill('123456');
 await page.getByRole('button', { name: 'Lock rate', exact: true }).click();
 await expect(page.getByText('Rate locked successfully', { exact: true })).toBeVisible();
 await page.goto(`${base}/rates/locks`);
 await expect(page.locator('article').filter({ hasText: 'Family in India' }).first()).toContainText('INR');
});

test('P4 refuses an invalid forward quote before OTP', async ({ page }) => {
 await page.route('**/api/mock/rates/locks/preview', route => route.fulfill({ json: { success: true, data: { forwardRate: 0, recipientAmount: 0, maturityDate: '2027-01-01' }, errors: [] } }));
 await page.goto(`${base}/rates/lock`);
 await page.locator('input[type=radio][value="305"]').check();
 await page.getByLabel('Amount to protect').fill('100');
 await page.getByRole('button', { name: 'Preview rate', exact: true }).click();
 await expect(page.locator('main').getByRole('alert')).toContainText('No valid forward quote');
 await expect(page.getByRole('button', { name: 'Confirm and lock rate' })).toHaveCount(0);
});
test('P4 hides inactive alerts returned by an older backend', async ({ page }) => {
 await page.route('**/api/mock/rates/alerts', route => route.fulfill({ json: { success: true, data: [
   { alertId: 1, corridor: 'SGD-INR', targetRate: 64.123456, isActive: true },
   { alertId: 2, corridor: 'SGD-VND', targetRate: 19250, isActive: false },
 ], errors: [] } }));
 await page.goto(`${base}/rates/alerts`);
 await expect(page.locator('article')).toHaveCount(1);
 await expect(page.locator('article')).toContainText('64.123456 INR');
});

test('P4 discards a quote when the beneficiary changes during preview', async ({ page }) => {
 let release;
 const gate = new Promise(resolve => { release = resolve; });
 let received;
 const started = new Promise(resolve => { received = resolve; });
 await page.route('**/api/mock/rates/locks/preview', async route => {
   received();
   await gate;
   await route.fulfill({ json: { success: true, data: { forwardRate: 64.2, recipientAmount: 6420, maturityDate: '2027-01-01' }, errors: [] } });
 });
 await page.goto(`${base}/rates/lock`);
 await page.locator('input[type=radio][value="304"]').check();
 await page.getByLabel('Amount to protect').fill('100');
 await page.getByRole('button', { name: 'Preview rate', exact: true }).click();
 await started;
 await page.locator('input[type=radio][value="305"]').check();
 const response = page.waitForResponse('**/api/mock/rates/locks/preview');
 release();
 await response;
 await expect(page.getByRole('button', { name: 'Preview rate', exact: true })).toBeEnabled();
 await expect(page.getByRole('button', { name: 'Confirm and lock rate' })).toHaveCount(0);
 await expect(page.getByText('S$1 = 64.2 VND')).toHaveCount(0);
});

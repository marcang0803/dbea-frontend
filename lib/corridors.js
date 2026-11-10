// P4 spot corridors verified against SMULab; currency-list membership verified in tBank.
// This list does not assert forward-rate availability. Live locks require a bank quote.
export const CORRIDORS = [
  { code: 'SGD-PHP', currency: 'PHP', country: 'Philippines' },
  { code: 'SGD-INR', currency: 'INR', country: 'India' },
  { code: 'SGD-BDT', currency: 'BDT', country: 'Bangladesh' },
  { code: 'SGD-IDR', currency: 'IDR', country: 'Indonesia' },
  { code: 'SGD-MYR', currency: 'MYR', country: 'Malaysia' },
  { code: 'SGD-MMK', currency: 'MMK', country: 'Myanmar' },
  { code: 'SGD-VND', currency: 'VND', country: 'Vietnam' },
];
export const corridorForCode = (code) => CORRIDORS.find((item) => item.code === code);
export const corridorForCurrency = (currency) => CORRIDORS.find((item) => item.currency === currency);
// Exchange rates are ratios, not money: preserve their precision independently of minor units.
export function formatRate(value) {
  const number = Number(value);
  return value == null || !Number.isFinite(number) ? '—' : String(number);
}
export function payoutCurrencyError(currency) {
  if (!currency) return 'This beneficiary has no payout currency. Update their details before previewing a lock.';
  if (!corridorForCurrency(currency)) return 'Rate locks are not supported for this beneficiary’s payout currency.';
  return '';
}

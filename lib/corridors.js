// Spot-alert corridors. These do not imply forward-lock support.
export const CORRIDORS = [
  { code: 'SGD-PHP', currency: 'PHP', country: 'Philippines' },
  { code: 'SGD-INR', currency: 'INR', country: 'India' },
  { code: 'SGD-BDT', currency: 'BDT', country: 'Bangladesh' },
  { code: 'SGD-IDR', currency: 'IDR', country: 'Indonesia' },
  { code: 'SGD-MYR', currency: 'MYR', country: 'Malaysia' },
  { code: 'SGD-MMK', currency: 'MMK', country: 'Myanmar' },
  { code: 'SGD-VND', currency: 'VND', country: 'Vietnam' },
];

export const corridorForCode = (code) =>
  CORRIDORS.find((item) => item.code === code);

export const corridorForCurrency = (currency) =>
  CORRIDORS.find((item) => item.currency === currency);

// Verified forward combinations; base currency is SGD.
// Keep aligned with Rate_AS.ForwardCorridor.
export const FORWARD_LOCK_PERIODS = {
  USD: ['1M', '3M', '6M', '1Y'],
  GBP: ['1M', '3M', '6M', '1Y'],
  EUR: ['1M', '3M', '6M', '1Y'],
  JPY: ['1M', '3M', '6M', '1Y'],
  CHF: ['1M', '3M', '6M', '1Y'],
};

// Exchange rates are ratios: preserve their precision.
export function formatRate(value) {
  const number = Number(value);
  return value == null || !Number.isFinite(number)
    ? '—'
    : String(number);
}

export function payoutCurrencyError(currency, period) {
  const normalizedCurrency = (currency || '').trim().toUpperCase();
  const normalizedPeriod = (period || '').trim().toUpperCase();

  if (!normalizedCurrency) {
    return 'This beneficiary has no payout currency. Update their details before previewing a lock.';
  }

  const supportedPeriods = FORWARD_LOCK_PERIODS[normalizedCurrency];

  if (!supportedPeriods) {
    return `Forward locking is currently unavailable for ${normalizedCurrency}.`;
  }

  if (!supportedPeriods.includes(normalizedPeriod)) {
    return `Forward locking for ${normalizedCurrency} is currently available for ${supportedPeriods.join(', ')} only.`;
  }

  return '';
}
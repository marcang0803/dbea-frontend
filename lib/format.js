// Display helpers shared by the P3 screens.

export function formatMoney(amount, currency = 'SGD') {
  const value = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(value)) return '—';
  try {
    return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
  } catch {
    // Unknown currency code: fall back to a plain format instead of crashing the page.
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/**
 * Notification links come from backend data. Only follow paths inside our own app
 * ("/rates/lock?..."), never absolute or protocol-relative URLs ("https://…", "//evil.com"),
 * so a bad link can't send the user to a phishing page.
 */
export function isSafeInternalLink(link) {
  return (
    typeof link === 'string' &&
    link.startsWith('/') &&
    !link.startsWith('//') &&
    !link.includes('\\')
  );
}

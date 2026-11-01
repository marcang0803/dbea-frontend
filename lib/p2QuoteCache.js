const PREFIX = 'remitease:quote:';

export function loadCachedQuote(quoteId) {
  if (typeof window === 'undefined' || !quoteId) return null;
  try {
    return JSON.parse(window.sessionStorage.getItem(`${PREFIX}${quoteId}`));
  } catch {
    return null;
  }
}

export function saveCachedQuote(quote) {
  if (typeof window === 'undefined' || !quote?.quoteId) return;
  window.sessionStorage.setItem(`${PREFIX}${quote.quoteId}`, JSON.stringify(quote));
}

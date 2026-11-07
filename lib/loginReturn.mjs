const APP_SECTIONS = new Set(['home', 'advance', 'family', 'send', 'rates', 'notifications']);

// Only return to application pages. In particular, never pass a query-supplied
// scheme, external host, API route or login loop to Next's router.
export function safeLoginReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(value)) return '/home';
  try {
    const url = new URL(value, 'https://remitease.invalid');
    if (url.origin !== 'https://remitease.invalid' || !APP_SECTIONS.has(url.pathname.split('/')[1])) return '/home';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/home'; }
}

export function advanceReturnPath({ amount = '', months = '', snapshotId = '', requestKey = '' } = {}) {
  // A submitted request always resumes status recovery, never another offer.
  const query = requestKey ? new URLSearchParams({ requestKey }) : new URLSearchParams({ amount, months, ...(snapshotId ? { snapshotId } : {}) });
  return `/advance/accept?${query}`;
}

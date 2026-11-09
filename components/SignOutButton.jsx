'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await fetch('/api/auth/logout', { method: 'POST', cache: 'no-store'  });
    } finally {
      window.location.replace('/login');
    }
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={signingOut}
      aria-label={signingOut ? 'Signing out' : 'Sign out'}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-red-700 hover:shadow focus-visible:ring-4 focus-visible:ring-red-600/15 disabled:cursor-wait disabled:opacity-60"
    >
      {signingOut ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" aria-hidden="true" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m-3-3h8.25m0 0-3-3m3 3-3 3" />
        </svg>
      )}
      <span>{signingOut ? 'Signing out' : 'Sign out'}</span>
    </button>
  );
}

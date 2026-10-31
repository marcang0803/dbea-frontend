'use client';

// Home (P3): SGD balance, last 5 sends, unread badge.
// Data: C5 ViewAccountSummary via GET /api/account/summary.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import UnreadBadge from '@/components/UnreadBadge';
import SignOutButton from '@/components/SignOutButton';
import { ApiError, isSessionExpired, p3Api } from '@/lib/p3Api';
import { formatDateTime, formatMoney } from '@/lib/format';

const STATUS_STYLES = {
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  DEBITED: 'bg-amber-50 text-amber-700',
  FEE_REVIEW: 'bg-amber-50 text-amber-700',
  FAILED: 'bg-red-50 text-red-700',
};

const STATUS_LABELS = {
  COMPLETED: 'Sent',
  DEBITED: 'Processing',
  FEE_REVIEW: 'Processing',
  FAILED: 'Failed',
};

export default function HomePage() {
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Fetches C5. State is only set inside the promise callbacks (after the network call).
  const fetchSummary = useCallback(
    (signal) =>
      p3Api.getAccountSummary({ signal }).then(
        ({ data, warnings: w }) => {
          setSummary(data);
          setWarnings(w);
          setError('');
          setLoading(false);
        },
        (err) => {
          if (err?.name === 'AbortError') return;
          if (isSessionExpired(err)) {
            router.replace('/login?next=/home');
            return;
          }
          setLoading(false);
          setError(err instanceof ApiError ? err.message : 'Could not load your account.');
        },
      ),
    [router],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchSummary(controller.signal);
    return () => controller.abort();
  }, [fetchSummary]);

  function retry() {
    setLoading(true);
    setError('');
    fetchSummary();
  }

  const recent = summary?.recentRemittances ?? [];

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 font-bold text-white shadow-md shadow-emerald-900/10">R</span>
          <div>
            <h1 className="font-semibold tracking-tight text-slate-950">RemitEase</h1>
            <p className="text-xs text-slate-500">Your SGD wallet</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <UnreadBadge initialCount={summary?.unreadNotifications ?? 0} />
          <SignOutButton />
        </div>
      </header>

      {error && (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button onClick={retry} className="mt-2 font-medium underline">
            Try again
          </button>
        </div>
      )}

      {/* Balance card */}
      <section className="relative mt-7 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-900 p-6 text-white shadow-[0_20px_45px_-22px_rgba(4,120,87,0.75)]">
        <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/10 bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 -right-2 h-40 w-40 rounded-full border border-white/10" />
        <p className="relative text-sm font-medium text-emerald-100">Available balance</p>
        {loading && !summary ? (
          <div className="mt-2 h-9 w-40 animate-pulse rounded bg-emerald-600" />
        ) : (
          <p className="relative mt-1 text-4xl font-semibold tracking-tight tabular-nums">
            {summary ? formatMoney(summary.balance, summary.currency) : '—'}
          </p>
        )}
        {summary?.accountId && (
          <p className="mt-1 text-xs text-emerald-100">Account •••{String(summary.accountId).slice(-4)}</p>
        )}
        <Link
          href="/send"
          className="relative mt-7 inline-flex w-full items-center justify-center rounded-2xl bg-white py-3.5 font-semibold text-emerald-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-50 hover:shadow-md focus-visible:ring-4 focus-visible:ring-white/30"
        >
          Send money home
        </Link>
      </section>

      {warnings.length > 0 && (
        <p className="mt-5 rounded-2xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
          Some details couldn&apos;t be loaded right now. Your balance is up to date.
        </p>
      )}

      {/* Recent sends */}
      <section className="mt-9">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Recent sends</h2>
          {recent.length > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">Latest {recent.length}</span>}
        </div>

        {loading && !summary ? (
          <ul className="mt-3 space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </ul>
        ) : recent.length === 0 ? (
          <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            No transfers yet. Your sends will appear here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{r.nickname || 'Family transfer'}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(r.createdOn)}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums text-slate-900">{formatMoney(r.amountSGD, 'SGD')}</p>
                  {r.recipientAmount != null && r.payoutCurrency && (
                    <p className="text-xs tabular-nums text-slate-500">
                      → {formatMoney(r.recipientAmount, r.payoutCurrency)}
                    </p>
                  )}
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                      STATUS_STYLES[r.status] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

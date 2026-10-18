'use client';

// Home (P3): SGD balance, last 5 sends, unread badge.
// Data: C5 ViewAccountSummary via GET /api/account/summary.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import UnreadBadge from '@/components/UnreadBadge';
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
    <main className="mx-auto max-w-md px-4 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">RemitEase</h1>
        <UnreadBadge initialCount={summary?.unreadNotifications ?? 0} />
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
      <section className="mt-6 rounded-2xl bg-emerald-700 p-6 text-white shadow-sm">
        <p className="text-sm text-emerald-100">Available balance</p>
        {loading && !summary ? (
          <div className="mt-2 h-9 w-40 animate-pulse rounded bg-emerald-600" />
        ) : (
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {summary ? formatMoney(summary.balance, summary.currency) : '—'}
          </p>
        )}
        {summary?.accountId && (
          <p className="mt-1 text-xs text-emerald-100">Account •••{String(summary.accountId).slice(-4)}</p>
        )}
        <Link
          href="/send"
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-white py-3 font-medium text-emerald-800 hover:bg-emerald-50"
        >
          Send money home
        </Link>
      </section>

      {warnings.length > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Some details couldn&apos;t be loaded right now. Your balance is up to date.
        </p>
      )}

      {/* Recent sends */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-900">Recent sends</h2>

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

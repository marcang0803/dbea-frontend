'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { formatMoney } from '@/lib/format';
import { getAdvanceUserId, normalizeBand, p5Api } from '@/lib/p5Api';
import { normalizeAdvanceRecords } from '@/lib/p5AdvanceState.mjs';

function asList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.advances)) return data.advances;
  return null;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function addMonths(value, months) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function scheduleRows(advance) {
  const repayments = asList(advance.repayments);
  const tenor = Number(advance.tenorMonths);
  const remaining =
    String(advance.status).toUpperCase() === 'ACTIVE'
      ? Math.max(0, tenor - repayments.length)
      : 0;
  const future = [];

  for (let index = 0; index < remaining; index += 1) {
    const dueDate = addMonths(advance.nextDueDate, index);
    if (!dueDate) break;
    future.push({
      key: `upcoming-${advance.advanceId}-${index}`,
      dueDate,
      amount: advance.monthlyInstalment,
      status: 'UPCOMING',
    });
  }

  return [
    ...repayments.map((repayment) => ({
      ...repayment,
      key: `repayment-${repayment.repaymentId}`,
    })),
    ...future,
  ].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

function statusStyle(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'PAID' || value === 'COMPLETED') return 'bg-emerald-50 text-emerald-700';
  if (value === 'MISSED' || value === 'FAILED') return 'bg-red-50 text-red-700';
  if (value === 'ACTIVE') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
}

export default function MyAdvancePage() {
  const router = useRouter();
  const [advances, setAdvances] = useState([]);
  const [scoreSummary, setScoreSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const userId = await getAdvanceUserId({ signal: controller.signal });
        const { data } = await p5Api.getMyAdvanceData(
          userId,
          { signal: controller.signal },
        );
        const items = asList(data);
        if (!items) {
          throw new ApiError(
            'The My Advance service did not return an advances list. Please confirm the ScoreCS response contract.',
            502,
          );
        }
        setAdvances(normalizeAdvanceRecords(items));
        setScoreSummary(data?.latestScore !== undefined || data?.latestBand ? data : null);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (isSessionExpired(err)) {
          router.replace('/login?next=/advance/me');
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not load your advance schedule.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [router]);

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <Link href="/home" className="text-sm font-medium text-emerald-700 hover:underline">
        ← Back to home
      </Link>
      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">My Advance</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Your advance details, upcoming instalments, and repayment history.
        </p>
      </header>

      {error && (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-2 font-semibold underline">
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3" aria-label="Loading advances">
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-64 animate-pulse rounded-[1.75rem] bg-slate-100" />
        </div>
      ) : (
        <>
          {scoreSummary && (
            <section className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <p className="text-sm text-slate-500">Latest credit score</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
                  {scoreSummary.latestScore ?? '—'}
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-800">
                Band {normalizeBand(scoreSummary.latestBand)}
              </span>
            </section>
          )}

          {advances.length === 0 ? (
            <section className="mt-6 rounded-[1.75rem] border border-dashed border-slate-300 bg-white p-7 text-center">
              <p className="font-semibold text-slate-900">No advance records yet</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                When an advance is approved, its repayment schedule will appear here.
              </p>
              <Link href="/advance/offer" className="mt-5 inline-flex rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
                Check advance offer
              </Link>
            </section>
          ) : (
            <div className="mt-6 space-y-4">
              {advances.map((advance) => {
                const rows = scheduleRows(advance);
                return (
                  <article key={advance.advanceId} className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-500">Advance #{advance.advanceId}</p>
                          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
                            {formatMoney(advance.amount, 'SGD')}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(advance.status)}`}>
                          {advance.status || 'Unknown'}
                        </span>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-slate-500">Monthly instalment</dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {formatMoney(advance.monthlyInstalment, 'SGD')}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Term</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{advance.tenorMonths} months</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Next due</dt>
                          <dd className="mt-1 font-semibold text-slate-900">{formatDate(advance.nextDueDate)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Loan account</dt>
                          <dd className="mt-1 truncate font-medium text-slate-900">{advance.loanAccountId || '—'}</dd>
                        </div>
                      </dl>
                    </div>

                    <div className="border-t border-slate-100 px-5 py-4">
                      <h2 className="font-semibold text-slate-950">Repayment schedule</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Future dates are projected monthly from the next due date; the service provides repayment history, not future schedule rows.
                      </p>
                      {rows.length ? (
                        <ul className="mt-3 divide-y divide-slate-100">
                          {rows.map((row) => (
                            <li key={row.key} className="flex items-center justify-between gap-3 py-3 text-sm">
                              <div>
                                <p className="font-medium text-slate-900">{formatDate(row.dueDate)}</p>
                                {row.tBankTxnId && <p className="mt-0.5 text-xs text-slate-500">{row.tBankTxnId}</p>}
                              </div>
                              <div className="text-right">
                                <p className="font-semibold tabular-nums text-slate-900">{formatMoney(row.amount, 'SGD')}</p>
                                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle(row.status)}`}>
                                  {row.status || 'Unknown'}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">No repayment rows are available.</p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <Link href="/advance/offer" className="mt-8 block text-center text-sm font-medium text-emerald-700 hover:underline">
        View advance offer →
      </Link>
    </main>
  );
}

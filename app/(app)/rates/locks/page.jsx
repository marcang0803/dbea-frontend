'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { p2Api } from '@/lib/p2Api';
import { p4Api } from '@/lib/p4Api';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { formatRate } from '@/lib/corridors';
import { formatMoney } from '@/lib/format';

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

function formatDateTime(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function normalizeLocks(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.locks)) return data.locks;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.itemsList)) return data.itemsList;
  return [];
}

function statusClasses(status) {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'ACTIVE') {
    return 'bg-emerald-100 text-emerald-800';
  }

  if (
    normalized === 'MATURED' ||
    normalized === 'COMPLETED'
  ) {
    return 'bg-blue-100 text-blue-800';
  }

  if (
    normalized === 'CANCELLED' ||
    normalized === 'FAILED'
  ) {
    return 'bg-red-100 text-red-700';
  }

  if (normalized === 'PENDING') {
    return 'bg-amber-100 text-amber-800';
  }

  return 'bg-slate-100 text-slate-700';
}

export default function RateLocksPage() {
  const router = useRouter();

  const [locks, setLocks] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    Promise.allSettled([
      p4Api.listLocks({ signal: controller.signal }),
      p2Api.listBeneficiaries({
        signal: controller.signal,
      }),
    ]).then(([locksResult, beneficiariesResult]) => {
      if (locksResult.status === 'rejected') {
        const err = locksResult.reason;

        if (err?.name === 'AbortError') return;

        if (isSessionExpired(err)) {
          router.replace('/login?next=/rates/locks');
          return;
        }

        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your rate locks.',
        );

        setLoading(false);
        return;
      }

      setLocks(normalizeLocks(locksResult.value.data));

      if (beneficiariesResult.status === 'fulfilled') {
        const items = Array.isArray(
          beneficiariesResult.value.data?.items,
        )
          ? beneficiariesResult.value.data.items
          : [];

        setBeneficiaries(items);
      }

      setLoading(false);
    });

    return () => controller.abort();
  }, [router]);

  const beneficiariesById = useMemo(
    () =>
      new Map(
        beneficiaries.map((beneficiary) => [
          String(beneficiary.id),
          beneficiary,
        ]),
      ),
    [beneficiaries],
  );

  if (loading) {
    return (
      <main
        className="mx-auto max-w-md px-5 pb-12 pt-7"
        aria-label="Loading rate locks"
      >
        <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />

        <div className="mt-8 space-y-4">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-64 animate-pulse rounded-[1.75rem] bg-slate-100"
            />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <header>
        <Link
          href="/rates/lock"
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          ← Back to rate lock
        </Link>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              My rate locks
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              View your active and previous forward-rate
              contracts.
            </p>
          </div>

          <Link
            href="/rates/lock"
            className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
          >
            New lock
          </Link>
        </div>
      </header>

      {error && (
        <div className="mt-8">
          <p
            role="alert"
            className="rounded-2xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 font-medium text-emerald-700 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {!error && locks.length === 0 && (
        <section className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-7 text-center shadow-sm">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 10V7a5 5 0 0 1 10 0v3M6 10h12v10H6V10Z"
              />
            </svg>
          </div>

          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            No rate locks yet
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Preview and secure a forward exchange rate for a
            future transfer.
          </p>

          <Link
            href="/rates/lock"
            className="mt-6 inline-flex rounded-2xl bg-emerald-700 px-5 py-3 font-semibold text-white transition hover:bg-emerald-800"
          >
            Lock a rate
          </Link>
        </section>
      )}

      {!error && locks.length > 0 && (
        <div className="mt-8 space-y-4">
          {locks.map((lock) => {
            const beneficiary = beneficiariesById.get(
              String(lock.beneficiaryLinkId),
            );

            const currency =
              lock.quoteCurrency || beneficiary?.payoutCurrency?.trim().toUpperCase() || '';

            return (
              <article
                key={lock.lockId}
                className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.5)]"
              >
                <div className="bg-gradient-to-br from-emerald-700 to-teal-900 px-5 py-5 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm text-emerald-100">
                        Lock #{lock.lockId}
                      </p>

                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        S$1 ={' '}
                        {currency ? `${formatRate(lock.lockedRate)} ${currency}` : 'Payout currency unavailable'}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(
                        lock.status,
                      )}`}
                    >
                      {lock.status || 'UNKNOWN'}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-emerald-100">
                    {beneficiary
                      ? `For ${beneficiary.nickname}`
                      : `Beneficiary #${lock.beneficiaryLinkId}`}
                  </p>
                </div>

                <dl className="divide-y divide-slate-100 px-5 py-2 text-sm">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-600">
                      Amount protected
                    </dt>

                    <dd className="font-medium tabular-nums text-slate-900">
                      {formatMoney(lock.amountSGD)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-600">
                      Period
                    </dt>

                    <dd className="font-medium text-slate-900">
                      {lock.period || '—'}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-600">
                      Maturity date
                    </dt>

                    <dd className="font-medium text-slate-900">
                      {formatDate(lock.maturityDate)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-600">
                      FX forward ID
                    </dt>

                    <dd className="font-medium text-slate-900">
                      {lock.fxForwardId ?? '—'}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-slate-600">
                      Created
                    </dt>

                    <dd className="text-right font-medium text-slate-900">
                      {formatDateTime(lock.createdOn)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex justify-center gap-5 text-sm">
        <Link
          href="/rates/lock"
          className="font-medium text-emerald-700 hover:underline"
        >
          Lock another rate
        </Link>

        <Link
          href="/rates/alerts"
          className="font-medium text-emerald-700 hover:underline"
        >
          Rate alerts
        </Link>
      </div>
    </main>
  );
}
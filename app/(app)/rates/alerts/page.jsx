'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { p4Api } from '@/lib/p4Api';
import { ApiError, isSessionExpired } from '@/lib/p3Api';

function normalizeAlerts(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.alerts)) return data.alerts;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.itemsList)) return data.itemsList;
  return [];
}

function formatDateTime(value) {
  if (!value) return 'Never';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Never';

  return new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function RateAlertsPage() {
  const router = useRouter();

  const [alerts, setAlerts] = useState([]);
  const [corridor, setCorridor] = useState('SGD-PHP');
  const [targetRate, setTargetRate] = useState('');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    p4Api
      .listAlerts({ signal: controller.signal })
      .then(({ data }) => {
        setAlerts(normalizeAlerts(data));
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;

        if (isSessionExpired(err)) {
          router.replace('/login?next=/rates/alerts');
          return;
        }

        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your rate alerts.',
        );

        setLoading(false);
      });

    return () => controller.abort();
  }, [router]);

  const numericTargetRate = Number(targetRate);

  const targetRateError =
    targetRate &&
    (!Number.isFinite(numericTargetRate) ||
      numericTargetRate <= 0)
      ? 'Enter a target rate greater than zero.'
      : '';

  const canSubmit =
    Boolean(corridor) &&
    Boolean(targetRate) &&
    !targetRateError &&
    !submitting;

  async function handleCreateAlert(event) {
    event.preventDefault();

    if (!canSubmit) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await p4Api.createAlert({
        corridor,
        targetRate: numericTargetRate,
      });

      setAlerts((current) => [data, ...current]);
      setTargetRate('');
      setSuccess('Your target-rate alert has been created.');
    } catch (err) {
      if (isSessionExpired(err)) {
        router.replace('/login?next=/rates/alerts');
        return;
      }

      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not create the rate alert.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteAlert(alertId) {
    const confirmed = window.confirm(
      'Delete this target-rate alert?',
    );

    if (!confirmed) return;

    setDeletingId(alertId);
    setError('');
    setSuccess('');

    try {
      await p4Api.deleteAlert(alertId);

      setAlerts((current) =>
        current.filter(
          (alert) =>
            String(alert.alertId) !== String(alertId),
        ),
      );

      setSuccess('The rate alert has been deleted.');
    } catch (err) {
      if (isSessionExpired(err)) {
        router.replace('/login?next=/rates/alerts');
        return;
      }

      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not delete the rate alert.',
      );
    } finally {
      setDeletingId(null);
    }
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

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          Rate alerts
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Receive a notification when your preferred exchange
          rate is reached.
        </p>
      </header>

      <section className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.5)]">
        <h2 className="text-lg font-semibold text-slate-900">
          Create an alert
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Choose a currency corridor and your target rate.
        </p>

        <form
          onSubmit={handleCreateAlert}
          className="mt-6 space-y-5"
        >
          <div>
            <label
              htmlFor="alert-corridor"
              className="text-sm font-semibold text-slate-900"
            >
              Currency corridor
            </label>

            <select
              id="alert-corridor"
              value={corridor}
              onChange={(event) =>
                setCorridor(event.target.value)
              }
              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3.5 text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
            >
              <option value="SGD-PHP">SGD → PHP</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="target-rate"
              className="text-sm font-semibold text-slate-900"
            >
              Target rate
            </label>

            <div className="mt-2 flex items-center rounded-2xl border border-slate-300 bg-white px-4 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
              <span className="text-sm font-medium text-slate-500">
                S$1 =
              </span>

              <input
                id="target-rate"
                type="number"
                min="0.0001"
                step="0.0001"
                inputMode="decimal"
                value={targetRate}
                onChange={(event) => {
                  setTargetRate(event.target.value);
                  setError('');
                  setSuccess('');
                }}
                placeholder="44.0000"
                className="min-w-0 flex-1 bg-transparent px-3 py-4 text-right text-xl font-semibold tabular-nums text-slate-900 outline-none"
              />

              <span className="text-sm font-medium text-slate-500">
                PHP
              </span>
            </div>

            {targetRateError ? (
              <p className="mt-2 text-sm text-red-600">
                {targetRateError}
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                We will notify you when the market rate reaches
                this value.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-3.5 font-semibold text-white shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
          >
            {submitting ? 'Creating alert…' : 'Create alert'}
          </button>
        </form>
      </section>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              My alerts
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Active target-rate notifications.
            </p>
          </div>

          {!loading && (
            <span className="text-sm text-slate-500">
              {alerts.length}{' '}
              {alerts.length === 1 ? 'alert' : 'alerts'}
            </span>
          )}
        </div>

        {loading ? (
          <div
            className="mt-4 space-y-3"
            aria-hidden="true"
          >
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-40 animate-pulse rounded-2xl bg-slate-100"
              />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
                />
              </svg>
            </div>

            <h3 className="mt-4 font-semibold text-slate-900">
              No rate alerts
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Create an alert above to monitor a target rate.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {alerts.map((alert) => (
              <article
                key={alert.alertId}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {alert.corridor ||
                          'Currency corridor'}
                      </h3>

                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          alert.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {alert.isActive
                          ? 'ACTIVE'
                          : 'INACTIVE'}
                      </span>
                    </div>

                    <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-950">
                      S$1 ={' '}
                      {Number(alert.targetRate).toFixed(4)} PHP
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteAlert(alert.alertId)
                    }
                    disabled={deletingId === alert.alertId}
                    aria-label={`Delete alert ${alert.alertId}`}
                    className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === alert.alertId
                      ? 'Deleting…'
                      : 'Delete'}
                  </button>
                </div>

                <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">
                      Alert ID
                    </dt>

                    <dd className="font-medium text-slate-900">
                      {alert.alertId}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">
                      Created
                    </dt>

                    <dd className="text-right font-medium text-slate-900">
                      {formatDateTime(alert.createdOn)}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">
                      Last triggered
                    </dt>

                    <dd className="text-right font-medium text-slate-900">
                      {formatDateTime(
                        alert.lastTriggeredAt,
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 flex justify-center gap-5 text-sm">
        <Link
          href="/rates/lock"
          className="font-medium text-emerald-700 hover:underline"
        >
          Lock a rate
        </Link>

        <Link
          href="/rates/locks"
          className="font-medium text-emerald-700 hover:underline"
        >
          My rate locks
        </Link>
      </div>
    </main>
  );
}
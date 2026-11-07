'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { formatMoney } from '@/lib/format';
import { getAdvanceContext, normalizeBand, p5Api } from '@/lib/p5Api';

const PLAN_TENORS = [3, 6, 12];
const DEFAULT_REQUESTED_AMOUNT = 500;

function scoreReasons(value) {
  let factors = value;

  if (typeof factors === 'string') {
    try {
      factors = JSON.parse(factors);
    } catch {
      return factors.trim() ? [factors] : [];
    }
  }

  if (Array.isArray(factors)) {
    return factors.map((factor) => {
      if (typeof factor === 'string') return factor;
      if (!factor || typeof factor !== 'object') return String(factor);
      return (
        factor.reason ||
        factor.label ||
        factor.factor ||
        factor.name ||
        Object.entries(factor)
          .map(([key, item]) => `${key}: ${item}`)
          .join(' · ')
      );
    });
  }

  if (factors && typeof factors === 'object') {
    return Object.entries(factors).map(([key, item]) => `${key}: ${item}`);
  }

  return [];
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

function errorMessage(error) {
  return error instanceof ApiError ? error.message : 'Could not load this plan.';
}

export default function AdvanceOfferPage() {
  const router = useRouter();
  const [context, setContext] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [plans, setPlans] = useState([]);
  const [requestedAmount, setRequestedAmount] = useState(String(DEFAULT_REQUESTED_AMOUNT));
  const [selectedTenor, setSelectedTenor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingPlans, setCheckingPlans] = useState(false);
  const [error, setError] = useState('');
  const [amountError, setAmountError] = useState('');

  const loadPlans = useCallback(async (advanceContext, scoreSnapshot, amount) => {
    const snapshotId = scoreSnapshot?.id ?? scoreSnapshot?.snapshotId;

    if (snapshotId == null) {
      throw new ApiError('The score service did not return a snapshot ID.', 502);
    }

    const results = await Promise.all(
      PLAN_TENORS.map(async (tenor) => {
        try {
          const { data } = await p5Api.checkEligibility({
            userId: advanceContext.userId,
            tBankAccountId: advanceContext.tBankAccountId,
            requestedAmount: amount,
            selectedTenorMonths: tenor,
            snapshotId,
          });
          return { tenor, data };
        } catch (planError) {
          if (planError?.name === 'AbortError') throw planError;
          if (isSessionExpired(planError)) throw planError;
          return { tenor, error: errorMessage(planError) };
        }
      }),
    );

    setPlans(results);
    setSelectedTenor(
      results.find((plan) => plan.data?.isEligible)?.tenor ?? null,
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOffer() {
      try {
        const advanceContext = await getAdvanceContext({
          signal: controller.signal,
        });
        const { data: score } = await p5Api.createScoreSnapshot(
          advanceContext.userId,
          advanceContext.tBankAccountId,
          { signal: controller.signal },
        );
        setContext(advanceContext);
        setSnapshot(score);
        await loadPlans(advanceContext, score, DEFAULT_REQUESTED_AMOUNT);
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (isSessionExpired(err)) {
          router.replace('/login?next=/advance/offer');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load your advance offer.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadOffer();
    return () => controller.abort();
  }, [loadPlans, router]);

  async function updatePlans(event) {
    event.preventDefault();
    const amount = Number(requestedAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setAmountError('Enter an amount greater than S$0.');
      return;
    }

    if (!context || !snapshot) return;

    setAmountError('');
    setError('');
    setCheckingPlans(true);
    try {
      await loadPlans(context, snapshot, amount);
    } catch (err) {
      if (isSessionExpired(err)) {
        router.replace('/login?next=/advance/offer');
        return;
      }
      setError(errorMessage(err));
    } finally {
      setCheckingPlans(false);
    }
  }

  const score = snapshot?.score;
  const band = normalizeBand(snapshot?.band || snapshot?.approvedBand);
  const reasons = scoreReasons(snapshot?.factorBreakdown);
  const chosenPlan = plans.find((plan) => plan.tenor === selectedTenor);
  const snapshotId = snapshot?.id ?? snapshot?.snapshotId;
  const confirmHref =
    chosenPlan?.data && snapshotId != null
      ? `/advance/confirm?${new URLSearchParams({
          amount: String(chosenPlan.data.selectedPlanAmount ?? requestedAmount),
          months: String(chosenPlan.data.selectedTenor ?? chosenPlan.tenor),
          snapshotId: String(snapshotId),
        }).toString()}`
      : '';

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <Link href="/home" className="text-sm font-medium text-emerald-700 hover:underline">
        ← Back to home
      </Link>

      <header className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Advance offer</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Review your credit score, the factors behind it, and available repayment plans.
        </p>
      </header>

      {error && (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-3" aria-label="Loading advance offer">
          <div className="h-36 animate-pulse rounded-[1.75rem] bg-slate-100" />
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-[1.75rem] bg-gradient-to-br from-emerald-700 to-teal-900 p-6 text-white shadow-lg">
            <p className="text-sm font-medium text-emerald-100">Your latest score</p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <p className="text-5xl font-semibold tabular-nums">{score ?? '—'}</p>
              <p className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
                Band {band}
              </p>
            </div>
            <p className="mt-4 text-sm text-emerald-50">
              Score snapshot from {formatDate(snapshot?.createdOn)}.
            </p>
          </section>

          <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-950">What affects your score</h2>
            {reasons.length ? (
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {reasons.map((reason, index) => (
                  <li key={`${reason}-${index}`} className="flex gap-2">
                    <span className="mt-0.5 text-emerald-600" aria-hidden="true">✓</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                The score service did not return a factor breakdown.
              </p>
            )}
          </section>

          <section className="mt-7">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950">Choose a plan</h2>
              <p className="mt-1 text-sm text-slate-500">
                Compare estimated monthly instalments for different terms.
              </p>
            </div>

            <form onSubmit={updatePlans} className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label htmlFor="advance-amount" className="text-sm font-medium text-slate-700">
                Requested amount (SGD)
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="advance-amount"
                  type="number"
                  min="1"
                  step="0.01"
                  inputMode="decimal"
                  value={requestedAmount}
                  onChange={(event) => setRequestedAmount(event.target.value)}
                  aria-describedby={amountError ? 'advance-amount-error' : undefined}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 focus-visible:ring-2 focus-visible:ring-emerald-600"
                />
                <button
                  type="submit"
                  disabled={checkingPlans}
                  className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {checkingPlans ? 'Updating…' : 'Update'}
                </button>
              </div>
              {amountError && <p id="advance-amount-error" className="mt-2 text-sm text-red-700">{amountError}</p>}
            </form>

            <div className="mt-3 space-y-3">
              {plans.map((plan) => {
                const result = plan.data;
                const eligible = Boolean(result?.isEligible);
                const selected = plan.tenor === selectedTenor;
                return (
                  <article
                    key={plan.tenor}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ${
                      selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-950">{plan.tenor} months</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {result ? `${formatMoney(result.selectedPlanAmount ?? Number(requestedAmount), 'SGD')} requested` : 'Eligibility check'}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        plan.error
                          ? 'bg-red-50 text-red-700'
                          : eligible
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}>
                        {plan.error ? 'Unavailable' : eligible ? 'Eligible' : 'Not eligible'}
                      </span>
                    </div>

                    {plan.error ? (
                      <p role="status" className="mt-3 text-sm text-red-700">{plan.error}</p>
                    ) : result ? (
                      <>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-slate-500">Monthly instalment</dt>
                            <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                              {formatMoney(result.monthlyInstalment, 'SGD')}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Interest rate</dt>
                            <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                              {result.interestRate == null ? '—' : `${result.interestRate}%`}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Maximum advance</dt>
                            <dd className="mt-1 font-medium tabular-nums text-slate-900">
                              {formatMoney(result.maxAdvanceAmount, 'SGD')}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-slate-500">Maturity date</dt>
                            <dd className="mt-1 font-medium text-slate-900">{formatDate(result.maturityDate)}</dd>
                          </div>
                        </dl>
                        {eligible && (
                          <button
                            type="button"
                            onClick={() => setSelectedTenor(plan.tenor)}
                            className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                              selected
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'border border-emerald-700 text-emerald-700 hover:bg-emerald-50'
                            }`}
                          >
                            {selected ? 'Selected plan' : 'Choose this plan'}
                          </button>
                        )}
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {confirmHref && (
              <Link
                href={confirmHref}
                className="mt-5 block rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 px-5 py-3.5 text-center font-semibold text-white shadow-md hover:from-emerald-800 hover:to-teal-800"
              >
                Continue to confirmation
              </Link>
            )}
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Plan terms are checked by the eligibility service. Continuing passes the selected amount, months, and score snapshot to P6.
            </p>
          </section>
        </>
      )}

      <Link href="/advance/me" className="mt-8 block text-center text-sm font-medium text-emerald-700 hover:underline">
        View My Advance schedule →
      </Link>
    </main>
  );
}

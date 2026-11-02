'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import OtpDialog from '@/components/OtpDialog';
import { p2Api } from '@/lib/p2Api';
import { p4Api } from '@/lib/p4Api';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { formatMoney } from '@/lib/format';

const PERIODS = [
  {
    value: '1M',
    label: '1 month',
  },
  {
    value: '3M',
    label: '3 months',
  },
  {
    value: '6M',
    label: '6 months',
  },
  {
    value: '1Y',
    label: '1 year',
  },
];

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

function ResultRow({ label, children, strong = false }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2 ${
        strong
          ? 'font-semibold text-slate-900'
          : 'text-slate-600'
      }`}
    >
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

export default function RateLockPage() {
  const router = useRouter();

  const [beneficiaries, setBeneficiaries] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState('1M');

  const [loadingBeneficiaries, setLoadingBeneficiaries] =
    useState(true);
  const [previewing, setPreviewing] = useState(false);

  const [preview, setPreview] = useState(null);
  const [referenceId, setReferenceId] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [createdLock, setCreatedLock] = useState(null);

  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    p2Api
      .listBeneficiaries({ signal: controller.signal })
      .then(({ data }) => {
        const items = Array.isArray(data?.items)
          ? data.items.filter((item) => item.isActive)
          : [];

        setBeneficiaries(items);

        if (items.length === 1) {
          setSelectedId(String(items[0].id));
        }

        setLoadingBeneficiaries(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;

        if (isSessionExpired(err)) {
          router.replace('/login?next=/rates/lock');
          return;
        }

        setError(
          err instanceof ApiError
            ? err.message
            : 'Could not load your beneficiaries.',
        );

        setLoadingBeneficiaries(false);
      });

    return () => controller.abort();
  }, [router]);

  const selectedBeneficiary = useMemo(
    () =>
      beneficiaries.find(
        (item) => String(item.id) === selectedId,
      ),
    [beneficiaries, selectedId],
  );

  const numericAmount = Number(amount);

  const amountError = useMemo(() => {
    if (!amount) return '';

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return 'Enter an amount greater than S$0.';
    }

    return '';
  }, [amount, numericAmount]);

  const canPreview =
    Boolean(selectedId) &&
    Boolean(amount) &&
    Boolean(period) &&
    !amountError &&
    !previewing;

  function clearPreview() {
    setPreview(null);
    setReferenceId('');
    setShowOtp(false);
    setCreatedLock(null);
    setError('');
  }

  function handleBeneficiaryChange(value) {
    setSelectedId(value);
    clearPreview();
  }

  function handleAmountChange(value) {
    setAmount(value);
    clearPreview();
  }

  function handlePeriodChange(value) {
    setPeriod(value);
    clearPreview();
  }

  async function handlePreview(event) {
    event.preventDefault();

    if (!canPreview) return;

    setPreviewing(true);
    setPreview(null);
    setCreatedLock(null);
    setReferenceId('');
    setError('');

    try {
      const { data } = await p4Api.previewLock({
        beneficiaryLinkId: Number(selectedId),
        amountSGD: numericAmount,
        period,
      });

      setPreview(data);

      // This value is no longer than 50 characters and remains unchanged
      // between requesting and verifying the LOCK OTP.
      setReferenceId(crypto.randomUUID());
    } catch (err) {
      if (isSessionExpired(err)) {
        router.replace('/login?next=/rates/lock');
        return;
      }

      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not retrieve the forward rate.',
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function confirmLock({ challengeId, otpCode }) {
    const { data } = await p4Api.createLock({
      beneficiaryLinkId: Number(selectedId),
      amountSGD: numericAmount,
      period,
      challengeId,
      otpCode,
      referenceId,
    });

    setCreatedLock(data);
    setShowOtp(false);
  }

  function startAgain() {
    setAmount('');
    setPeriod('1M');
    setPreview(null);
    setReferenceId('');
    setCreatedLock(null);
    setShowOtp(false);
    setError('');
  }

  if (createdLock) {
    return (
      <main className="mx-auto max-w-md px-5 pb-12 pt-7">
        <div className="rounded-[1.75rem] border border-emerald-200 bg-white p-6 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.5)]">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m5 12 4 4L19 6"
              />
            </svg>
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950">
            Rate locked successfully
          </h1>

          <p className="mt-2 text-sm text-slate-600">
            Your forward exchange rate has been secured.
          </p>

          <dl className="mt-6 divide-y divide-slate-100 text-sm">
            <ResultRow label="Lock ID">
              {createdLock.lockId ?? '—'}
            </ResultRow>

            <ResultRow label="Amount">
              {formatMoney(
                createdLock.amountSGD ?? numericAmount,
              )}
            </ResultRow>

            <ResultRow label="Locked rate" strong>
              S$1 ={' '}
              {Number(
                createdLock.lockedRate ??
                  preview?.forwardRate,
              ).toFixed(4)}{' '}
              {selectedBeneficiary?.payoutCurrency ?? 'PHP'}
            </ResultRow>

            <ResultRow label="Period">
              {createdLock.period ?? period}
            </ResultRow>

            <ResultRow label="Maturity date">
              {formatDate(
                createdLock.maturityDate ??
                  preview?.maturityDate,
              )}
            </ResultRow>

            <ResultRow label="Status">
              {createdLock.status ?? 'ACTIVE'}
            </ResultRow>
          </dl>

          <Link
            href="/rates/locks"
            className="mt-7 block w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-3.5 text-center font-semibold text-white shadow-lg shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            View my rate locks
          </Link>

          <button
            type="button"
            onClick={startAgain}
            className="mt-3 w-full rounded-2xl border border-slate-300 bg-white py-3.5 font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Lock another rate
          </button>

          <Link
            href="/home"
            className="mt-5 block text-center text-sm font-medium text-emerald-700 hover:underline"
          >
            Return to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <header>
        <Link
          href="/home"
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          ← Back to home
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
          Lock an exchange rate
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          Secure today&apos;s forward rate for a future transfer.
        </p>
      </header>

      <form
        onSubmit={handlePreview}
        className="mt-8 space-y-8"
      >
        <section>
          <h2 className="font-semibold text-slate-900">
            Choose a beneficiary
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            The destination currency is taken from the selected
            beneficiary.
          </p>

          {loadingBeneficiaries ? (
            <div
              className="mt-3 space-y-2"
              aria-hidden="true"
            >
              {[0, 1].map((item) => (
                <div
                  key={item}
                  className="h-20 animate-pulse rounded-2xl bg-slate-100"
                />
              ))}
            </div>
          ) : beneficiaries.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No active beneficiaries are available. Add or
              activate one before locking a rate.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {beneficiaries.map((beneficiary) => {
                const selected =
                  selectedId === String(beneficiary.id);

                return (
                  <label
                    key={beneficiary.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 ${
                      selected
                        ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="beneficiary"
                      value={beneficiary.id}
                      checked={selected}
                      onChange={(event) =>
                        handleBeneficiaryChange(
                          event.target.value,
                        )
                      }
                      className="h-4 w-4 accent-emerald-700"
                    />

                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 font-semibold text-white">
                      {beneficiary.nickname
                        ?.slice(0, 1)
                        .toUpperCase() || 'B'}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">
                        {beneficiary.nickname}
                      </span>

                      <span className="block truncate text-sm text-slate-500">
                        {beneficiary.relationshipLabel} ·{' '}
                        {beneficiary.bankName} •••
                        {beneficiary.accountLast4}
                      </span>
                    </span>

                    <span className="text-xs font-medium text-slate-500">
                      {beneficiary.payoutCurrency}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <label
            htmlFor="lock-amount"
            className="font-semibold text-slate-900"
          >
            Amount to protect
          </label>

          <div className="mt-3 flex items-center rounded-2xl border border-slate-300 bg-white px-4 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
            <span className="font-medium text-slate-500">
              S$
            </span>

            <input
              id="lock-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) =>
                handleAmountChange(event.target.value)
              }
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent px-3 py-4 text-right text-2xl font-semibold tabular-nums text-slate-900 outline-none"
            />

            <span className="text-sm font-medium text-slate-500">
              SGD
            </span>
          </div>

          {amountError && (
            <p className="mt-2 text-sm text-red-600">
              {amountError}
            </p>
          )}
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">
            Lock period
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Choose when the forward contract will mature.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {PERIODS.map((option) => {
              const selected = period === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    handlePeriodChange(option.value)
                  }
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    selected
                      ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="block font-semibold text-slate-900">
                    {option.value}
                  </span>

                  <span className="mt-0.5 block text-xs text-slate-500">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canPreview}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
        >
          {previewing
            ? 'Getting forward rate…'
            : preview
              ? 'Refresh preview'
              : 'Preview rate'}
        </button>
      </form>

      {preview && (
        <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.5)]">
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 to-teal-900 px-6 py-7 text-white">
            <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border border-white/10 bg-white/5" />

            <p className="text-sm text-emerald-100">
              Forward exchange rate
            </p>

            <p className="mt-1 text-3xl font-semibold tabular-nums">
              S$1 = {Number(preview.forwardRate).toFixed(4)}{' '}
              {selectedBeneficiary?.payoutCurrency ?? 'PHP'}
            </p>

            <p className="mt-2 text-sm text-emerald-100">
              For {selectedBeneficiary?.nickname}
            </p>
          </div>

          <dl className="divide-y divide-slate-100 px-5 py-3 text-sm">
            <ResultRow label="Amount protected">
              {formatMoney(numericAmount)}
            </ResultRow>

            <ResultRow label="Recipient amount" strong>
              {formatMoney(
                preview.recipientAmount,
                selectedBeneficiary?.payoutCurrency ?? 'PHP',
              )}
            </ResultRow>

            <ResultRow label="Period">{period}</ResultRow>

            <ResultRow label="Maturity date">
              {formatDate(preview.maturityDate)}
            </ResultRow>
          </dl>

          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => setShowOtp(true)}
              disabled={!referenceId}
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
            >
              Confirm and lock rate
            </button>

            <p className="mt-3 text-center text-xs text-slate-500">
              You will confirm this action with an SMS code.
            </p>
          </div>
        </section>
      )}

      <div className="mt-8 flex justify-center gap-5 text-sm">
        <Link
          href="/rates/locks"
          className="font-medium text-emerald-700 hover:underline"
        >
          My rate locks
        </Link>

        <Link
          href="/rates/alerts"
          className="font-medium text-emerald-700 hover:underline"
        >
          Rate alerts
        </Link>
      </div>

      <OtpDialog
        open={showOtp}
        purpose="LOCK"
        referenceId={referenceId}
        title="Confirm rate lock"
        description="Enter the code we sent to approve this rate lock."
        confirmLabel="Lock rate"
        onSubmit={confirmLock}
        onClose={() => setShowOtp(false)}
      />
    </main>
  );
}
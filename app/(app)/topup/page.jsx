'use client';

// Top up (P1): add money to the worker's own SGD account.
//   1. Choose an amount (S$10 – S$5,000).
//   2. OtpDialog asks C13 RequestOTP for a TOPUP code (referenceId = this top-up's requestId).
//   3. POST /api/account/topup verifies the code server-side, then tBank DepositCash credits
//      the user's own account (the backend takes the account from GetSenderByUser, never from here).

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import OtpDialog from '@/components/OtpDialog';
import { ApiError, isSessionExpired, p3Api } from '@/lib/p3Api';
import { TOPUP_MAX, TOPUP_MIN, TOPUP_QUICK_AMOUNTS, p1Api } from '@/lib/p1Api';
import { formatMoney } from '@/lib/format';

const PRIMARY_BUTTON =
  'w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none';

function amountError(raw) {
  if (raw === '') return 'Enter an amount.';
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return 'Enter a valid amount, e.g. 100 or 100.50.';
  const n = Number(raw);
  if (n < TOPUP_MIN) return `The minimum top-up is ${formatMoney(TOPUP_MIN, 'SGD')}.`;
  if (n > TOPUP_MAX) return `The maximum top-up is ${formatMoney(TOPUP_MAX, 'SGD')}.`;
  return '';
}

export default function TopUpPage() {
  const router = useRouter();
  const [summary, setSummary] = useState(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [result, setResult] = useState(null); // { amountSGD, newBalance }

  const toLogin = useCallback(() => router.replace('/login'), [router]);

  // Current balance, shown above the amount. Re-runs when Next.js shows this kept page again.
  useEffect(() => {
    const controller = new AbortController();
    p3Api.getAccountSummary({ signal: controller.signal }).then(
      ({ data }) => setSummary(data),
      (err) => {
        if (err?.name === 'AbortError') return;
        if (isSessionExpired(err)) toLogin();
        // Balance is only informational here; the top-up still works without it.
      },
    );
    return () => controller.abort();
  }, [toLogin]);

  // Next.js keeps this page mounted after you leave. Start fresh on the next visit.
  useLayoutEffect(
    () => () => {
      setAmount('');
      setError('');
      setShowOtp(false);
      setResult(null);
    },
    [],
  );

  function onContinue(e) {
    e.preventDefault();
    const msg = amountError(amount);
    setError(msg);
    if (msg) return;
    // A new reference per attempt: the OTP is bound to this exact top-up.
    setRequestId(crypto.randomUUID());
    setShowOtp(true);
  }

  // Called by OtpDialog. Must throw ApiError (422 wrong code, 409 expired) so the dialog can react.
  async function confirmTopUp({ challengeId, otpCode }) {
    try {
      const { data } = await p1Api.topUp({ amountSGD: Number(amount), requestId, challengeId, otpCode });
      setShowOtp(false);
      setResult({ amountSGD: data?.amountSGD ?? Number(amount), newBalance: data?.newBalance });
      setSummary((s) => (s && data?.newBalance != null ? { ...s, balance: data.newBalance } : s));
    } catch (err) {
      if (isSessionExpired(err)) {
        toLogin();
        return;
      }
      if (err instanceof ApiError && (err.status === 422 || err.status === 409)) throw err;
      // Anything else (e.g. bank error): close the dialog and show it on the page.
      setShowOtp(false);
      setError(err instanceof ApiError ? err.message : 'Could not top up. Please try again.');
    }
  }

  if (result) {
    return (
      <main className="mx-auto max-w-md px-5 pb-12 pt-10">
        <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-900 p-6 text-white shadow-[0_20px_45px_-22px_rgba(4,120,87,0.75)]">
          <p className="text-sm text-emerald-100">Top up successful</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            +{formatMoney(result.amountSGD, 'SGD')}
          </p>
          {result.newBalance != null && (
            <p className="mt-3 text-sm text-emerald-50">
              New balance: <span className="font-semibold tabular-nums">{formatMoney(result.newBalance, 'SGD')}</span>
            </p>
          )}
        </div>
        <Link
          href="/send"
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          Send money home
        </Link>
        <Link href="/home" className="mt-3 block py-3 text-center text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <Link href="/home" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
        ← Back to home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Top up</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add money to your RemitEase account
        {summary?.accountId ? ` (•••${String(summary.accountId).slice(-4)})` : ''}.
      </p>

      {summary && (
        <p className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          Current balance{' '}
          <span className="float-right font-semibold tabular-nums text-slate-900">
            {formatMoney(summary.balance, summary.currency || 'SGD')}
          </span>
        </p>
      )}

      <form onSubmit={onContinue} noValidate className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Amount</span>
          <div className="mt-2 flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-emerald-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-600/10">
            <span className="text-lg font-medium text-slate-500">S$</span>
            <input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.]/g, ''));
                setError('');
              }}
              inputMode="decimal"
              placeholder="0.00"
              aria-describedby="topup-hint"
              className="w-full bg-transparent px-2 py-3.5 text-2xl font-semibold tabular-nums text-slate-900 outline-none"
            />
          </div>
          <span id="topup-hint" className="mt-1 block text-xs text-slate-500">
            {formatMoney(TOPUP_MIN, 'SGD')} – {formatMoney(TOPUP_MAX, 'SGD')} per top-up
          </span>
        </label>

        <div className="grid grid-cols-4 gap-2">
          {TOPUP_QUICK_AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setAmount(String(n));
                setError('');
              }}
              className={`rounded-xl border py-2.5 text-sm font-medium transition ${
                amount === String(n)
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              S${n}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" className={PRIMARY_BUTTON}>
          Continue
        </button>
        <p className="text-center text-xs leading-5 text-slate-400">
          Demo top-up: money is added by our partner bank&apos;s test environment (simulated PayNow).
        </p>
      </form>

      <OtpDialog
        open={showOtp}
        purpose="TOPUP"
        referenceId={requestId}
        title="Confirm top up"
        description={`Enter the code we sent to add ${amount ? formatMoney(Number(amount), 'SGD') : 'this amount'} to your account.`}
        confirmLabel="Top up"
        onSubmit={confirmTopUp}
        onClose={() => setShowOtp(false)}
      />
    </main>
  );
}

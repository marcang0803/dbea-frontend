'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, isSessionExpired, p3Api } from '@/lib/p3Api';
import { p2Api } from '@/lib/p2Api';
import { formatMoney } from '@/lib/format';

const MINIMUM_SEND = 10;

export default function SendPage() {
  const router = useRouter();
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [balance, setBalance] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      p2Api.listBeneficiaries({ signal: controller.signal }),
      p3Api.getAccountSummary({ signal: controller.signal }),
    ]).then(
      ([beneficiaryResult, summaryResult]) => {
        const active = (beneficiaryResult.data?.items ?? []).filter((item) => item.isActive);
        setBeneficiaries(active);
        setBalance(Number(summaryResult.data?.balance));
        if (active.length === 1) setSelectedId(String(active[0].id));
        setLoading(false);
      },
      (err) => {
        if (err?.name === 'AbortError') return;
        if (isSessionExpired(err)) {
          router.replace('/login?next=/send');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load your transfer details.');
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [router]);

  const numericAmount = Number(amount);
  const amountError = useMemo(() => {
    if (!amount) return '';
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return 'Enter a valid amount.';
    if (numericAmount < MINIMUM_SEND) return `Minimum send amount is ${formatMoney(MINIMUM_SEND)}.`;
    if (balance != null && numericAmount > balance) return 'This amount is more than your available balance.';
    return '';
  }, [amount, balance, numericAmount]);

  const canContinue = Boolean(selectedId) && Boolean(amount) && !amountError && !submitting;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canContinue) return;
    setSubmitting(true);
    setError('');
    try {
      const { data } = await p2Api.createQuote(Number(selectedId), numericAmount);
      router.push(`/send/confirm?quoteId=${encodeURIComponent(data.quoteId)}`);
    } catch (err) {
      if (isSessionExpired(err)) {
        router.replace('/login?next=/send');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not create a quote. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/home"
          aria-label="Back to home"
          className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-xl text-slate-700 hover:bg-slate-50"
        >
          ←
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">Step 1 of 3</p>
          <h1 className="text-xl font-semibold text-slate-900">Send money home</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="mt-7 space-y-7">
        <section>
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Who are you sending to?</h2>
              <p className="mt-1 text-sm text-slate-500">Choose one of your active beneficiaries.</p>
            </div>
          </div>

          {loading ? (
            <div className="mt-3 space-y-2" aria-hidden="true">
              {[0, 1].map((item) => (
                <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : beneficiaries.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No active beneficiaries are available. Add or activate one before sending money.
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {beneficiaries.map((beneficiary) => {
                const selected = selectedId === String(beneficiary.id);
                return (
                  <label
                    key={beneficiary.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${
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
                      onChange={(event) => setSelectedId(event.target.value)}
                      className="h-4 w-4 accent-emerald-700"
                    />
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 font-semibold text-white">
                      {beneficiary.nickname.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">{beneficiary.nickname}</span>
                      <span className="block truncate text-sm text-slate-500">
                        {beneficiary.relationshipLabel} · {beneficiary.bankName} •••{beneficiary.accountLast4}
                      </span>
                    </span>
                    <span className="text-xs font-medium text-slate-500">{beneficiary.payoutCurrency}</span>
                  </label>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between">
            <label htmlFor="send-amount" className="font-semibold text-slate-900">
              How much are you sending?
            </label>
            <span className="text-xs text-slate-500">
              Available: {balance == null ? '—' : formatMoney(balance)}
            </span>
          </div>
          <div className="mt-3 flex items-center rounded-2xl border border-slate-300 bg-white px-4 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-600/20">
            <span className="font-medium text-slate-500">S$</span>
            <input
              id="send-amount"
              type="number"
              min={MINIMUM_SEND}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent px-3 py-4 text-right text-2xl font-semibold tabular-nums text-slate-900 outline-none"
            />
            <span className="text-sm font-medium text-slate-500">SGD</span>
          </div>
          {amountError && <p className="mt-2 text-sm text-red-600">{amountError}</p>}
          {!amountError && <p className="mt-2 text-xs text-slate-500">Fees and the live exchange rate appear on the next screen.</p>}
        </section>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canContinue}
          className="w-full rounded-xl bg-emerald-700 py-3.5 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? 'Getting your quote…' : 'Review quote'}
        </button>
      </form>
    </main>
  );
}

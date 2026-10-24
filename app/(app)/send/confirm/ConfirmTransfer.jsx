'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import OtpDialog from '@/components/OtpDialog';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { p2Api } from '@/lib/p2Api';
import { formatMoney } from '@/lib/format';

function RateRow({ label, children, strong = false }) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2 ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

export default function ConfirmTransfer({ quoteId }) {
  const router = useRouter();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [error, setError] = useState(
    quoteId ? '' : 'This quote link is invalid. Please create a new quote.',
  );
  const [showOtp, setShowOtp] = useState(false);

  useEffect(() => {
    if (!quoteId) return;
    const controller = new AbortController();
    p2Api.getQuote(quoteId, { signal: controller.signal }).then(
      ({ data }) => {
        setQuote(data);
        setLoading(false);
      },
      (err) => {
        if (err?.name === 'AbortError') return;
        if (isSessionExpired(err)) {
          router.replace(`/login?next=/send/confirm?quoteId=${encodeURIComponent(quoteId)}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load this quote.');
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [quoteId, router]);

  async function confirmTransfer({ challengeId, otpCode }) {
    await p2Api.sendRemittance(quoteId, challengeId, otpCode);
    setShowOtp(false);
    router.push(`/send/receipt?quoteId=${encodeURIComponent(quoteId)}`);
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-md px-4 pb-10 pt-6" aria-label="Loading quote">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        <div className="mt-6 h-80 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (error || !quote) {
    return (
      <main className="mx-auto max-w-md px-4 pb-10 pt-6">
        <h1 className="text-xl font-semibold text-slate-900">Quote unavailable</h1>
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        <Link href="/send" className="mt-6 inline-flex font-medium text-emerald-700 hover:underline">
          ← Create a new quote
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link
          href="/send"
          aria-label="Back to transfer details"
          className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-xl text-slate-700 hover:bg-slate-50"
        >
          ←
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-700">Step 2 of 3</p>
          <h1 className="text-xl font-semibold text-slate-900">Review your quote</h1>
        </div>
      </header>

      <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-emerald-700 px-5 py-6 text-white">
          <p className="text-sm text-emerald-100">{quote.beneficiary.nickname} receives</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {formatMoney(quote.recipientAmount, quote.beneficiary.payoutCurrency)}
          </p>
          <p className="mt-2 text-sm text-emerald-100">
            {quote.beneficiary.bankName} account •••{quote.beneficiary.accountLast4}
          </p>
        </div>

        <dl className="divide-y divide-slate-100 px-5 py-3 text-sm">
          <RateRow label="You send" strong>{formatMoney(quote.amountSGD)}</RateRow>
          <RateRow label="Transfer fee">{formatMoney(quote.fee)}</RateRow>
          <RateRow label="Our exchange rate">S$1 = {Number(quote.customerRate).toFixed(4)} {quote.beneficiary.payoutCurrency}</RateRow>
          <RateRow label="Market rate">S$1 = {Number(quote.marketRate).toFixed(4)} {quote.beneficiary.payoutCurrency}</RateRow>
        </dl>
      </section>

      {quote.savings > 0 && (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Your recipient gets {formatMoney(quote.savings, quote.beneficiary.payoutCurrency)} more than the bank comparison.
        </p>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        <p className="font-medium text-slate-900">Rate protected for 10 minutes</p>
        <p className="mt-1">Confirm with the SMS code before this quote expires.</p>
      </div>

      <button
        type="button"
        onClick={() => setShowOtp(true)}
        className="mt-6 w-full rounded-xl bg-emerald-700 py-3.5 font-semibold text-white transition hover:bg-emerald-800"
      >
        Confirm and send
      </button>

      <OtpDialog
        open={showOtp}
        purpose="SEND"
        referenceId={String(quote.quoteId)}
        title="Confirm transfer"
        description="Enter the code we sent to approve this transfer."
        confirmLabel="Send money"
        onSubmit={confirmTransfer}
        onClose={() => setShowOtp(false)}
      />
    </main>
  );
}

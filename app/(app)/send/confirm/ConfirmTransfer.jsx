'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import OtpDialog from '@/components/OtpDialog';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { p2Api } from '@/lib/p2Api';
import { loadCachedQuote, saveCachedQuote } from '@/lib/p2QuoteCache';
import { formatMoney } from '@/lib/format';
import TransferStepHeader from '@/components/TransferStepHeader';

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
    const cached = loadCachedQuote(quoteId);
    if (cached?.beneficiary) {
      const timer = setTimeout(() => {
        setQuote(cached);
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
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
    const { data } = await p2Api.sendRemittance(quoteId, challengeId, otpCode);
    saveCachedQuote({
      ...quote,
      ...data,
      quoteId: quote.quoteId,
      sent: true,
      completedOn: new Date().toISOString(),
    });
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
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <TransferStepHeader step={2} title="Review your quote" backHref="/send" backLabel="Back to transfer details" />

      <section className="mt-9 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.5)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 to-teal-900 px-6 py-7 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full border border-white/10 bg-white/5" />
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
        className="mt-6 w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-4 focus-visible:ring-emerald-600/20"
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

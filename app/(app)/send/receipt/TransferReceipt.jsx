'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { announceNotificationsChanged, ApiError, isSessionExpired } from '@/lib/p3Api';
import { p2Api } from '@/lib/p2Api';
import { loadCachedQuote } from '@/lib/p2QuoteCache';
import { formatDateTime, formatMoney } from '@/lib/format';

function ReceiptRow({ label, children, strong = false }) {
  return (
    <div className={`flex items-start justify-between gap-5 py-3 text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
      <dt>{label}</dt>
      <dd className="max-w-[60%] text-right tabular-nums">{children}</dd>
    </div>
  );
}

export default function TransferReceipt({ quoteId }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(Boolean(quoteId));
  const [error, setError] = useState(
    quoteId ? '' : 'This receipt link is invalid.',
  );

  useEffect(() => {
    if (!quoteId) return;
    const cached = loadCachedQuote(quoteId);
    if (cached?.sent) {
      const timer = setTimeout(() => {
        setReceipt(cached);
        announceNotificationsChanged();
        setLoading(false);
      }, 0);
      return () => clearTimeout(timer);
    }
    const controller = new AbortController();
    p2Api.getQuote(quoteId, { signal: controller.signal }).then(
      ({ data }) => {
        if (!data.sent) {
          setError('This transfer has not been completed yet.');
        } else {
          setReceipt(data);
          announceNotificationsChanged();
        }
        setLoading(false);
      },
      (err) => {
        if (err?.name === 'AbortError') return;
        if (isSessionExpired(err)) {
          router.replace(`/login?next=/send/receipt?quoteId=${encodeURIComponent(quoteId)}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Could not load this receipt.');
        setLoading(false);
      },
    );
    return () => controller.abort();
  }, [quoteId, router]);

  if (loading) {
    return (
      <main className="mx-auto max-w-md px-4 pb-10 pt-8" aria-label="Loading receipt">
        <div className="mx-auto h-20 w-20 animate-pulse rounded-full bg-slate-100" />
        <div className="mx-auto mt-5 h-8 w-52 animate-pulse rounded bg-slate-100" />
        <div className="mt-8 h-80 animate-pulse rounded-2xl bg-slate-100" />
      </main>
    );
  }

  if (error || !receipt) {
    return (
      <main className="mx-auto max-w-md px-4 pb-10 pt-8">
        <h1 className="text-xl font-semibold text-slate-900">Receipt unavailable</h1>
        <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
        <Link href="/home" className="mt-6 inline-flex font-medium text-emerald-700 hover:underline">
          ← Return home
        </Link>
      </main>
    );
  }

  const underReview = receipt.status === 'FEE_REVIEW';

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-10">
      <header className="text-center">
        <div
          className={`mx-auto grid h-20 w-20 place-items-center rounded-full border-8 border-white text-4xl shadow-xl ${
            underReview ? 'bg-amber-100 text-amber-700' : 'bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700'
          }`}
          aria-hidden="true"
        >
          {underReview ? '!' : '✓'}
        </div>
        <p className="mt-5 text-xs font-medium uppercase tracking-wider text-emerald-700">Step 3 of 3</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          {underReview ? 'Transfer is being reviewed' : 'Money sent successfully'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {underReview
            ? 'The recipient transfer succeeded. We are reviewing the fee transaction.'
            : `${receipt.beneficiary.nickname} will receive ${formatMoney(
                receipt.recipientAmount,
                receipt.beneficiary.payoutCurrency,
              )}.`}
        </p>
      </header>

      <section className="mt-8 overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-30px_rgba(15,23,42,0.5)]">
        <div className="border-b border-slate-100 px-5 py-5">
          <p className="text-sm text-slate-500">Receipt number</p>
          <p className="mt-1 font-mono text-sm font-medium text-slate-900">REMIT-{receipt.quoteId}</p>
        </div>
        <dl className="divide-y divide-slate-100 px-5">
          <ReceiptRow label="Recipient" strong>{receipt.beneficiary.nickname}</ReceiptRow>
          <ReceiptRow label="You sent">{formatMoney(receipt.amountSGD)}</ReceiptRow>
          <ReceiptRow label="Fee">{formatMoney(receipt.fee)}</ReceiptRow>
          <ReceiptRow label="Recipient gets" strong>
            {formatMoney(receipt.recipientAmount, receipt.beneficiary.payoutCurrency)}
          </ReceiptRow>
          <ReceiptRow label="Exchange rate">
            S$1 = {Number(receipt.customerRate).toFixed(4)} {receipt.beneficiary.payoutCurrency}
          </ReceiptRow>
          <ReceiptRow label="Bank transaction">{receipt.tBankTxnId}</ReceiptRow>
          <ReceiptRow label="Completed">{formatDateTime(receipt.completedOn)}</ReceiptRow>
          <ReceiptRow label="Balance after">{formatMoney(receipt.balanceAfter)}</ReceiptRow>
        </dl>
      </section>

      <div className="mt-6 grid gap-3">
        <Link
          href="/home"
          className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          Return home
        </Link>
        <Link
          href="/send"
          className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white py-4 font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
        >
          Send again
        </Link>
      </div>
    </main>
  );
}

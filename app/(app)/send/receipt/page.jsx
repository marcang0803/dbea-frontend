import { Suspense } from 'react';
import TransferReceipt from './TransferReceipt';

async function ReceiptContent({ searchParams }) {
  const { quoteId = '' } = await searchParams;
  return <TransferReceipt quoteId={Array.isArray(quoteId) ? quoteId[0] : quoteId} />;
}

export default function ReceiptPage(props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-8">Loading receipt…</main>}>
      <ReceiptContent {...props} />
    </Suspense>
  );
}

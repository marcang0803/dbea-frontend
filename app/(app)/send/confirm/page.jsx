import { Suspense } from 'react';
import ConfirmTransfer from './ConfirmTransfer';

async function ConfirmContent({ searchParams }) {
  const { quoteId = '' } = await searchParams;
  return <ConfirmTransfer quoteId={Array.isArray(quoteId) ? quoteId[0] : quoteId} />;
}

export default function ConfirmPage(props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-4 py-8">Loading quote…</main>}>
      <ConfirmContent {...props} />
    </Suspense>
  );
}

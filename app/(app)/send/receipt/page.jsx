import TransferReceipt from './TransferReceipt';

export default async function ReceiptPage({ searchParams }) {
  const { quoteId = '' } = await searchParams;
  return <TransferReceipt quoteId={Array.isArray(quoteId) ? quoteId[0] : quoteId} />;
}

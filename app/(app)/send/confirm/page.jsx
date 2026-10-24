import ConfirmTransfer from './ConfirmTransfer';

export default async function ConfirmPage({ searchParams }) {
  const { quoteId = '' } = await searchParams;
  return <ConfirmTransfer quoteId={Array.isArray(quoteId) ? quoteId[0] : quoteId} />;
}

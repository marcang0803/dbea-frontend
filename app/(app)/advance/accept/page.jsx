import { Suspense } from 'react';
import AdvanceAcceptance from './AdvanceAcceptance';

export const metadata = { title: 'Review your advance · RemitEase' };

async function Content({ searchParams }) {
  const query = await searchParams;
  const first = (value) => typeof value === 'string' ? value : '';
  return <AdvanceAcceptance initialAmount={first(query.amount)} initialMonths={first(query.months)} initialSnapshotId={first(query.snapshotId)} initialRequestKey={first(query.requestKey)} />;
}

export default function Page(props) {
  return <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">Loading your advance…</main>}><Content {...props} /></Suspense>;
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import OtpDialog from '@/components/OtpDialog';
import { p6Api, AdvanceApiError } from '@/lib/p6Api';
import { acceptanceView, canCancelAcceptance, canDiscardUnsubmittedAcceptance, isAdvanceOperation } from '@/lib/advanceState.mjs';
import { formatMoney } from '@/lib/format';
import { advanceReturnPath } from '@/lib/loginReturn.mjs';

const STORAGE_KEY = 'remitease:p6:pending-request';
const INPUT = 'mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 disabled:bg-slate-50';
const PRIMARY = 'w-full rounded-2xl bg-emerald-700 px-5 py-3.5 font-semibold text-white transition hover:bg-emerald-800 focus-visible:ring-4 focus-visible:ring-emerald-600/30 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500';
const SECONDARY = 'rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-emerald-600/20 disabled:opacity-50';

function remember(key) {
  try { sessionStorage.setItem(STORAGE_KEY, key); } catch { /* The URL also retains the recovery reference. */ }
}

function offerValid(offer) {
  return offer?.isEligible === true && offer.isSnapshotValid === true && Number.isSafeInteger(Number(offer.outSnapshotId)) && Number(offer.outSnapshotId) > 0 &&
    Number.isFinite(offer.selectedPlanAmount) && offer.selectedPlanAmount > 0 && offer.selectedPlanAmount <= 1000 && Number(offer.selectedPlanAmount.toFixed(2)) === offer.selectedPlanAmount &&
    Number.isFinite(offer.maxAdvanceAmount) && offer.selectedPlanAmount <= offer.maxAdvanceAmount &&
    Number.isInteger(offer.selectedTenor) && offer.selectedTenor > 0 && offer.selectedTenor <= 6 &&
    Number.isFinite(offer.monthlyInstalment) && offer.monthlyInstalment > 0 && Number.isFinite(offer.interest) && offer.interest >= 0 &&
    validDate(offer.maturityDate);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dateLabel(value) {
  if (!validDate(value)) return 'Not available';
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function Row({ label, children }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium tabular-nums text-slate-900">{children}</dd></div>;
}

export default function AdvanceAcceptance({ initialAmount = '', initialMonths = '', initialSnapshotId = '', initialRequestKey = '' }) {
  const router = useRouter();
  const [amount, setAmount] = useState(initialAmount || '100');
  const [months, setMonths] = useState(initialMonths || '2');
  const [offer, setOffer] = useState(null);
  const [operation, setOperation] = useState(null);
  const [requestReference, setRequestReference] = useState(initialRequestKey);
  const [busy, setBusy] = useState(Boolean(initialRequestKey));
  const [error, setError] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [otpAttempted, setOtpAttempted] = useState(false);
  const [residenceStatus, setResidenceStatus] = useState('');
  const [years, setYears] = useState('');
  const [cards, setCards] = useState('');
  const [agreed, setAgreed] = useState(false);
  const keyRef = useRef(initialRequestKey);
  const submitting = useRef(false);
  const otpModalRef = useRef(null);

  // P6 owns this modal boundary; the shared OTP component remains unchanged.
  useEffect(() => {
    const dialog = otpModalRef.current;
    if (showOtp) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [showOtp]);

  const login = useCallback((next) => {
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [router]);

  const recover = useCallback(async (key) => {
    try {
      const data = await p6Api.getStatus(key);
      keyRef.current = key;
      setRequestReference(key);
      setOperation((previous) => ({ ...data, errorCode: data.errorCode || (data.status === 'RECEIVED' ? previous?.errorCode : '') }));
      setError('');
    } catch (err) {
      if (err.status === 401) { login(advanceReturnPath({ requestKey: key })); return; }
      if (err.status === 404) {
        setOperation((previous) => ({ ...previous, status: 'UNKNOWN', errorCode: 'REQUEST_NOT_VISIBLE' }));
        setError('');
        return;
      }
      setOperation((previous) => isAdvanceOperation(err.data) ? err.data : previous || { status: 'UNKNOWN' });
      setError(err.message || 'Could not check this request.');
    } finally { setBusy(false); }
  }, [login]);

  useEffect(() => {
    let active = true;
    // The promise callback keeps initial state changes out of the effect body.
    Promise.resolve().then(() => {
      let key = initialRequestKey;
      try { key ||= sessionStorage.getItem(STORAGE_KEY) || ''; } catch { /* URL recovery remains available. */ }
      if (active && key) {
        keyRef.current = key;
        setRequestReference(key);
        setBusy(true);
        recover(key);
      }
    });
    return () => { active = false; };
  }, [initialRequestKey, recover]);

  function clearOffer() { setOffer(null); setError(''); setAgreed(false); }

  async function checkTerms(event) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError(''); setOffer(null); setAgreed(false);
    try {
      const data = await p6Api.getOffer({ amount, months, snapshotId: initialSnapshotId });
      setOffer(data);
      if (offerValid(data)) { setAmount(String(data.selectedPlanAmount)); setMonths(String(data.selectedTenor)); }
    } catch (err) {
      if (err.status === 401) login(advanceReturnPath({ amount, months, snapshotId: initialSnapshotId }));
      else setError(err.message || 'Could not check your terms.');
    } finally { submitting.current = false; setBusy(false); }
  }

  async function confirm({ challengeId, otpCode }) {
    if (submitting.current) return;
    if (!offerValid(offer) || !offer.acceptanceAvailable) {
      throw new AdvanceApiError('Your offer has changed. Close this confirmation and check your terms again.', 400);
    }
    submitting.current = true;
    setOtpAttempted(true);
    const hasPreviousAttempt = Boolean(keyRef.current);
    const key = keyRef.current || crypto.randomUUID();
    keyRef.current = key;
    setRequestReference(key);
    remember(key);
    // Only a non-secret request reference is persisted; never the code or token.
    window.history.replaceState(null, '', `/advance/accept?requestKey=${encodeURIComponent(key)}`);
    try {
      const data = await p6Api.accept({ amount: offer.selectedPlanAmount, months: offer.selectedTenor, snapshotId: String(offer.outSnapshotId), challengeId, otpCode, residenceStatus, yearsAtResidence: Number(years), numberOfCreditCards: Number(cards) }, key);
      setOperation(data); setShowOtp(false); setError('');
    } catch (err) {
      if (canDiscardUnsubmittedAcceptance(err.data, hasPreviousAttempt)) {
        // A new reference may be released only with proxy proof that no C9 POST
        // was attempted. A 404, backend refusal or lost response is insufficient.
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* URL recovery also clears below. */ }
        keyRef.current = '';
        const next = advanceReturnPath({ amount, months, snapshotId: initialSnapshotId });
        window.history.replaceState(null, '', next);
        setShowOtp(false); setOtpAttempted(false); setError('');
        setOperation({ status: 'NOT_SUBMITTED', errorCode: err.code });
        if (err.status === 401) login(next);
        return;
      }
      if (err instanceof AdvanceApiError && (err.status === 422 || ['WRONG_CODE', 'OTP_INCORRECT'].includes(err.code))) {
        if (isAdvanceOperation(err.data)) setOperation(err.data);
        throw err;
      }
      setShowOtp(false);
      setOperation(isAdvanceOperation(err.data) ? err.data : { status: 'UNKNOWN', errorCode: err.code });
      setError(err.message || 'Check your request status before trying again.');
      if (err.status === 401) login(advanceReturnPath({ requestKey: key }));
    } finally { submitting.current = false; }
  }

  async function cancel() {
    if (submitting.current || !canCancelAcceptance(operation)) return;
    submitting.current = true; setBusy(true); setError('');
    try { setOperation(await p6Api.cancel(operation.operationId, operation.version)); }
    catch (err) {
      if (err.status === 401) login(advanceReturnPath({ requestKey: keyRef.current }));
      else {
        setOperation((previous) => isAdvanceOperation(err.data) ? err.data : { ...previous, status: 'UNKNOWN' });
        setError(err.message || 'Could not cancel this request. Check its status.');
      }
    }
    finally { submitting.current = false; setBusy(false); }
  }

  function reset() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* Nothing to clear. */ }
    keyRef.current = ''; setRequestReference(''); setOperation(null); setOffer(null); setError(''); setAgreed(false); setOtpAttempted(false);
    window.history.replaceState(null, '', '/advance/accept');
  }

  const view = acceptanceView(operation);
  const valid = offerValid(offer);
  const factsValid = residenceStatus && /^\d+$/.test(years) && Number(years) <= 120 && /^\d+$/.test(cards) && Number(cards) <= 100;

  function closeOtp() {
    setShowOtp(false);
    if (keyRef.current && !operation) { setBusy(true); recover(keyRef.current); }
  }

  function containOtpFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll('button:enabled, input:enabled')).filter((element) => element.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-12 pt-7 sm:px-8 lg:pb-20 lg:pt-10">
      <header className="flex items-center justify-between border-b border-slate-200/80 pb-5">
        <Link href="/home" className="rounded-lg text-sm font-medium text-slate-600 hover:text-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-600/20">← Home</Link>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">RemitEase advance</span>
      </header>

      <ol className="mt-7 grid grid-cols-3 gap-2 text-xs font-medium sm:gap-6 sm:text-sm lg:mt-9" aria-label="Advance progress">
        {['Your request', 'Review terms', 'Confirmation'].map((step, index) => {
          const current = index === (operation || showOtp ? 2 : offer ? 1 : 0);
          return <li key={step} aria-current={current ? 'step' : undefined} className={`flex items-center gap-2 rounded-xl py-2 sm:gap-3 ${current ? 'text-emerald-800' : 'text-slate-400'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border sm:h-9 sm:w-9 ${current ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-200 bg-white'}`}>{index + 1}</span><span>{step}</span></li>;
        })}
      </ol>

      {view ? (
        <section aria-live="polite" className="mx-auto mt-8 max-w-3xl rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <div className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl text-xl ${view.tone === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700'}`} aria-hidden="true">{view.tone === 'success' ? '✓' : '◷'}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{view.title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">{view.message}</p>
          {operation.loanAccountId && <p className="mt-4 text-sm text-slate-500">Loan account ending {String(operation.loanAccountId).slice(-4)}</p>}
          {requestReference && <p className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Request reference: {requestReference}</p>}
          {view.tone === 'pending' && <button type="button" disabled={busy} onClick={() => { setBusy(true); recover(keyRef.current); }} className={`${PRIMARY} mt-5`}>{busy ? 'Checking…' : 'Check request status'}</button>}
          {canCancelAcceptance(operation) && <button type="button" disabled={busy} onClick={cancel} className={`${SECONDARY} mt-3 w-full`}>Cancel this request</button>}
          {['CANCELED', 'DECLINED', 'NOT_SUBMITTED'].includes(operation.status) && <button type="button" onClick={reset} className={`${SECONDARY} mt-5 w-full`}>{operation.status === 'NOT_SUBMITTED' ? 'Return to review' : 'Review another offer'}</button>}
          <Link href="/home" className="mt-5 block text-center text-sm font-semibold text-emerald-700 hover:underline">Return home</Link>
        </section>
      ) : (
        <div className="mt-8 grid items-start gap-7 lg:mt-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <section className="min-w-0" aria-labelledby="advance-title">
          <h1 id="advance-title" className="text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">A little support,<br />with clear terms.</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-500 sm:text-base sm:leading-7">Review your eligibility and the bank’s repayment terms before deciding.</p>
          <form onSubmit={checkTerms} className="mt-7 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:mt-8">
            <label htmlFor="advance-amount" className="text-sm font-medium text-slate-700">How much do you need? <span className="text-slate-400">SGD</span></label>
            <input id="advance-amount" className={INPUT} type="number" inputMode="decimal" min="0.01" max="1000" step="0.01" required value={amount} disabled={busy} onChange={(event) => { setAmount(event.target.value); clearOffer(); }} />
            <label htmlFor="advance-months" className="mt-5 block text-sm font-medium text-slate-700">Repayment term</label>
            <select id="advance-months" className={INPUT} value={months} disabled={busy} onChange={(event) => { setMonths(event.target.value); clearOffer(); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'month' : 'months'}</option>)}</select>
            <p className="mt-3 text-xs leading-5 text-slate-400">Your approved amount and term depend on your eligibility. Checking terms does not create a loan.</p>
            <button type="submit" disabled={busy} className={`${PRIMARY} mt-5`}>{busy ? 'Checking your terms…' : offer ? 'Refresh terms' : 'Check my terms'}</button>
          </form>
          </section>

          <aside className="min-w-0 space-y-5 lg:sticky lg:top-8" aria-label="Your advance terms">
          {!offer && <section className="hidden rounded-[1.75rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-8 lg:block">
            <span className="mb-6 grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-700 shadow-sm" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6"><path strokeLinecap="round" strokeLinejoin="round" d="M8 3h8l3 3v15H5V3h3Zm0 6h8M8 13h8M8 17h5" /></svg></span>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{busy ? 'Checking your terms…' : 'Your terms, in one place'}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">Choose an amount and repayment term. Your returned offer will appear here so you can review the full cost.</p>
            <dl className="mt-7 space-y-5 border-t border-emerald-100 pt-6 text-sm">
              <div><dt className="font-medium text-slate-700">Monthly instalment</dt><dd className="mt-1 text-slate-500">What you would repay each month.</dd></div>
              <div><dt className="font-medium text-slate-700">Interest and total repayment</dt><dd className="mt-1 text-slate-500">The quoted cost before you make a decision.</dd></div>
              <div><dt className="font-medium text-slate-700">Repayment term</dt><dd className="mt-1 text-slate-500">Your approved term and maturity date.</dd></div>
            </dl>
            <p className="mt-7 text-xs leading-5 text-emerald-800">Checking terms does not create a loan.</p>
          </section>}

          {offer && !valid && <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-7"><h2 className="font-semibold text-amber-950">No advance available right now</h2><p className="mt-2 text-sm leading-6 text-amber-800">{offer.isEligible ? 'We could not confirm a valid repayment plan. Check your terms again.' : 'This account does not currently qualify for an advance. You can check again after your account information changes.'}</p></section>}

          {valid && <section className="overflow-hidden rounded-[1.75rem] border border-emerald-200 bg-white shadow-sm" aria-live="polite">
            <div className="relative overflow-hidden bg-gradient-to-br from-emerald-700 to-teal-900 p-6 text-white sm:p-8">
              <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-white/10 bg-white/5" aria-hidden="true" />
              <p className="text-sm text-emerald-100">Your returned offer · {offer.approvedBand}</p>
              <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{formatMoney(offer.selectedPlanAmount)}</p>
              <p className="mt-2 text-sm text-emerald-100">Over {offer.selectedTenor} months · up to {formatMoney(offer.maxAdvanceAmount)} available</p>
            </div>
            <dl className="divide-y divide-slate-100 px-5 py-2 text-sm sm:px-8 sm:py-3">
              <Row label="Monthly instalment">{formatMoney(offer.monthlyInstalment)}</Row>
              <Row label="Quoted total interest">{formatMoney(offer.interest)}</Row>
              <Row label="Quoted total repayment">{formatMoney(offer.selectedPlanAmount + offer.interest)}</Row>
              <Row label="Maturity date">{dateLabel(offer.maturityDate)}</Row>
            </dl>
            <p className="px-5 pb-5 text-xs leading-5 text-slate-400 sm:px-8 sm:pb-7">Amounts are shown to two decimal places. The final instalment follows the bank’s confirmed balance.</p>
          </section>}

          {valid && !offer.acceptanceAvailable && <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-7"><h2 className="font-semibold text-amber-950">Borrowing temporarily unavailable</h2><p className="mt-2 text-sm leading-6 text-amber-800">You can review your terms, but we are still verifying bank funding and repayments. No loan has been created from this offer.</p><button type="button" disabled className={`${PRIMARY} mt-4`}>Confirmation unavailable</button></section>}

          {valid && offer.acceptanceAvailable && <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 sm:p-7">
            <h2 className="text-lg font-semibold text-slate-950">A few details for the bank</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">The bank will check your request again. Your advance is confirmed only after funding is verified.</p>
            <label htmlFor="advance-residence" className="mt-4 block text-sm font-medium text-slate-700">Residence status</label>
            <select id="advance-residence" className={INPUT} value={residenceStatus} onChange={(event) => setResidenceStatus(event.target.value)}><option value="">Select your residence status</option><option value="Owned">Owned</option><option value="Rent">Rented</option></select>
            <label htmlFor="advance-years" className="mt-4 block text-sm font-medium text-slate-700">Years at this address</label>
            <input id="advance-years" className={INPUT} type="number" inputMode="numeric" min="0" max="120" step="1" value={years} onChange={(event) => setYears(event.target.value)} />
            <label htmlFor="advance-cards" className="mt-4 block text-sm font-medium text-slate-700">Number of credit cards</label>
            <input id="advance-cards" className={INPUT} type="number" inputMode="numeric" min="0" max="100" step="1" value={cards} onChange={(event) => setCards(event.target.value)} />
            <label className="mt-5 flex items-start gap-3 text-sm leading-6 text-slate-600"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />I have reviewed this offer and my details are accurate.</label>
            <button type="button" disabled={!factsValid || !agreed || busy} onClick={() => setShowOtp(true)} className={`${PRIMARY} mt-5`}>Continue with SMS code</button>
          </section>}
          </aside>
        </div>
      )}

      {error && <p role="alert" className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-700">{error}</p>}
      <dialog ref={otpModalRef} role="presentation" className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 backdrop:bg-transparent" onKeyDown={containOtpFocus} onCancel={(event) => { event.preventDefault(); if (!submitting.current) closeOtp(); }}>
        <OtpDialog open={showOtp} purpose="ADVANCE" referenceId={String(offer?.outSnapshotId || '')} title="Confirm your advance" description="Enter the code for this advance offer." confirmLabel="Confirm advance" requestChallenge={p6Api.requestOtp} resendAllowed={!otpAttempted} onSubmit={confirm} onClose={closeOtp} />
      </dialog>
    </main>
  );
}

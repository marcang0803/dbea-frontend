'use client';

// Add family member (P1): C2 ManageFamily.
//   GET  /api/family/payout-options?country=  → where the money can be paid out
//   POST /api/family/beneficiaries            → creates the Party record, tBank beneficiary and A2 link

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { GENDERS, PAYOUT_COUNTRIES, RELATIONSHIPS, p1Api, payoutOptionsFor } from '@/lib/p1Api';

const EMPTY = {
  givenName: '',
  familyName: '',
  relationship: '',
  genderId: '',
  nickname: '',
  country: PAYOUT_COUNTRIES[0].code,
  corridorProductId: '',
  accountId: '',
  confirmAccountId: '',
};

function validate(f) {
  const e = {};
  if (!f.givenName.trim()) e.givenName = 'Required.';
  if (!f.familyName.trim()) e.familyName = 'Required.';
  if (!RELATIONSHIPS.includes(f.relationship)) e.relationship = 'Choose a relationship.';
  if (!f.nickname.trim()) e.nickname = 'Required.';
  else if (f.nickname.trim().length > 30) e.nickname = 'Keep it under 30 characters.';
  if (!f.corridorProductId) e.corridorProductId = 'Choose how they get paid.';
  if (!/^\d{6,20}$/.test(f.accountId)) e.accountId = 'Enter the account number (digits only).';
  if (f.confirmAccountId !== f.accountId) e.confirmAccountId = 'Account numbers do not match.';
  return e;
}

const inputClass = (bad) =>
  `mt-2 w-full rounded-2xl border px-4 py-3 outline-none transition focus:bg-white focus:ring-4 ${
    bad
      ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-500/10'
      : 'border-slate-200 bg-slate-50 focus:border-emerald-600 focus:ring-emerald-600/10'
  }`;

function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

const optionLabel = (o) => [o.partnerName, o.payoutCurrency].filter(Boolean).join(' · ') || o.corridorProductId;

export default function AddFamilyPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const toLogin = useCallback(() => router.replace('/login'), [router]);

  // Payout options for the chosen country only. The backend filters by ?country=; the
  // frontend filters again (by country, or by payout currency when COUNTRY is missing),
  // so another country's corridor can never be picked.
  // State is only set inside the promise callbacks (after the network call).
  const loadOptions = useCallback(
    (country, signal) =>
      p1Api
        .getPayoutOptions(country, { signal })
        .then(
          ({ data }) => {
            const list = payoutOptionsFor(data, country);
            setOptions(list);
            setForm((f) => ({
              ...f,
              corridorProductId: list.some((o) => o.corridorProductId === f.corridorProductId)
                ? f.corridorProductId
                : list.length === 1
                  ? list[0].corridorProductId
                  : '',
            }));
            setOptionsLoading(false);
          },
          (err) => {
            if (err?.name === 'AbortError') return;
            if (isSessionExpired(err)) return toLogin();
            setOptionsLoading(false);
            setError(err instanceof ApiError ? err.message : 'Could not load payout options.');
          },
        ),
    [toLogin],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadOptions(form.country, controller.signal);
    return () => controller.abort();
  }, [form.country, loadOptions]);

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Suggest a nickname from the relationship until the user types their own.
      if (key === 'relationship' && (!f.nickname || RELATIONSHIPS.includes(f.nickname))) {
        next.nickname = value;
      }
      return next;
    });
    if (key === 'country') setOptionsLoading(true);
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setError('');
  };

  const digitsOnly = (key) => (e) => set(key)({ target: { value: e.target.value.replace(/\D/g, '').slice(0, 20) } });

  async function onSubmit(e) {
    e.preventDefault();
    const errs = validate(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await p1Api.addFamilyMember({
        familyName: form.familyName.trim(),
        givenName: form.givenName.trim(),
        relationship: form.relationship,
        ...(form.genderId ? { genderId: Number(form.genderId) } : {}),
        country: form.country,
        corridorProductId: form.corridorProductId,
        accountId: form.accountId,
        nickname: form.nickname.trim(),
      });
      const nickname = data?.nickname ?? form.nickname.trim();
      // Next.js keeps this page mounted, so start fresh for the next family member.
      setForm(EMPTY);
      setFieldErrors({});
      setBusy(false);
      router.push(`/family?added=${encodeURIComponent(nickname)}`);
    } catch (err) {
      setBusy(false);
      if (isSessionExpired(err)) return toLogin();
      const msg = err instanceof ApiError ? err.message : 'Could not add. Please try again.';
      if (err instanceof ApiError && err.status === 409) {
        setFieldErrors({ accountId: 'You already saved this account.' });
      } else if (/payout option/i.test(msg)) {
        setFieldErrors({ corridorProductId: msg });
      }
      setError(msg);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <Link href="/family" className="text-sm font-medium text-emerald-700">
        ← Back to My family
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">Add a family member</h1>
      <p className="mt-2 text-sm text-slate-500">Use their name exactly as it appears on their bank account.</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
        <fieldset className="space-y-4">
          <legend className="font-semibold text-slate-900">Who are they?</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Given name" error={fieldErrors.givenName}>
              <input value={form.givenName} onChange={set('givenName')} className={inputClass(fieldErrors.givenName)} />
            </Field>
            <Field label="Family name" error={fieldErrors.familyName}>
              <input value={form.familyName} onChange={set('familyName')} className={inputClass(fieldErrors.familyName)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Relationship" error={fieldErrors.relationship}>
              <select value={form.relationship} onChange={set('relationship')} className={inputClass(fieldErrors.relationship)}>
                <option value="">Select</option>
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Gender (optional)">
              <select value={form.genderId} onChange={set('genderId')} className={inputClass(false)}>
                <option value="">—</option>
                {GENDERS.map((g) => (
                  <option key={g.id} value={String(g.id)}>{g.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Nickname" hint="Shown when you send money, e.g. Mum." error={fieldErrors.nickname}>
            <input value={form.nickname} onChange={set('nickname')} maxLength={30} className={inputClass(fieldErrors.nickname)} />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-semibold text-slate-900">Where do they get paid?</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <select value={form.country} onChange={set('country')} className={inputClass(false)}>
                {PAYOUT_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label} ({c.currency})</option>
                ))}
              </select>
            </Field>
            <Field label="Payout to" error={fieldErrors.corridorProductId}>
              <select
                value={form.corridorProductId}
                onChange={set('corridorProductId')}
                disabled={optionsLoading || options.length === 0}
                className={`${inputClass(fieldErrors.corridorProductId)} disabled:bg-slate-100`}
              >
                <option value="">{optionsLoading ? 'Loading…' : options.length ? 'Select' : 'Not available yet'}</option>
                {options.map((o) => (
                  <option key={o.corridorProductId} value={o.corridorProductId}>{optionLabel(o)}</option>
                ))}
              </select>
            </Field>
          </div>
          {!optionsLoading && options.length === 0 && (
            <p role="status" className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Payouts to {PAYOUT_COUNTRIES.find((c) => c.code === form.country)?.label ?? 'this country'} aren&apos;t
              available yet. Please choose another country.
            </p>
          )}
          <Field label="Bank account number" error={fieldErrors.accountId}>
            <input value={form.accountId} onChange={digitsOnly('accountId')} inputMode="numeric" className={`${inputClass(fieldErrors.accountId)} font-mono`} />
          </Field>
          <Field label="Confirm account number" error={fieldErrors.confirmAccountId}>
            <input
              value={form.confirmAccountId}
              onChange={digitsOnly('confirmAccountId')}
              onPaste={(e) => e.preventDefault()}
              inputMode="numeric"
              className={`${inputClass(fieldErrors.confirmAccountId)} font-mono`}
            />
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || optionsLoading}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
        >
          {busy ? 'Saving…' : 'Save family member'}
        </button>
      </form>
    </main>
  );
}

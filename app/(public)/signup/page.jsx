'use client';

// Sign-up (P1): C1 OnboardSender.
//   Step 1 "details": the sender fills in their details (checked here first).
//   Step 2 "otp":     POST /api/onboard/otp sends a code to their mobile; they enter it and
//                     POST /api/onboard/senders creates the login, tBank customer, SGD account,
//                     SMULab Party record and A1 Sender in one call.
//   Step 3 "done":    shows the new account and sends them to log in.

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/p3Api';
import { DOCUMENT_TYPES, GENDERS, MOBILE_PREFIX, p1Api } from '@/lib/p1Api';

const RESEND_SECONDS = 30;

const EMPTY = {
  username: '',
  password: '',
  confirmPassword: '',
  documentTypeId: '1',
  icNumber: '',
  givenName: '',
  familyName: '',
  genderId: '',
  dateOfBirth: '',
  mobile: '',
  email: '',
  addressLine1: '',
  postalCode: '',
};

function yearsSince(isoDate) {
  const dob = new Date(isoDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

function validate(f) {
  const e = {};
  if (!/^[a-zA-Z0-9._]{4,30}$/.test(f.username)) e.username = 'Use 4–30 letters, numbers, dots or underscores.';
  if (f.password.length < 8) e.password = 'Use at least 8 characters.';
  if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match.';
  if (f.documentTypeId === '1' && !/^[STFGM]\d{7}[A-Z]$/i.test(f.icNumber)) {
    e.icNumber = 'Enter a 9-character NRIC/FIN, e.g. G1234567X.';
  }
  if (f.documentTypeId === '3' && !/^[A-Z0-9]{6,12}$/i.test(f.icNumber)) {
    e.icNumber = 'Enter your passport number (6–12 letters or numbers).';
  }
  if (!f.givenName.trim()) e.givenName = 'Required.';
  if (!f.familyName.trim()) e.familyName = 'Required.';
  if (!f.genderId) e.genderId = 'Required.';
  if (!f.dateOfBirth) e.dateOfBirth = 'Required.';
  else if (yearsSince(f.dateOfBirth) < 18) e.dateOfBirth = 'You must be at least 18.';
  if (!/^[89]\d{7}$/.test(f.mobile)) e.mobile = 'Enter an 8-digit Singapore mobile number.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email.';
  if (!f.addressLine1.trim()) e.addressLine1 = 'Required.';
  if (!/^\d{6}$/.test(f.postalCode)) e.postalCode = 'Enter a 6-digit postal code.';
  return e;
}

const inputClass = (bad) =>
  `mt-2 w-full rounded-2xl border px-4 py-3 outline-none transition focus:bg-white focus:ring-4 ${
    bad
      ? 'border-red-300 bg-red-50/40 focus:border-red-400 focus:ring-red-500/10'
      : 'border-slate-200 bg-slate-50 focus:border-emerald-600 focus:ring-emerald-600/10'
  }`;

function Field({ label, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default function SignupPage() {
  const [step, setStep] = useState('details');
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [challenge, setChallenge] = useState(null); // { challengeId, maskedMobile, expiresAt }
  const [code, setCode] = useState('');
  const [needNewCode, setNeedNewCode] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [result, setResult] = useState(null);

  // Next.js keeps this page mounted (hidden) after you leave it. Once the account exists,
  // reset everything (incl. the password) so a later visit starts a new sign-up.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useLayoutEffect(
    () => () => {
      if (stepRef.current !== 'done') return;
      setStep('details');
      setForm(EMPTY);
      setChallenge(null);
      setCode('');
      setResult(null);
      setError('');
    },
    [],
  );

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const set = (key) => (e) => {
    const value = key === 'icNumber' ? e.target.value.toUpperCase() : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((fe) => ({ ...fe, [key]: undefined }));
    setError('');
  };

  async function sendCode() {
    setBusy(true);
    setError('');
    try {
      const { data } = await p1Api.requestSignupOtp(`${MOBILE_PREFIX}${form.mobile}`);
      setChallenge(data);
      setCode('');
      setNeedNewCode(false);
      setResendIn(RESEND_SECONDS);
      setStep('otp');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setStep('details');
        setFieldErrors((fe) => ({ ...fe, mobile: err.message }));
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  function onDetailsSubmit(e) {
    e.preventDefault();
    const errs = validate(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError('Please fix the highlighted fields.');
      return;
    }
    sendCode();
  }

  async function onOtpSubmit(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data } = await p1Api.createSender({
        challengeId: challenge.challengeId,
        otpCode: code,
        username: form.username,
        password: form.password,
        icNumber: form.icNumber,
        documentTypeId: Number(form.documentTypeId),
        familyName: form.familyName.trim(),
        givenName: form.givenName.trim(),
        genderId: Number(form.genderId),
        dateOfBirth: form.dateOfBirth,
        mobile: `${MOBILE_PREFIX}${form.mobile}`,
        email: form.email.trim(),
        addressLine1: form.addressLine1.trim(),
        postalCode: form.postalCode,
      });
      setResult(data);
      setForm((f) => ({ ...f, password: '', confirmPassword: '' }));
      setStep('done');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      const status = err instanceof ApiError ? err.status : 0;
      const code0 = err instanceof ApiError ? String(err.errors[0]?.code ?? '') : '';

      if (status === 409 && /username/i.test(`${code0} ${msg}`)) {
        // Username taken: fix it on the details step, then verify the phone again.
        setStep('details');
        setFieldErrors({ username: 'This username is already taken.' });
        setError('Choose another username. We will send you a new code.');
      } else if (status === 400) {
        setStep('details');
        setError(msg);
        if (/nric|fin|ic/i.test(msg)) setFieldErrors({ icNumber: msg });
      } else {
        // 422 wrong code, 409 expired/used challenge, 502 external service: get a fresh code.
        setError(msg);
        setNeedNewCode(true);
        setCode('');
      }
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done') {
    return (
      <main className="mx-auto max-w-md px-5 pb-12 pt-10">
        <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-700 via-emerald-700 to-teal-900 p-6 text-white shadow-[0_20px_45px_-22px_rgba(4,120,87,0.75)]">
          <p className="text-sm text-emerald-100">Account created</p>
          <h1 className="mt-1 text-2xl font-semibold">Welcome, {form.givenName}!</h1>
          {result?.sgdAccountId && (
            <p className="mt-3 text-sm text-emerald-50">
              Your SGD account: <span className="font-mono">{result.sgdAccountId}</span>
            </p>
          )}
        </div>
        <p className="mt-6 text-sm text-slate-600">
          Log in with your username <span className="font-medium text-slate-900">{form.username}</span> to add
          your family and send money home.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl"
        >
          Log in
        </Link>
      </main>
    );
  }

  if (step === 'otp') {
    return (
      <main className="mx-auto max-w-md px-5 pb-12 pt-10">
        <button
          type="button"
          onClick={() => {
            setStep('details');
            setError('');
          }}
          className="text-sm font-medium text-emerald-700"
        >
          ← Edit details
        </button>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">Verify your phone</h1>
        <p className="mt-2 text-sm text-slate-500">
          We sent a 6-digit code to <span className="font-medium text-slate-900">{challenge?.maskedMobile}</span>.
        </p>

        <form onSubmit={onOtpSubmit} noValidate className="mt-8 space-y-4">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
              setError('');
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            placeholder="••••••"
            disabled={needNewCode}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center font-mono text-2xl tracking-[0.5em] outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10 disabled:bg-slate-100"
          />

          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || needNewCode || code.length !== 6}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
          >
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={sendCode}
          disabled={busy || resendIn > 0}
          className={`mt-4 w-full rounded-2xl py-3 text-sm font-medium transition disabled:opacity-60 ${
            needNewCode ? 'bg-emerald-50 text-emerald-800' : 'text-emerald-700'
          }`}
        >
          {resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'}
        </button>
      </main>
    );
  }

  // step === 'details'
  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-10">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Create your account</h1>
      <p className="mt-2 text-sm text-slate-500">It takes about 2 minutes. Use the details on your ID.</p>

      <form onSubmit={onDetailsSubmit} noValidate className="mt-8 space-y-6">
        <fieldset className="space-y-4">
          <legend className="font-semibold text-slate-900">About you</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Given name" error={fieldErrors.givenName}>
              <input value={form.givenName} onChange={set('givenName')} autoComplete="given-name" className={inputClass(fieldErrors.givenName)} />
            </Field>
            <Field label="Family name" error={fieldErrors.familyName}>
              <input value={form.familyName} onChange={set('familyName')} autoComplete="family-name" className={inputClass(fieldErrors.familyName)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ID type">
              <select value={form.documentTypeId} onChange={set('documentTypeId')} className={inputClass(false)}>
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d.id} value={String(d.id)}>{d.label}</option>
                ))}
              </select>
            </Field>
            <Field label="ID number" error={fieldErrors.icNumber}>
              <input value={form.icNumber} onChange={set('icNumber')} autoCapitalize="characters" className={inputClass(fieldErrors.icNumber)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gender" error={fieldErrors.genderId}>
              <select value={form.genderId} onChange={set('genderId')} className={inputClass(fieldErrors.genderId)}>
                <option value="">Select</option>
                {GENDERS.map((g) => (
                  <option key={g.id} value={String(g.id)}>{g.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Date of birth" error={fieldErrors.dateOfBirth}>
              <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} autoComplete="bday" className={inputClass(fieldErrors.dateOfBirth)} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-semibold text-slate-900">Contact</legend>
          <Field label="Mobile number" error={fieldErrors.mobile}>
            <div className="mt-2 flex">
              <span className="inline-flex items-center rounded-l-2xl border border-r-0 border-slate-200 bg-slate-100 px-3 text-slate-600">
                {MOBILE_PREFIX}
              </span>
              <input
                value={form.mobile}
                onChange={(e) => set('mobile')({ target: { value: e.target.value.replace(/\D/g, '').slice(0, 8) } })}
                inputMode="tel"
                autoComplete="tel-national"
                className={`${inputClass(fieldErrors.mobile)} !mt-0 rounded-l-none`}
              />
            </div>
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" className={inputClass(fieldErrors.email)} />
          </Field>
          <Field label="Address" error={fieldErrors.addressLine1}>
            <input value={form.addressLine1} onChange={set('addressLine1')} autoComplete="address-line1" className={inputClass(fieldErrors.addressLine1)} />
          </Field>
          <Field label="Postal code" error={fieldErrors.postalCode}>
            <input
              value={form.postalCode}
              onChange={(e) => set('postalCode')({ target: { value: e.target.value.replace(/\D/g, '').slice(0, 6) } })}
              inputMode="numeric"
              autoComplete="postal-code"
              className={inputClass(fieldErrors.postalCode)}
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="font-semibold text-slate-900">Login</legend>
          <Field label="Username" error={fieldErrors.username}>
            <input value={form.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" className={inputClass(fieldErrors.username)} />
          </Field>
          <Field label="Password" error={fieldErrors.password}>
            <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" className={inputClass(fieldErrors.password)} />
          </Field>
          <Field label="Confirm password" error={fieldErrors.confirmPassword}>
            <input type="password" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" className={inputClass(fieldErrors.confirmPassword)} />
          </Field>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
        >
          {busy ? 'Sending code…' : 'Continue'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-emerald-700 underline">
          Log in
        </Link>
      </p>
    </main>
  );
}

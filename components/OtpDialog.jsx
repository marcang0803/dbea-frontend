'use client';

// Shared OTP confirmation dialog, used by every money action
// (send money – P2, lock rate – P4, accept advance – P6).
//
// How a screen uses it:
//   <OtpDialog
//     open={showOtp}
//     purpose="SEND"                    // SEND | LOCK | ADVANCE
//     referenceId={quoteId}             // the record being confirmed
//     title="Confirm transfer"
//     onSubmit={({ challengeId, otpCode }) => sendRemittance(quoteId, challengeId, otpCode)}
//     onClose={() => setShowOtp(false)}
//   />
//
// The dialog requests the code itself (C13 RequestOTP). It does NOT verify the code.
// The parent's onSubmit calls its own composite (e.g. ProcessRemittance), which verifies it
// server-side through C13. onSubmit must return a promise and throw an ApiError on failure:
//   422 → wrong code (user can retry) · 409 → expired / used / locked (user must get a new code).

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, p3Api } from '@/lib/p3Api';

const OTP_LENGTH = 6; // [verify] code length used by the SMULab Notification SendOTP service
const RESEND_COOLDOWN_SECONDS = 30;
const CODE_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);

function secondsUntil(isoDate, now) {
  if (!isoDate || !now) return null;
  return Math.max(0, Math.floor((new Date(isoDate).getTime() - now) / 1000));
}

function formatCountdown(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Mounted only while open, so every opening starts with fresh state. */
export default function OtpDialog({ open, ...props }) {
  if (!open) return null;
  return <OtpDialogBody {...props} />;
}

function OtpDialogBody({
  purpose,
  referenceId,
  title = 'Confirm with SMS code',
  description = 'We sent a one-time code to your mobile number.',
  confirmLabel = 'Confirm',
  onSubmit,
  onClose,
}) {
  const [challenge, setChallenge] = useState(null); // { challengeId, maskedMobile, expiresAt }
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('requesting'); // requesting | ready | submitting | needs-new-code
  const [error, setError] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(0); // set from timers/callbacks only (never during render)

  const inputRef = useRef(null);
  const requestSeq = useRef(0); // ignores replies from requests the user has moved past
  const firstRequestSent = useRef(false); // React dev mode runs effects twice; send one SMS only

  // Calls C13. All state updates happen after the await, so this is safe to start from an effect.
  const fetchChallenge = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const { data } = await p3Api.requestOtp(purpose, referenceId);
      if (seq !== requestSeq.current) return;
      const t = Date.now();
      setChallenge(data);
      setNow(t);
      setCooldownUntil(t + RESEND_COOLDOWN_SECONDS * 1000);
      setStatus('ready');
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setChallenge(null);
      setStatus('needs-new-code');
      setError(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.');
    }
  }, [purpose, referenceId]);

  // First code is requested when the dialog opens.
  useEffect(() => {
    if (firstRequestSent.current) return;
    firstRequestSent.current = true;
    fetchChallenge();
  }, [fetchChallenge]);

  // 1-second clock for the expiry countdown and the resend cooldown.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status === 'ready') inputRef.current?.focus();
  }, [status]);

  // Escape closes the dialog, except while a submission is in flight.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && status !== 'submitting') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, onClose]);

  function resend() {
    setStatus('requesting');
    setError('');
    setCode('');
    fetchChallenge();
  }

  const expiresIn = secondsUntil(challenge?.expiresAt, now);
  const expired = status === 'ready' && expiresIn === 0;
  const cooldownLeft = now ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
  const mustGetNewCode = status === 'needs-new-code' || expired;
  const canSubmit = status === 'ready' && !expired && CODE_PATTERN.test(code);
  const busy = status === 'requesting' || status === 'submitting';

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setError('');
    try {
      await onSubmit({ challengeId: challenge.challengeId, otpCode: code });
      // Success: the parent closes the dialog and shows its own result screen.
    } catch (err) {
      setCode('');
      if (err instanceof ApiError && err.status === 409) {
        setStatus('needs-new-code');
        setError('This code has expired or can no longer be used. Please request a new code.');
      } else {
        setStatus('ready');
        setError(
          err instanceof ApiError
            ? err.message || 'Incorrect code. Please try again.'
            : 'Something went wrong. Please try again.',
        );
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="otp-title"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="otp-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {status === 'requesting'
            ? 'Sending a code to your phone…'
            : challenge
              ? `${description} (${challenge.maskedMobile})`
              : description}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label htmlFor="otp-code" className="sr-only">
            One-time code
          </label>
          <input
            id="otp-code"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={'•'.repeat(OTP_LENGTH)}
            disabled={status !== 'ready' || expired}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/30 disabled:bg-slate-100"
          />

          {status === 'ready' && expiresIn !== null && (
            <p className={`text-xs ${expired ? 'text-red-600' : 'text-slate-500'}`}>
              {expired ? 'Code expired. Request a new one.' : `Code expires in ${formatCountdown(expiresIn)}`}
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-emerald-700 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {status === 'submitting' ? 'Confirming…' : confirmLabel}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={resend}
              disabled={busy || (cooldownLeft > 0 && !mustGetNewCode)}
              className="font-medium text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
            >
              {cooldownLeft > 0 && !mustGetNewCode ? `Resend code in ${cooldownLeft}s` : 'Send a new code'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={status === 'submitting'}
              className="text-slate-600 hover:underline disabled:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

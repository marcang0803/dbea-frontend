'use client';

// P3 dev page (mock mode only): try the shared OTP dialog and push a test notification.
// The real confirm screens belong to P2 (send), P4 (lock) and P6 (advance).

import Link from 'next/link';
import { useState } from 'react';
import OtpDialog from '@/components/OtpDialog';
import UnreadBadge from '@/components/UnreadBadge';
import { API_BASE, USE_MOCK_API, announceNotificationsChanged, request } from '@/lib/p3Api';

const PURPOSES = ['SEND', 'LOCK', 'ADVANCE'];

export default function DevPage() {
  const [purpose, setPurpose] = useState('SEND');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState('');
  const [referenceId, setReferenceId] = useState('Q-1001');

  if (!USE_MOCK_API) {
    return (
      <main className="mx-auto max-w-md px-4 pt-10 text-sm text-slate-600">
        This page only works in mock mode (<code>NEXT_PUBLIC_USE_MOCK_API=true</code>).
      </main>
    );
  }

  // Stands in for a P2/P4/P6 composite that verifies the OTP server-side.
  async function confirm({ challengeId, otpCode }) {
    await request(`${API_BASE}/dev/confirm`, {
      method: 'POST',
      body: { challengeId, otpCode, purpose, referenceId },
    });
    setOpen(false);
    setResult(`Confirmed ${purpose} for ${referenceId}.`);
    setReferenceId(`Q-${Math.floor(1000 + Math.random() * 9000)}`); // next action gets a new reference
  }

  async function addNotification() {
    await request(`${API_BASE}/dev/notify`, { method: 'POST' });
    announceNotificationsChanged();
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">P3 dev page</h1>
        <UnreadBadge />
      </header>
      <p className="mt-1 text-sm text-slate-500">Mock mode. Nothing here touches OutSystems.</p>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">OTP dialog</h2>
        <p className="mt-1 text-sm text-slate-600">
          Correct code <code className="rounded bg-slate-100 px-1">123456</code> · any other 6 digits = wrong code
          (5 tries) · <code className="rounded bg-slate-100 px-1">000000</code> = expired.
        </p>
        <div className="mt-4 flex gap-2">
          {PURPOSES.map((p) => (
            <button
              key={p}
              onClick={() => setPurpose(p)}
              className={`rounded-full px-3 py-1 text-sm ${purpose === p ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <button
          id="open-otp"
          onClick={() => {
            setResult('');
            setOpen(true);
          }}
          className="mt-4 w-full rounded-xl bg-emerald-700 py-3 font-medium text-white hover:bg-emerald-800"
        >
          Confirm {purpose.toLowerCase()} ({referenceId})
        </button>
        {result && (
          <p id="otp-result" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {result}
          </p>
        )}
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Notifications</h2>
        <p className="mt-1 text-sm text-slate-600">Adds an unread rate alert; the bell updates straight away.</p>
        <button
          id="add-notification"
          onClick={addNotification}
          className="mt-4 w-full rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Add test notification
        </button>
      </section>

      <nav className="mt-6 flex justify-center gap-6 text-sm">
        <Link href="/home" className="text-emerald-700 hover:underline">Home</Link>
        <Link href="/notifications" className="text-emerald-700 hover:underline">Inbox</Link>
      </nav>

      <OtpDialog
        open={open}
        purpose={purpose}
        referenceId={referenceId}
        title={`Confirm ${purpose.toLowerCase()}`}
        onSubmit={confirm}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}

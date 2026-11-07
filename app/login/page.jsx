'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { safeLoginReturn } from '@/lib/loginReturn.mjs';

function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    let response;
    let payload;
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(20000),
      });
      payload = await response.json().catch(() => null);
    } catch {
      setError('Login service did not respond. Please try again.');
      setSubmitting(false);
      return;
    }

    if (!response?.ok || payload?.success !== true || payload?.data?.authenticated !== true) {
      setError(payload?.errors?.[0]?.message || 'Could not log in. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    router.replace(safeLoginReturn(new URLSearchParams(window.location.search).get('next')));
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-5 py-12">
      <section className="w-full rounded-[2rem] border border-white/80 bg-white/95 p-7 shadow-[0_24px_70px_-30px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 text-lg font-bold text-white shadow-lg shadow-emerald-900/15">R</span>
          <div>
            <p className="font-semibold tracking-tight text-slate-950">RemitEase</p>
            <p className="text-xs text-slate-500">Money home, made simple</p>
          </div>
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">Use your RemitEase account to continue.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
            />
          </label>

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 py-4 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:bg-none disabled:bg-slate-300 disabled:shadow-none"
          >
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
          <p className="text-center text-xs leading-5 text-slate-400">Your sign-in is protected and your banking credentials are never stored in this browser.</p>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          New to RemitEase?{' '}
          <Link href="/signup" className="font-semibold text-emerald-700 hover:text-emerald-800">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <LoginForm />;
}

'use client';

// Family list (P1): C2 ManageFamily.
//   GET    /api/family/beneficiaries        → saved family members ({ items } via P2's proxy)
//   DELETE /api/family/beneficiaries/{id}   → remove (soft delete in A2)

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ApiError, isSessionExpired } from '@/lib/p3Api';
import { familyItems, p1Api } from '@/lib/p1Api';

const PRIMARY_BUTTON =
  'rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-xl';

// "Mum was added." after the add page redirects here with ?added=Mum.
// Read from the URL (not state) so it doesn't come back on a later visit.
function AddedNotice() {
  const added = useSearchParams().get('added');
  if (!added) return null;
  return (
    <p role="status" className="mt-6 rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      {added} was added. You can now send money to them.
    </p>
  );
}

export default function FamilyPage() {
  const router = useRouter();
  const [family, setFamily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmId, setConfirmId] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  const toLogin = useCallback(() => router.replace('/login'), [router]);

  const fetchFamily = useCallback(
    (signal) =>
      p1Api.listFamily({ signal }).then(
        ({ data }) => {
          setFamily(familyItems(data));
          setError('');
          setLoading(false);
        },
        (err) => {
          if (err?.name === 'AbortError') return;
          if (isSessionExpired(err)) return toLogin();
          setLoading(false);
          setError(err instanceof ApiError ? err.message : 'Could not load your family.');
        },
      ),
    [toLogin],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchFamily(controller.signal); // also re-runs when Next.js shows this kept page again
    return () => controller.abort();
  }, [fetchFamily]);

  // Next.js keeps this page mounted (hidden) after you leave it. Clear one-off messages and
  // the open "Remove?" prompt so they're gone when you come back.
  useLayoutEffect(
    () => () => {
      setNotice('');
      setError('');
      setConfirmId(null);
    },
    [],
  );

  function retry() {
    setLoading(true);
    setError('');
    fetchFamily();
  }

  async function remove(member) {
    setRemovingId(member.id);
    setError('');
    setNotice('');
    try {
      await p1Api.removeFamilyMember(member.id);
      setFamily((list) => list.filter((m) => m.id !== member.id));
      setNotice(`${member.nickname} was removed.`);
    } catch (err) {
      if (isSessionExpired(err)) return toLogin();
      if (err instanceof ApiError && err.status === 404) {
        // Already gone (e.g. removed on another device): drop it from the list.
        setFamily((list) => list.filter((m) => m.id !== member.id));
      }
      setError(err instanceof ApiError ? err.message : 'Could not remove. Please try again.');
    } finally {
      setRemovingId(null);
      setConfirmId(null);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pb-12 pt-7">
      <Link href="/home" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
        ← Back to home
      </Link>
      <header className="mt-4 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">My family</h1>
          <p className="mt-1 text-sm text-slate-500">The people you send money to.</p>
        </div>
        <Link href="/family/new" className={`${PRIMARY_BUTTON} shrink-0 px-4 py-2.5 text-sm`}>
          + Add
        </Link>
      </header>

      {notice ? (
        <p role="status" className="mt-6 rounded-2xl border border-emerald-200/70 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : (
        <Suspense fallback={null}>
          <AddedNotice />
        </Suspense>
      )}

      {error && (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{error}</p>
          {family.length === 0 && (
            <button onClick={retry} className="mt-2 font-medium underline">
              Try again
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-6 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : family.length === 0 && !error ? (
        <div className="mt-6 rounded-[1.75rem] border border-dashed border-slate-300 bg-white/80 p-7 text-center">
          <p className="font-semibold text-slate-900">No family members yet</p>
          <p className="mt-1 text-sm text-slate-500">Add the people you send money to. You only need to do this once.</p>
          <Link href="/family/new" className={`${PRIMARY_BUTTON} mt-5 inline-flex px-5 py-3 text-sm`}>
            Add a family member
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-2">
          {family.map((m) => (
            <li key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-700 font-semibold text-white">
                  {m.nickname.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{m.nickname}</p>
                  <p className="truncate text-sm text-slate-500">
                    {[m.relationship, m.accountLast4 && `•••${m.accountLast4}`, m.payoutCurrency].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {confirmId !== m.id && (
                  <button
                    onClick={() => setConfirmId(m.id)}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>

              {confirmId === m.id && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 p-3 text-sm">
                  <span className="text-red-800">Remove {m.nickname}?</span>
                  <span className="flex gap-2">
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={removingId === m.id}
                      className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => remove(m)}
                      disabled={removingId === m.id}
                      className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {removingId === m.id ? 'Removing…' : 'Remove'}
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/send"
        className="mt-8 block text-center text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        Send money to your family →
      </Link>
    </main>
  );
}

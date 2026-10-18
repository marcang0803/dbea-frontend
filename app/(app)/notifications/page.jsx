'use client';

// Notification inbox (P3). Data: A4 Notification via /api/notifications.
// Opening an item marks it read; its link is followed only if it points inside the app.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, announceNotificationsChanged, isSessionExpired, p3Api } from '@/lib/p3Api';
import { formatDateTime, isSafeInternalLink } from '@/lib/format';

const PAGE_SIZE = 20;

const TYPE_LABELS = {
  RECEIPT: 'Transfer',
  RATE_ALERT: 'Rate alert',
  LOCK: 'Rate lock',
  ADVANCE: 'Advance',
  REPAYMENT: 'Repayment',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetches one page from A4. State is only set inside the promise callbacks.
  const fetchPage = useCallback(
    (pageToLoad, signal) =>
      p3Api.listNotifications(pageToLoad, PAGE_SIZE, { signal }).then(
        ({ data }) => {
          const newItems = data?.items ?? [];
          setItems((prev) => (pageToLoad === 1 ? newItems : [...prev, ...newItems]));
          setTotal(Number(data?.total) || 0);
          setPage(pageToLoad);
          setError('');
          setLoading(false);
        },
        (err) => {
          if (err?.name === 'AbortError') return;
          if (isSessionExpired(err)) {
            router.replace('/login?next=/notifications');
            return;
          }
          setLoading(false);
          setError(err instanceof ApiError ? err.message : 'Could not load notifications.');
        },
      ),
    [router],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchPage(1, controller.signal);
    return () => controller.abort();
  }, [fetchPage]);

  function loadPage(pageToLoad) {
    setLoading(true);
    setError('');
    fetchPage(pageToLoad);
  }

  async function openItem(item) {
    if (!item.isRead) {
      // Optimistic: show it as read immediately; roll back if the server refuses.
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      try {
        await p3Api.markNotificationRead(item.id);
        announceNotificationsChanged();
      } catch {
        setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: false } : n)));
      }
    }
    if (isSafeInternalLink(item.link)) router.push(item.link);
  }

  const hasMore = items.length < total;

  return (
    <main className="mx-auto max-w-md px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <Link href="/home" className="rounded-full p-2 text-slate-600 hover:bg-slate-100" aria-label="Back to home">
          ←
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
      </header>

      {error && (
        <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <p>{error}</p>
          <button onClick={() => loadPage(items.length ? page + 1 : 1)} className="mt-2 font-medium underline">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          You&apos;re all caught up. Receipts and rate alerts will show up here.
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openItem(n)}
                className={`flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50 ${
                  n.isRead ? '' : 'bg-emerald-50/50'
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-emerald-600'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {TYPE_LABELS[n.type] ?? n.type}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{formatDateTime(n.createdOn)}</span>
                  </span>
                  <span className={`mt-0.5 block text-slate-900 ${n.isRead ? '' : 'font-semibold'}`}>{n.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-600">{n.message}</span>
                  {!n.isRead && <span className="sr-only">(unread)</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading && (
        <ul className="mt-6 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </ul>
      )}

      {hasMore && !loading && (
        <button
          onClick={() => loadPage(page + 1)}
          className="mt-4 w-full rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Load more
        </button>
      )}
    </main>
  );
}

'use client';

// Bell icon with the unread-notification count. Polls every 30 s, pauses while the tab is
// hidden, and refreshes at once when the inbox announces a change (e.g. a message was read).

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { NOTIFICATIONS_CHANGED_EVENT, p3Api } from '@/lib/p3Api';

const POLL_MS = 30_000;

export default function UnreadBadge({ initialCount = 0, href = '/notifications' }) {
  // null = not polled yet → show the count the page already loaded (initialCount).
  const [polled, setPolled] = useState(null);
  const count = polled ?? initialCount;

  const refresh = useCallback(async (signal) => {
    try {
      const { data } = await p3Api.getUnreadCount({ signal });
      setPolled(Number(data?.unread) || 0);
    } catch {
      // Keep showing the last known count; the badge is not worth an error message.
    }
  }, []);

  useEffect(() => {
    let controller = new AbortController();
    let timer = null;

    const start = () => {
      stop();
      controller = new AbortController();
      refresh(controller.signal);
      timer = setInterval(() => refresh(controller.signal), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      controller.abort();
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onChanged = () => refresh(controller.signal);

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    };
  }, [refresh]);

  const label = count > 0 ? `Notifications, ${count} unread` : 'Notifications';

  return (
    <Link
      href={href}
      aria-label={label}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

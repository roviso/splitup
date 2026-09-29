import { useEffect } from 'react';
import { qc, type Notice } from './api';
import { createStore } from './ui';

export type LiveNotice = Notice & { actorName: string };
type Push = { type: 'sync' } | ({ type: 'notification' } & LiveNotice);

/** 'live' once the event stream is open; the header shows a small pulse. */
export const [useLiveStatus, setLiveStatus] = createStore<'connecting' | 'live' | 'offline'>('connecting');
/** Pop-down banners for things that just happened. */
export const [useBanners, setBanners, getBanners] = createStore<LiveNotice[]>([]);
export const dismissBanner = (id: string) => setBanners(getBanners().filter((b) => b.id !== id));
/** "You and Sachin are friends now" — shown to both sides. */
export const [useCelebration, celebrate] = createStore<{ id: string; name: string; byMe: boolean } | null>(null);

// Bursts of pushes (e.g. an itemized bill touching 8 people) collapse into one refetch.
let pending: ReturnType<typeof setTimeout> | undefined;
const refetchSoon = () => {
  clearTimeout(pending);
  pending = setTimeout(() => qc.invalidateQueries(), 150);
};

function onPush(p: Push) {
  refetchSoon();
  if (p.type !== 'notification') return;
  const { type, ...n } = p;
  if (n.kind === 'friend_added' && n.actorId) celebrate({ id: n.actorId, name: n.actorName, byMe: false });
  else {
    setBanners([...getBanners().slice(-2), n]);
    setTimeout(() => dismissBanner(n.id), 6000);
  }
  navigator.vibrate?.(30);
}

/** Keeps one server-sent-events stream open while logged in, so what friends do shows up here without a reload. */
export function useLive(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    let es: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let wait = 1000;
    let opened = false;
    const open = () => {
      setLiveStatus('connecting');
      es = new EventSource('/api/events');
      es.addEventListener('hello', () => {
        setLiveStatus('live');
        wait = 1000;
        if (opened) qc.invalidateQueries(); // catch up on anything missed while disconnected
        opened = true;
      });
      es.onmessage = (e) => { try { onPush(JSON.parse(e.data)); } catch { /* ignore malformed */ } };
      es.onerror = () => {
        // Take over from EventSource's own retry so a logged-out/dead server backs off instead of hammering.
        es?.close();
        setLiveStatus('offline');
        retry = setTimeout(open, wait);
        wait = Math.min(wait * 2, 30_000);
      };
    };
    open();
    // Phones freeze background tabs; reconnect right away when the app comes back.
    const wake = () => {
      if (document.visibilityState === 'visible' && es?.readyState === EventSource.CLOSED) { clearTimeout(retry); wait = 1000; open(); }
    };
    document.addEventListener('visibilitychange', wake);
    return () => { clearTimeout(retry); es?.close(); document.removeEventListener('visibilitychange', wake); };
  }, [enabled]);
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users, X } from 'lucide-react';
import { api, type Inbox, type Notice } from '../api';
import { ago, money, usePrefs, useT } from '../i18n';
import { dismissBanner, celebrate, useBanners, useCelebration, useLiveStatus } from '../live';
import { openExpense, openSettle, useMe, usePeople } from '../store';
import { Avatar, Button, Modal, cx } from '../ui';

export const useInbox = () => useQuery({ queryKey: ['notifications'], queryFn: () => api<Inbox>('/notifications') });

const ICON: Record<string, string> = {
  friend_added: '🤝', group_added: '🏔️', group_joined: '👋', group_removed: '🚪', group_deleted: '🗑️',
  expense_added: '🧾', expense_updated: '✏️', expense_deleted: '🗑️', expense_restored: '♻️',
  settlement: '💸', settlement_confirmed: '✅', settlement_deleted: '↩️', reminder: '🔔',
  invite_claimed: '🎉', account_linked: '🔗',
};

/** One line of text for a notification, plus an optional money detail. */
export function useNoticeText() {
  const t = useT();
  const { lang } = usePrefs();
  const { name, me } = usePeople();
  return (n: Notice, actor: string, names: (id: string) => string = name) => {
    const d = n.data;
    const amt = money(d.amount ?? 0, lang);
    const v = { who: actor, group: d.group ?? '', what: d.description ?? '', amount: amt, name: d.name ?? '' };
    const who = (id?: string) => (id === me.id ? t('you') : id ? names(id) : '?');
    let text: string;
    switch (n.kind) {
      case 'friend_added': text = t('{who} added you as a friend', v); break;
      case 'group_added': text = t('{who} added you to “{group}”', v); break;
      case 'group_joined': text = t('{who} joined “{group}”', v); break;
      case 'group_removed': text = t('{who} removed you from “{group}”', v); break;
      case 'group_deleted': text = t('{who} deleted the group “{group}”', v); break;
      case 'expense_added': text = t('{who} added “{what}”', v); break;
      case 'expense_updated': text = t('{who} updated “{what}”', v); break;
      case 'expense_deleted': text = t('{who} deleted “{what}”', v); break;
      case 'expense_restored': text = t('{who} restored “{what}”', v); break;
      case 'settlement': text = d.to === me.id ? t('{from} paid you {amount}', { from: d.from === n.actorId ? actor : who(d.from), amount: amt })
        : t('{who} recorded: {from} paid {to} {amount}', { who: actor, from: who(d.from), to: who(d.to), amount: amt }); break;
      case 'settlement_confirmed': text = t('{who} confirmed getting {amount} ✓', v); break;
      case 'settlement_deleted': text = t('{who} deleted a payment of {amount}', v); break;
      case 'reminder': text = t('{who} nudged you: you owe {amount}', v); break;
      case 'invite_claimed': text = t('{who} joined Split-Up and linked “{name}”', v); break;
      case 'account_linked': text = t('{who} linked “{name}” to your account. Your shared history is here now.', v); break;
      default: text = actor;
    }
    const net = d.net ?? 0;
    const detail = n.kind.startsWith('expense_') && n.kind !== 'expense_deleted' && net
      ? { text: net > 0 ? t('You get back {amount}', { amount: money(net, lang) }) : t('You owe {amount}', { amount: money(net, lang) }), good: net > 0 }
      : null;
    const where = d.group && !n.kind.startsWith('group_') ? d.group : null;
    return { text, detail, where, icon: ICON[n.kind] ?? '🔔' };
  };
}

/** Where tapping a notification takes you. */
export function useOpenNotice() {
  const nav = useNavigate();
  const me = useMe();
  return (n: Notice) => {
    const d = n.data;
    if (n.kind === 'reminder' && n.actorId) return openSettle({ groupId: null, from: me.id, to: n.actorId, amount: d.amount });
    if (d.groupId && n.kind !== 'group_deleted' && n.kind !== 'group_removed') return nav(`/groups/${d.groupId}`);
    if (n.actorId) nav(`/friends/${n.actorId}`);
  };
}

export function NoticeRow({ n, actor, names, fresh }: { n: Notice; actor: string; names?: (id: string) => string; fresh?: boolean }) {
  const { lang } = usePrefs();
  const text = useNoticeText()(n, actor, names);
  const open = useOpenNotice();
  return (
    <button onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2 cursor-pointer', fresh && 'bg-marigold-soft/60')}>
      <span className="relative shrink-0">
        {n.actorId ? <Avatar id={n.actorId} name={actor} size={40} /> : <span className="grid size-10 place-items-center rounded-full bg-surface-2">🔔</span>}
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-surface text-[11px] shadow">{text.icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug">{text.text}</span>
        <span className="block text-xs text-muted">
          {text.detail && <span className={cx('font-semibold', text.detail.good ? 'text-owed' : 'text-owe')}>{text.detail.text} · </span>}
          {text.where && <>{text.where} · </>}{ago(n.createdAt, lang)}
        </span>
      </span>
      {fresh && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-marigold" aria-hidden />}
    </button>
  );
}

/** Live pop-downs from the top when a friend does something. */
export function Banners() {
  const items = useBanners();
  const describe = useNoticeText();
  const open = useOpenNotice();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))]" aria-live="polite">
      {items.map((n) => {
        const d = describe(n, n.actorName);
        return (
          <div key={n.id} className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-3xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur animate-[drop_.35s_cubic-bezier(.2,.9,.3,1.2)]">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer" onClick={() => { dismissBanner(n.id); open(n); }}>
              <span className="relative shrink-0">
                {n.actorId && <Avatar id={n.actorId} name={n.actorName} size={40} />}
                <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-surface text-[11px] shadow">{d.icon}</span>
              </span>
              <span className="min-w-0">
                <span className="line-clamp-2 text-sm font-semibold leading-snug">{d.text}</span>
                {(d.detail || d.where) && <span className={cx('block truncate text-xs', d.detail ? (d.detail.good ? 'text-owed' : 'text-owe') : 'text-muted')}>{d.detail?.text ?? d.where}</span>}
              </span>
            </button>
            <button onClick={() => dismissBanner(n.id)} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 cursor-pointer"><X size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

async function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fire = (await import('canvas-confetti')).default;
  const colors = ['#f2a007', '#d9480f', '#1f8a5b', '#2f6db3', '#fbf7f0'];
  fire({ particleCount: 90, spread: 75, origin: { y: 0.55 }, colors, zIndex: 100 });
  setTimeout(() => {
    fire({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors, zIndex: 100 });
    fire({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors, zIndex: 100 });
  }, 250);
}

/** Both sides see this the moment two people become friends. */
export function Celebrate() {
  const c = useCelebration();
  const t = useT();
  const me = useMe();
  const nav = useNavigate();
  useEffect(() => { if (c) confetti(); }, [c]);
  const first = c?.name.split(' ')[0] ?? '';
  const go = (f: () => void) => { celebrate(null); f(); };
  return (
    <Modal open={!!c} onClose={() => celebrate(null)} title={c?.byMe ? t('New friend!') : t('Someone added you!')}>
      {c && (
        <div className="space-y-6 text-center">
          <div className="flex items-center justify-center gap-1 pt-2">
            <span className="meet-l"><Avatar id={me.id} name={me.name} size={84} ring /></span>
            <span className="meet-heart z-10 -mx-4 grid size-11 place-items-center rounded-full bg-marigold text-xl shadow-lg">🤝</span>
            <span className="meet-r"><Avatar id={c.id} name={c.name} size={84} ring /></span>
          </div>
          <div className="space-y-1">
            <h3 className="font-display text-2xl font-extrabold">{c.byMe ? t('You and {name} are friends now!', { name: first }) : t('{name} added you as a friend', { name: c.name })}</h3>
            <p className="text-muted">{t('Anything you split together shows up for both of you, live.')}</p>
          </div>
          <div className="grid gap-2">
            <Button variant="marigold" size="lg" onClick={() => go(() => nav(`/groups?new=1&with=${c.id}`))}><Users size={18} /> {t('Start a group together')}</Button>
            <Button variant="soft" onClick={() => go(() => openExpense({ friendId: c.id }))}><Plus size={18} /> {t('Add an expense with {name}', { name: first })}</Button>
            <Button variant="ghost" onClick={() => go(() => nav(`/friends/${c.id}`))}>{t('See {name}', { name: first })}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Unread-notification count bubble. */
export function Unread({ className }: { className?: string }) {
  const n = useInbox().data?.unread ?? 0;
  if (!n) return null;
  return <span className={cx('grid h-5 min-w-5 place-items-center rounded-full bg-owe px-1.5 text-[11px] font-bold leading-none text-white animate-[pop_.3s]', className)}>{n > 99 ? '99+' : n}</span>;
}

/** "● Live": the event stream is open, so friends' changes appear by themselves. */
export function LivePill({ className }: { className?: string }) {
  const t = useT();
  const s = useLiveStatus();
  return (
    <span className={cx('inline-flex items-center gap-2 text-xs font-semibold', s === 'live' ? 'text-owed' : 'text-muted', className)} title={s === 'live' ? t('Changes from friends appear instantly') : t('Reconnecting…')}>
      {s === 'live' ? <span className="live-dot" /> : <span className="size-2 rounded-full bg-muted/50" />}
      {s === 'live' ? t('Live sync') : s === 'connecting' ? t('Connecting…') : t('Reconnecting…')}
    </span>
  );
}

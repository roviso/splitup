import { useState } from 'react';
import { Eye, Megaphone, X } from 'lucide-react';
import { api } from '../api';
import { useT } from '../i18n';
import { useConfig, useMe } from '../store';
import { Button, cx, toastError } from '../ui';

/** An admin is looking at the app as this user. Always on screen so nobody forgets. */
export function ViewAsBar() {
  const me = useMe();
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (!me.impersonatedBy) return null;
  const back = async () => {
    setBusy(true);
    try {
      await api('/auth/unimpersonate', {});
      location.href = `/admin/users/${me.id}`;
    } catch (e) { toastError(e); setBusy(false); }
  };
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-owe px-4 py-2 text-sm font-semibold text-white">
      <Eye size={16} className="shrink-0" />
      <span className="truncate">{t('Viewing as {name}. Everything you do happens as them.', { name: me.name })}</span>
      <Button size="sm" variant="ink" busy={busy} onClick={back} className="shrink-0 !bg-white !text-[#1b1a17]">{t('Back to admin')}</Button>
    </div>
  );
}

const DISMISSED = 'announcement-dismissed';
const read = () => { try { return localStorage.getItem(DISMISSED); } catch { return null; } };

/** Platform-wide message set in the admin console. Dismissing hides that exact text only. */
export function Announcement() {
  const a = useConfig().data?.announcement;
  const [hidden, setHidden] = useState(read);
  if (!a || hidden === a.text) return null;
  const hide = () => {
    try { localStorage.setItem(DISMISSED, a.text); } catch { /* private mode */ }
    setHidden(a.text);
  };
  return (
    <div className={cx('flex items-center gap-3 px-4 py-2.5 text-sm font-medium',
      a.tone === 'warn' ? 'bg-owe-soft text-owe' : a.tone === 'good' ? 'bg-owed-soft text-owed' : 'bg-marigold-soft text-ink')}>
      <Megaphone size={16} className="shrink-0" />
      <span className="flex-1">{a.text}</span>
      <button onClick={hide} className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-black/5 cursor-pointer" aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}

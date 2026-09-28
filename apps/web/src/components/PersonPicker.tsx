import { useState } from 'react';
import { Check, Search, UserPlus } from 'lucide-react';
import { api, refresh, type Person } from '../api';
import { useT } from '../i18n';
import { useDash } from '../store';
import { Avatar, Button, Input, cx, toastError } from '../ui';

/** Pick friends, or add someone new on the spot. */
export default function PersonPicker({ selected, onChange, exclude = [] }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[] }) {
  const t = useT();
  const dash = useDash().data;
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);

  const friends = (dash?.people ?? []).filter((p) => dash?.friendIds.includes(p.id) && !exclude.includes(p.id));
  const shown = friends.filter((p) => `${p.name} ${p.email ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const add = async () => {
    setBusy(true);
    try {
      const p = await api<Person>('/friends', { name: draft.name || q, email: draft.email || undefined, phone: draft.phone || undefined });
      await refresh();
      onChange([...new Set([...selected, p.id])]);
      setAdding(false); setDraft({ name: '', email: '', phone: '' }); setQ('');
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search friends')} className="pl-10" />
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {shown.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} className={cx('flex w-full items-center gap-3 rounded-2xl p-2 text-left transition cursor-pointer', on ? 'bg-marigold-soft' : 'hover:bg-surface-2')}>
              <Avatar id={p.id} name={p.name} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{p.name}</span>
                <span className="block truncate text-xs text-muted">{p.email ?? p.phone ?? (p.registered ? '' : t('Not on Split-Up yet'))}</span>
              </span>
              <span className={cx('grid size-6 place-items-center rounded-full border-2', on ? 'border-ink bg-ink text-on-ink' : 'border-line')}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button>
          );
        })}
        {!shown.length && !adding && <p className="px-2 py-3 text-sm text-muted">{q ? t('No friend called "{q}" yet.', { q }) : t('No friends yet.')}</p>}
      </div>
      {adding ? (
        <div className="space-y-2 rounded-2xl border border-line p-3">
          <Input autoFocus placeholder={t('Name')} value={draft.name || q} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input type="email" placeholder={t('Email (optional)')} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <Input type="tel" placeholder={t('Phone (optional)')} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>{t('Cancel')}</Button>
            <Button type="button" size="sm" busy={busy} disabled={!(draft.name || q).trim()} onClick={add}>{t('Add')}</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="soft" size="sm" onClick={() => setAdding(true)}><UserPlus size={16} /> {q ? t('Add "{q}"', { q }) : t('Add someone new')}</Button>
      )}
    </div>
  );
}

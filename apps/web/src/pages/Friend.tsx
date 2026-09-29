import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BellRing, HandCoins, Link2, Plus, Send, UserMinus, Users } from 'lucide-react';
import { api, refresh, type FriendDetail } from '../api';
import { money, usePrefs, useT } from '../i18n';
import { openExpense, openSettle, useDash, useMe } from '../store';
import { Avatar, Button, Card, Empty, Modal, Money, Spinner, cx, shareLink, toast, toastError, whatsapp } from '../ui';
import { LivePill } from '../components/Notices';
import { Ledger } from '../components/Rows';
import { inviteUrl } from './Friends';

export default function Friend() {
  const { id } = useParams();
  const t = useT();
  const nav = useNavigate();
  const { lang } = usePrefs();
  const me = useMe();
  const [linking, setLinking] = useState(false);
  const [nudging, setNudging] = useState(false);
  const q = useQuery({ queryKey: ['friend', id], queryFn: () => api<FriendDetail>(`/friends/${id}`) });
  if (q.error) return <Empty icon="🤷" title={t('Friend not found')} action={<Link to="/friends"><Button variant="soft">{t('Back to friends')}</Button></Link>} />;
  if (!q.data) return <Spinner />;
  const { friend: f, balance, parts, expenses, settlements, people, isFriend } = q.data;
  const first = f.name.split(' ')[0];
  const remindText = t('Hi {name}! Friendly reminder: you owe me {amount} on Split-Up. 🙏', { name: first, amount: money(balance, lang) });

  const nudge = async () => {
    setNudging(true);
    try { await api(`/friends/${f.id}/remind`, {}); toast(t('Nudge sent 👋 {name} will see it right away', { name: first })); } catch (e) { toastError(e); } finally { setNudging(false); }
  };
  const remove = async () => {
    if (!confirm(t('Remove {name} from your friends?', { name: f.name }))) return;
    try { await api(`/friends/${f.id}`, undefined, 'DELETE'); await refresh(); nav('/friends'); } catch (e) { toastError(e); }
  };

  return (
    <div className="space-y-6">
      <Link to="/friends" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} /> {t('Friends')}</Link>
      <header className="flex items-center gap-4">
        <Avatar id={f.id} name={f.name} size={64} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-extrabold tracking-tight">{f.name}</h1>
          <p className="truncate text-sm text-muted">{[f.email, f.phone].filter(Boolean).join(' · ') || t('Not on Split-Up yet')}</p>
          {f.registered && <LivePill className="mt-1" />}
        </div>
      </header>

      <Card className={cx('p-5', balance > 0 && 'bg-owed-soft border-transparent', balance < 0 && 'bg-owe-soft border-transparent')}>
        <p className="text-sm text-muted">{!balance ? t('All settled up') : balance > 0 ? t('{name} owes you', { name: first }) : t('You owe {name}', { name: first })}</p>
        {!!balance && <Money amount={balance} className="font-display text-4xl font-extrabold" />}
        {parts.length > 1 && (
          <ul className="mt-3 space-y-1 border-t border-line/60 pt-3 text-sm">
            {parts.map((p) => <li key={p.groupId ?? 'none'} className="flex justify-between"><span className="text-muted">{p.groupName ?? t('Non-group')}</span><Money amount={p.amount} /></li>)}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="marigold" onClick={() => openExpense({ friendId: f.id })} disabled={!isFriend}><Plus size={18} /> {t('Add expense')}</Button>
        {!!balance && (
          <Button onClick={() => openSettle(balance < 0 ? { groupId: null, from: me.id, to: f.id, amount: -balance, parts } : { groupId: null, from: f.id, to: me.id, amount: balance, parts })}>
            <HandCoins size={18} /> {t('Settle up')}
          </Button>
        )}
        {balance > 0 && f.registered && <Button variant="soft" busy={nudging} onClick={nudge}><BellRing size={16} /> {t('Nudge')}</Button>}
        {balance > 0 && (
          <a href={whatsapp(f.phone, remindText)} target="_blank" rel="noreferrer"><Button variant="soft"><Send size={16} /> WhatsApp</Button></a>
        )}
        {isFriend && <Button variant="soft" onClick={() => nav(`/groups?new=1&with=${f.id}`)}><Users size={16} /> {t('New group')}</Button>}
        {f.inviteToken && (
          <Button variant="soft" onClick={() => shareLink(t('Hey! I added you on Split-Up to split our bills:'), inviteUrl(f.inviteToken!), t('Invite link copied'))}><Send size={16} /> {t('Invite')}</Button>
        )}
      </div>

      {f.inviteToken && isFriend && (
        <Card className="flex items-center gap-3 border-dashed p-4">
          <span className="text-2xl">🔗</span>
          <p className="min-w-0 flex-1 text-sm"><b>{t('Is {name} on Split-Up now?', { name: first })}</b><br /><span className="text-muted">{t('Link this to their account and everything here syncs to them.')}</span></p>
          <Button size="sm" onClick={() => setLinking(true)}>{t('Link')}</Button>
        </Card>
      )}
      <LinkAccount open={linking} onClose={() => setLinking(false)} placeholder={f} />

      {expenses.length || settlements.length ? <Ledger expenses={expenses} settlements={settlements} people={people} /> : (
        <Empty icon="🧾" title={t('Nothing shared yet')} text={t('Expenses you share with {name} will show up here.', { name: first })} />
      )}
      {isFriend && <button onClick={remove} className="flex items-center gap-2 text-sm text-muted hover:text-owe cursor-pointer"><UserMinus size={16} /> {t('Remove friend')}</button>}
      {!isFriend && <p className="text-sm text-muted">{t('You know {name} through a group.', { name: first })}</p>}
    </div>
  );
}

/** Merge a by-name placeholder into the real account of a friend who has joined since. */
function LinkAccount({ open, onClose, placeholder }: { open: boolean; onClose: () => void; placeholder: { id: string; name: string } }) {
  const t = useT();
  const nav = useNavigate();
  const dash = useDash().data;
  const [busy, setBusy] = useState<string>();
  const real = (dash?.people ?? []).filter((p) => p.registered && dash?.friendIds.includes(p.id));
  const link = async (id: string, name: string) => {
    if (!confirm(t('Move everything with “{from}” to {to}? They will see all of it.', { from: placeholder.name, to: name }))) return;
    setBusy(id);
    try {
      await api(`/friends/${placeholder.id}/link`, { userId: id });
      await refresh();
      onClose();
      toast(t('Linked! {name} can see your shared history now 🎉', { name }));
      nav(`/friends/${id}`, { replace: true });
    } catch (e) { toastError(e); } finally { setBusy(undefined); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('Link “{name}”', { name: placeholder.name })}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('Pick their Split-Up account. Not in the list? Add them by code or email first.')}</p>
        {real.map((p) => (
          <button key={p.id} disabled={!!busy} onClick={() => link(p.id, p.name)} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left transition hover:bg-surface-2 cursor-pointer disabled:opacity-60">
            <Avatar id={p.id} name={p.name} size={36} />
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{p.name}</span><span className="block truncate text-xs text-muted">{p.email}</span></span>
            {busy === p.id ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <Link2 size={16} className="text-muted" />}
          </button>
        ))}
        {!real.length && <p className="rounded-2xl bg-surface-2 p-4 text-sm">{t('None of your friends are on Split-Up yet.')}</p>}
        <Link to="/friends?add=find" onClick={onClose}><Button variant="soft" className="w-full">{t('Add them by code or email')}</Button></Link>
      </div>
    </Modal>
  );
}

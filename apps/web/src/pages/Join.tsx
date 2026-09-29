import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api, refresh } from '../api';
import { useT } from '../i18n';
import { celebrate } from '../live';
import { useDash, useMe } from '../store';
import { Avatar, Button, Card, Empty, Spinner, toastError } from '../ui';
import { GROUP_EMOJI } from './Groups';

/** /join/:code — group invite link. */
export function Join() {
  const { code } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['join', code], queryFn: () => api<{ id: string; name: string; type: string; members: number; isMember: boolean }>(`/join/${code}`) });
  if (q.error) return <Empty icon="🔗" title={t('This group link is not valid')} />;
  if (!q.data) return <Spinner />;
  const g = q.data;
  const join = async () => {
    setBusy(true);
    try { await api(`/join/${code}`, {}); await refresh(); nav(`/groups/${g.id}`); } catch (e) { toastError(e); setBusy(false); }
  };
  return (
    <Card className="mx-auto mt-10 max-w-sm space-y-5 p-8 text-center">
      <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-marigold-soft text-5xl">{GROUP_EMOJI[g.type] ?? '👥'}</div>
      <div>
        <p className="text-muted">{t("You're invited to")}</p>
        <h1 className="font-display text-3xl font-extrabold">{g.name}</h1>
        <p className="text-sm text-muted">{t('{n} members', { n: g.members })}</p>
      </div>
      {g.isMember ? <Button className="w-full" onClick={() => nav(`/groups/${g.id}`)}>{t('Open group')}</Button>
        : <Button variant="marigold" size="lg" className="w-full" busy={busy} onClick={join}>{t('Join group')}</Button>}
    </Card>
  );
}

/** /invite/:token — a friend added you before you signed up; link their entries to your account. */
export function Invite() {
  const { token } = useParams();
  const t = useT();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['invite', token], queryFn: () => api<{ name: string; invitedBy: string | null }>(`/invites/${token}`), retry: false });
  if (q.error) return <Empty icon="🔗" title={t('This invite link is no longer valid')} text={t('It may have been used already.')} action={<Button onClick={() => nav('/')}>{t('Go home')}</Button>} />;
  if (!q.data) return <Spinner />;
  const claim = async () => {
    setBusy(true);
    try { await api(`/invites/${token}/claim`, {}); await refresh(); nav('/'); } catch (e) { toastError(e); setBusy(false); }
  };
  return (
    <Card className="mx-auto mt-10 max-w-sm space-y-5 p-8 text-center">
      <div className="text-5xl">🙏</div>
      <h1 className="font-display text-2xl font-extrabold">{t('{by} added you as “{name}”', { by: q.data.invitedBy ?? t('A friend'), name: q.data.name })}</h1>
      <p className="text-muted">{t('Link it to your account to see your shared expenses and balances.')}</p>
      <Button variant="marigold" size="lg" className="w-full" busy={busy} onClick={claim}>{t("That's me — link it")}</Button>
      <Button variant="ghost" className="w-full" onClick={() => nav('/')}>{t('Not me')}</Button>
    </Card>
  );
}

/** /add/:code — someone scanned or tapped a friend's personal QR/link. */
export function AddByCode() {
  const { code = '' } = useParams();
  const t = useT();
  const nav = useNavigate();
  const me = useMe();
  const dash = useDash().data;
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['code', code], queryFn: () => api<{ id: string; name: string }>(`/codes/${code}`), retry: false });
  if (q.error) return <Empty icon="🔍" title={t('No one has that friend code')} text={t('Ask your friend to show their code again. They may have made a new one.')} action={<Button onClick={() => nav('/friends?add=scan')}>{t('Scan a code')}</Button>} />;
  if (!q.data || !dash) return <Spinner />;
  const p = q.data;
  const first = p.name.split(' ')[0];
  const isMe = p.id === me.id;
  const isFriend = dash.friendIds.includes(p.id);
  const add = async () => {
    setBusy(true);
    try {
      await api('/friends/connect', { q: code });
      await refresh();
      nav(`/friends/${p.id}`, { replace: true });
      celebrate({ id: p.id, name: p.name, byMe: true });
    } catch (e) { toastError(e); setBusy(false); }
  };
  return (
    <Card className="mx-auto mt-6 max-w-sm overflow-hidden text-center">
      <div className="dhaka" />
      <div className="space-y-6 p-8">
        <div className="flex items-center justify-center">
          <span className="meet-l"><Avatar id={me.id} name={me.name} size={72} ring /></span>
          <span className="meet-heart z-10 -mx-3 grid size-10 place-items-center rounded-full bg-marigold text-lg shadow-lg">{isFriend ? '🤝' : '+'}</span>
          <span className="meet-r"><Avatar id={p.id} name={p.name} size={72} ring /></span>
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold">{isMe ? t('This is your own code') : isFriend ? t('You and {name} are already friends', { name: first }) : t('Add {name} on Split-Up?', { name: p.name })}</h1>
          <p className="mt-1 text-sm text-muted">{isMe ? t('Show it to a friend so they can add you.') : t('Groups, bills and payments you share will stay in sync for both of you.')}</p>
        </div>
        {isMe ? <Button className="w-full" onClick={() => nav('/friends?add=code')}>{t('Show my QR')}</Button>
          : isFriend ? <Button className="w-full" onClick={() => nav(`/friends/${p.id}`)}>{t('Open')}</Button>
          : <Button variant="marigold" size="lg" className="w-full" busy={busy} onClick={add}><UserPlus size={18} /> {t('Add friend')}</Button>}
      </div>
    </Card>
  );
}

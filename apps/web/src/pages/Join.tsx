import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, refresh } from '../api';
import { useT } from '../i18n';
import { Button, Card, Empty, Spinner, toastError } from '../ui';
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

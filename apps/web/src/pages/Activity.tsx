import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIES } from '@splitup/shared';
import { api, myNet, refresh, type Activity as Feed } from '../api';
import { ago, money, usePrefs, useT } from '../i18n';
import { openDetail, usePeople } from '../store';
import { Button, Card, Empty, PageHead, Segmented, Spinner, cx, toast, toastError } from '../ui';
import { LivePill, NoticeRow, Unread, useInbox } from '../components/Notices';

export default function Activity() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'all' ? 'all' : 'you';
  return (
    <div>
      <PageHead title={t('Activity')} sub={<LivePill />} />
      <div className="mb-5">
        <Segmented value={tab} onChange={(v) => setParams(v === 'all' ? { tab: 'all' } : {}, { replace: true })} options={[
          { value: 'you', label: <span className="flex items-center justify-center gap-2">{t('For you')} <Unread /></span> },
          { value: 'all', label: t('Everything') },
        ]} />
      </div>
      {tab === 'you' ? <ForYou /> : <Feed />}
    </div>
  );
}

/** Notifications addressed to me. Opening the tab marks them read, but they stay highlighted for this visit. */
function ForYou() {
  const t = useT();
  const q = useInbox();
  const { full } = usePeople(q.data?.people);
  const fresh = useRef(new Set<string>());
  for (const n of q.data?.items ?? []) if (!n.readAt) fresh.current.add(n.id);
  const unread = q.data?.unread ?? 0;
  useEffect(() => {
    if (!unread) return;
    const id = setTimeout(() => api('/notifications/read', {}).then(() => q.refetch()).catch(() => {}), 1200);
    return () => clearTimeout(id);
  }, [unread]);
  if (!q.data) return <Spinner />;
  const people = new Map(q.data.people.map((p) => [p.id, p.name]));
  if (!q.data.items.length) return <Empty icon="🔔" title={t('No notifications yet')} text={t('When friends add you, split a bill or pay you back, it shows up here, live.')} />;
  return (
    <Card className="divide-y divide-line overflow-hidden stagger">
      {q.data.items.map((n) => <NoticeRow key={n.id} n={n} actor={(n.actorId && people.get(n.actorId)) || t('Someone')} names={full} fresh={fresh.current.has(n.id)} />)}
    </Card>
  );
}

function Feed() {
  const t = useT();
  const { lang } = usePrefs();
  const q = useQuery({ queryKey: ['activity'], queryFn: () => api<Feed>('/activity') });
  const { name, obj, me } = usePeople(q.data?.people);
  if (!q.data) return <Spinner />;
  const group = (id: string | null) => (id ? q.data.groups.find((g) => g.id === id)?.name : null);

  const restore = async (id: string) => {
    try { await api(`/expenses/${id}/restore`, {}); await refresh(); toast(t('Expense restored')); } catch (e) { toastError(e); }
  };

  return (
    <div>
      {!q.data.items.length ? <Empty icon="🌱" title={t('Nothing here yet')} text={t('Add an expense and it will show up here.')} /> : (
        <ol className="relative space-y-1 border-l-2 border-dashed border-line pl-5 stagger">
          {q.data.items.map((it) => {
            if (it.kind === 'settlement') {
              const s = it.data;
              return (
                <li key={'s' + s.id} className={cx('relative rounded-2xl p-3', s.deletedAt && 'opacity-50')}>
                  <span className="absolute -left-[31px] top-4 grid size-5 place-items-center rounded-full bg-owed-soft text-[10px]">💸</span>
                  <p><b>{t('{from} paid {to}', { from: name(s.fromUser), to: obj(s.toUser) })}</b> <span className="font-semibold text-owed">{money(s.amount, lang)}</span>
                    {group(s.groupId) && <span className="text-muted"> · {group(s.groupId)}</span>}</p>
                  <p className="text-xs text-muted">{s.deletedAt ? t('Payment deleted') : ''} {ago(it.at, lang)}</p>
                </li>
              );
            }
            const e = it.data;
            const net = myNet(e, me.id);
            const verb = e.deletedAt ? '{who} deleted “{what}”' : e.updatedAt ? '{who} updated “{what}”' : '{who} added “{what}”';
            return (
              <li key={'e' + e.id} className="relative">
                <span className="absolute -left-[31px] top-4 grid size-5 place-items-center rounded-full bg-surface-2 text-[10px]">{CATEGORIES[e.category] ?? '🧾'}</span>
                <button disabled={!!e.deletedAt} onClick={() => openDetail({ expense: e, people: q.data.people })}
                  className={cx('w-full rounded-2xl p-3 text-left transition enabled:hover:bg-surface-2 enabled:cursor-pointer', e.deletedAt && 'opacity-60')}>
                  <p>
                    <span className={cx(e.deletedAt && 'line-through')}>{t(verb, { who: name(e.createdBy), what: e.description })}</span>
                    {group(e.groupId) && <span className="text-muted"> · {group(e.groupId)}</span>}
                  </p>
                  <p className="text-sm">
                    {net > 0 && <span className="text-owed">{t('You get back {amount}', { amount: money(net, lang) })}</span>}
                    {net < 0 && <span className="text-owe">{t('You owe {amount}', { amount: money(net, lang) })}</span>}
                    {!net && <span className="text-muted">{money(e.amount, lang)}</span>}
                    <span className="text-xs text-muted"> · {ago(it.at, lang)}</span>
                  </p>
                </button>
                {e.deletedAt && <Button size="sm" variant="soft" className="absolute right-2 top-3" onClick={() => restore(e.id)}>{t('Restore')}</Button>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

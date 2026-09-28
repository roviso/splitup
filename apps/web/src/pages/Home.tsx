import { Link } from 'react-router-dom';
import { ArrowRight, HandCoins, Plus, UserPlus, Users } from 'lucide-react';
import { useT, money, usePrefs } from '../i18n';
import { useDash, useMe, openExpense, openSettle } from '../store';
import { Avatar, Avatars, BalanceLine, Button, Card, Empty, Spinner, cx } from '../ui';
import { byId } from '../api';
import { LangSwitch } from './Login';
import { GROUP_EMOJI } from './Groups';

export default function Home() {
  const t = useT();
  const { lang } = usePrefs();
  const me = useMe();
  const { data, isPending } = useDash();
  if (isPending || !data) return <Spinner />;
  const people = byId(data.people);
  const net = data.totals.owed - data.totals.owe;
  const balances = [...data.balances].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const groupName = (id: string | null) => (id ? data.groups.find((g) => g.id === id)?.name : t('Non-group'));
  const fresh = !data.groups.length && !data.friendIds.length;

  return (
    <div className="space-y-8 stagger">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted">{t('Namaste')},</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{me.name.split(' ')[0]} 🙏</h1>
        </div>
        <div className="flex items-center gap-2">
          <LangSwitch />
          <Link to="/account" className="md:hidden"><Avatar id={me.id} name={me.name} size={40} /></Link>
        </div>
      </header>

      {/* receipt-style balance card */}
      <div className="receipt mb-10 rounded-t-3xl bg-ink p-6 text-on-ink">
        <p className="text-sm opacity-70">{t('Total balance')}</p>
        <p className={cx('font-display text-5xl font-extrabold tracking-tight', net > 0 && 'text-owed', net < 0 && 'text-owe')}>
          {net < 0 && '−'}{money(net, lang)}
        </p>
        <p className="mt-1 text-sm opacity-70">{!net ? t("You're all settled up. Shabash!") : net > 0 ? t('Overall, you are owed') : t('Overall, you owe')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-dashed border-on-ink/25 pt-4">
          <div><p className="text-xs opacity-70">{t('You are owed')}</p><p className="text-lg font-bold text-owed">{money(data.totals.owed, lang)}</p></div>
          <div><p className="text-xs opacity-70">{t('You owe')}</p><p className="text-lg font-bold text-owe">{money(data.totals.owe, lang)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Quick icon={<Plus />} label={t('Add expense')} onClick={() => openExpense({})} accent />
        <Quick icon={<HandCoins />} label={t('Settle up')} onClick={() => openSettle({ groupId: null })} />
        <Quick icon={<Users />} label={t('New group')} to="/groups?new=1" />
      </div>

      {fresh ? (
        <Empty icon="🥟" title={t('Start by adding your people')} text={t('Create a group for your trip, flat or momo gang — or add friends one by one.')}
          action={<div className="flex flex-wrap justify-center gap-2"><Link to="/groups?new=1"><Button variant="marigold"><Users size={18} /> {t('Create a group')}</Button></Link><Link to="/friends?add=1"><Button variant="soft"><UserPlus size={18} /> {t('Add friends')}</Button></Link></div>} />
      ) : (
        <>
          <section className="space-y-3">
            <SectionHead title={t('Balances')} to="/friends" more={t('All friends')} />
            {balances.length ? (
              <Card className="divide-y divide-line overflow-hidden">
                {balances.map((b) => {
                  const p = people.get(b.userId);
                  return (
                    <Link key={b.userId} to={`/friends/${b.userId}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2 transition">
                      <Avatar id={b.userId} name={p?.name ?? '?'} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p?.name}</p>
                        <p className="truncate text-xs text-muted">{b.parts.map((x) => groupName(x.groupId)).join(' · ')}</p>
                      </div>
                      <BalanceLine amount={b.total} />
                    </Link>
                  );
                })}
              </Card>
            ) : <p className="rounded-3xl bg-owed-soft px-5 py-4 text-owed font-medium">✨ {t('No pending balances. Everyone is square!')}</p>}
          </section>

          {!!data.groups.length && (
            <section className="space-y-3">
              <SectionHead title={t('Your groups')} to="/groups" more={t('All groups')} />
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0">
                {data.groups.map((g) => (
                  <Link key={g.id} to={`/groups/${g.id}`} className="w-60 shrink-0 snap-start md:w-auto">
                    <Card className="flex h-full flex-col gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="grid size-11 place-items-center rounded-2xl bg-marigold-soft text-2xl">{GROUP_EMOJI[g.type] ?? '👥'}</span>
                        <Avatars people={g.memberIds.map((id) => people.get(id)).filter((p) => !!p)} size={26} />
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <p className="font-display text-lg font-bold leading-tight">{g.name}</p>
                        <BalanceLine amount={g.balance} />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function SectionHead({ title, to, more }: { title: string; to: string; more: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <Link to={to} className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">{more} <ArrowRight size={14} /></Link>
    </div>
  );
}

function Quick({ icon, label, onClick, to, accent }: { icon: React.ReactNode; label: string; onClick?: () => void; to?: string; accent?: boolean }) {
  const cls = cx('flex flex-col items-center gap-2 rounded-3xl border p-4 text-sm font-semibold transition hover:-translate-y-0.5 cursor-pointer w-full',
    accent ? 'border-marigold bg-marigold text-[#1b1a17]' : 'border-line bg-surface');
  const body = <><span className="[&>svg]:size-6">{icon}</span>{label}</>;
  return to ? <Link to={to} className={cls}>{body}</Link> : <button onClick={onClick} className={cls}>{body}</button>;
}

import { Link } from 'react-router-dom';
import { ArrowRight, Radio } from 'lucide-react';
import { CATEGORIES, type Category } from '@splitup/shared';
import { Spinner, cx } from '../ui';
import { Bars, Composition, Funnel, Heatmap, Retention, SERIES, TimeChart } from './charts';
import { Delta, Head, Panel, PeriodPicker, Person, Stat, compact, num, rsShort, td, th, useAdmin, usePeriodDays, type Feed, type Period } from './kit';
import { FeedList } from './feed';

type Pair = { cur: number; prev: number };
type Overview = {
  period: Period; kpis: Record<'newUsers' | 'activeUsers' | 'expenses' | 'volume' | 'settlements' | 'settled' | 'aiBills' | 'groups', Pair>;
  totals: Record<'users' | 'placeholders' | 'admins' | 'suspended' | 'groups' | 'expenses' | 'volume' | 'settlements' | 'settled' | 'friendships' | 'sessions', number>;
  outstanding: { total: number; people: number }; stickiness: { dau: number; wau: number; mau: number }; live: { users: number; streams: number };
};
type Day = { day: string; signups: number; active: number; expenses: number; volume: number; settlements: number; settled: number; ai: number; groups: number };
type SeriesResp = { period: Period; series: Day[]; usersBefore: number };
type KV = { k: string; n: number; v?: number };
type Breakdowns = {
  categories: KV[]; splitTypes: KV[]; methods: KV[]; groupTypes: KV[]; ai: KV[]; heat: { dow: number; hour: number; n: number }[];
  topGroups: { id: string; name: string; type: string; n: number; v: number; members: number }[];
  topUsers: { id: string; name: string; email: string | null; n: number; v: number }[];
};
type Audience = { funnel: Record<string, number>; accounts: KV[]; locales: KV[]; calendars: KV[] };

/** Squash a daily series into ~12 buckets for a sparkline. */
const spark = (s: Day[], k: keyof Day) => {
  const size = Math.max(1, Math.ceil(s.length / 12));
  const out: number[] = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size).reduce((a, d) => a + Number(d[k]), 0));
  return out;
};
const rangeText = (p?: Period) => (p ? `${new Date(p.start + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(p.end + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · Nepal time` : '');

export function Overview() {
  const days = usePeriodDays();
  const o = useAdmin<Overview>(`/overview?days=${days}`, { refetchInterval: 30_000 });
  const s = useAdmin<SeriesResp>(`/series?days=${days}`);
  const feed = useAdmin<Feed>('/feed?limit=8', { refetchInterval: 8_000 });
  const b = useAdmin<Breakdowns>(`/breakdowns?days=${days}`);
  if (!o.data || !s.data) return <Spinner />;
  const { kpis: k, totals: t, stickiness: st } = o.data;
  const series = s.data.series;
  const dim = cx((o.isPlaceholderData || s.isPlaceholderData) && 'refetching');
  return (
    <div className="space-y-6">
      <Head title="Overview" sub={`${rangeText(o.data.period)} · changes compare with the ${o.data.period.days} days before`} right={<PeriodPicker />} />

      <div className={cx('grid gap-4 lg:grid-cols-[1.3fr_1fr]', dim)}>
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted">Money split on Split-Up</p>
              <p className="mt-1 text-5xl font-semibold tracking-tight md:text-6xl">{rsShort(k.volume.cur)}</p>
              <div className="mt-2"><Delta cur={k.volume.cur} prev={k.volume.prev} /></div>
              <p className="mt-3 text-sm text-muted">{num(k.expenses.cur)} expenses · {rsShort(k.settled.cur)} settled in {num(k.settlements.cur)} payments</p>
            </div>
            <Link to="/admin/live" className="flex items-center gap-2 rounded-full bg-owed-soft px-3 py-1.5 text-sm font-semibold text-owed">
              <span className="live-dot" /> {o.data.live.users} online now
            </Link>
          </div>
          <div className="mt-5">
            <TimeChart data={series} format={rsShort} height={200}
              series={[{ key: 'volume', label: 'Expenses added', color: SERIES[0] }, { key: 'settled', label: 'Settled up', color: SERIES[1] }]} />
          </div>
        </Panel>
        <Panel title="Happening now" right={<Link to="/admin/live" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><Radio size={14} /> Live feed <ArrowRight size={14} /></Link>} pad={false}>
          {feed.data ? <FeedList items={feed.data.items} who={feed.data.people} groups={feed.data.groups} dense /> : <Spinner />}
        </Panel>
      </div>

      <div className={cx('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6', dim)}>
        <Stat label="New users" value={num(k.newUsers.cur)} {...k.newUsers} spark={spark(series, 'signups')} to="/admin/users" />
        <Stat label="Active users" value={num(k.activeUsers.cur)} {...k.activeUsers} spark={spark(series, 'active')} />
        <Stat label="Expenses added" value={num(k.expenses.cur)} {...k.expenses} spark={spark(series, 'expenses')} to="/admin/money" />
        <Stat label="Settled up" value={rsShort(k.settled.cur)} {...k.settled} spark={spark(series, 'settled')} to="/admin/money?tab=payments" />
        <Stat label="AI bills" value={num(k.aiBills.cur)} {...k.aiBills} spark={spark(series, 'ai')} to="/admin/ai" />
        <Stat label="New groups" value={num(k.groups.cur)} {...k.groups} spark={spark(series, 'groups')} to="/admin/groups" />
      </div>

      <div className={cx('grid gap-4 lg:grid-cols-2', dim)}>
        <Panel title="Daily active users" sub="Anyone who opened the app or created something that day">
          <TimeChart data={series} series={[{ key: 'active', label: 'Active users', color: SERIES[0] }]} format={compact} height={190} integer />
        </Panel>
        <Panel title="Sign-ups per day">
          <TimeChart data={series} kind="columns" series={[{ key: 'signups', label: 'Sign-ups', color: SERIES[0] }]} format={compact} height={190} integer />
        </Panel>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Daily active (today)" value={num(st.dau)} hint={`${st.mau ? Math.round((st.dau / st.mau) * 100) : 0}% of monthly · stickiness`} />
        <Stat label="Weekly active" value={num(st.wau)} hint="last 7 days" />
        <Stat label="Monthly active" value={num(st.mau)} hint="last 30 days" />
      </div>

      <Panel title="All time">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ['Registered users', num(t.users)], ['Not joined yet', num(t.placeholders)], ['Groups', num(t.groups)], ['Friendships', num(t.friendships)],
            ['Expenses', num(t.expenses)], ['Money split', rsShort(t.volume)], ['Settled up', rsShort(t.settled)],
            ['Still owed', rsShort(o.data.outstanding.total)], ['Signed-in devices', num(t.sessions)], ['Admins · suspended', `${t.admins} · ${t.suspended}`],
          ].map(([l, v]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="font-display text-xl font-bold">{v}</dd></div>)}
        </dl>
      </Panel>

      {b.data && (
        <div className={cx('grid gap-4 lg:grid-cols-2', b.isPlaceholderData && 'refetching')}>
          <Panel title="Biggest groups" sub="By money split in this period" pad={false}><TopGroups rows={b.data.topGroups} /></Panel>
          <Panel title="Top payers" sub="Who fronted the most money" pad={false}><TopUsers rows={b.data.topUsers} /></Panel>
        </div>
      )}
    </div>
  );
}

function TopGroups({ rows }: { rows: Breakdowns['topGroups'] }) {
  if (!rows.length) return <p className="px-5 pb-6 text-sm text-muted">No group spending in this period</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr><th className={th}>Group</th><th className={cx(th, 'text-right')}>Members</th><th className={cx(th, 'text-right')}>Expenses</th><th className={cx(th, 'text-right')}>Split</th></tr></thead>
      <tbody>{rows.map((g) => (
        <tr key={g.id} className="border-t border-line">
          <td className={td}><Link to={`/admin/groups/${g.id}`} className="font-semibold hover:underline">{g.name}</Link> <span className="text-xs text-muted">{g.type}</span></td>
          <td className={cx(td, 'text-right tabular-nums')}>{g.members}</td><td className={cx(td, 'text-right tabular-nums')}>{g.n}</td>
          <td className={cx(td, 'whitespace-nowrap text-right font-semibold tabular-nums')}>{rsShort(g.v)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}
function TopUsers({ rows }: { rows: Breakdowns['topUsers'] }) {
  if (!rows.length) return <p className="px-5 pb-6 text-sm text-muted">No spending in this period</p>;
  const who = Object.fromEntries(rows.map((r) => [r.id, { name: r.name, email: r.email, registered: true, role: 'user' }]));
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr><th className={th}>Person</th><th className={cx(th, 'text-right')}>Expenses</th><th className={cx(th, 'text-right')}>Paid</th></tr></thead>
      <tbody>{rows.map((u) => (
        <tr key={u.id} className="border-t border-line">
          <td className={td}><Person id={u.id} who={who} sub={u.email} /></td>
          <td className={cx(td, 'text-right tabular-nums')}>{u.n}</td>
          <td className={cx(td, 'whitespace-nowrap text-right font-semibold tabular-nums')}>{rsShort(u.v)}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

const SPLIT_LABEL: Record<string, string> = { equal: 'Equally', exact: 'Exact amounts', percent: 'Percent', shares: 'Shares', itemized: 'Itemized bill' };
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', esewa: 'eSewa', khalti: 'Khalti', fonepay: 'Fonepay', bank: 'Bank', other: 'Other' };

export function Insights() {
  const days = usePeriodDays();
  const b = useAdmin<Breakdowns>(`/breakdowns?days=${days}`);
  const a = useAdmin<Audience>('/audience');
  const r = useAdmin<{ cohorts: { cohort: string; size: number; weeks: number[] }[] }>('/retention?weeks=10');
  if (!b.data || !a.data) return <Spinner />;
  const f = a.data.funnel;
  const comp = (rows: KV[], labels: Record<string, string> = {}) => {
    // ≤4 parts get a colour each, in fixed order by key; the rest fold into "Other".
    const top = rows.slice(0, 3), rest = rows.slice(3).reduce((s, x) => s + x.n, 0);
    return [...top.map((x, i) => ({ key: x.k, label: labels[x.k] ?? x.k, value: x.n, color: SERIES[i] })), ...(rest ? [{ key: 'other', label: 'Other', value: rest, color: SERIES[3] }] : [])];
  };
  return (
    <div className="space-y-6">
      <Head title="Insights" sub="How people use Split-Up" right={<PeriodPicker />} />
      <div className={cx('grid gap-4 lg:grid-cols-2', b.isPlaceholderData && 'refetching')}>
        <Panel title="What people split" sub="Money by category">
          <Bars format={rsShort} rows={b.data.categories.map((c) => ({ key: c.k, label: c.k, value: c.v ?? 0, icon: CATEGORIES[c.k as Category], detail: `${c.n} expenses` }))} />
        </Panel>
        <Panel title="When expenses get added" sub="Weekday × hour, Nepal time">
          <Heatmap cells={b.data.heat} />
        </Panel>
        <Panel title="How bills are split" sub="Number of expenses by split type">
          <Bars rows={b.data.splitTypes.map((c) => ({ key: c.k, label: SPLIT_LABEL[c.k] ?? c.k, value: c.n, detail: rsShort(c.v ?? 0) }))} format={num} />
        </Panel>
        <Panel title="How people settle up" sub="Money by payment method">
          <Bars format={rsShort} rows={b.data.methods.map((c) => ({ key: c.k, label: METHOD_LABEL[c.k] ?? c.k, value: c.v ?? 0, detail: `${c.n} payments` }))} />
        </Panel>
      </div>

      <Panel title="Activation funnel" sub="All registered users, all time">
        <Funnel steps={[
          { label: 'Signed up', n: f.registered }, { label: 'Has a friend', n: f.friended }, { label: 'In a group', n: f.grouped },
          { label: 'Added an expense', n: f.expensed }, { label: 'Settled up', n: f.settled }, { label: 'Used AI', n: f.ai },
        ]} />
      </Panel>

      <Panel title="Retention" sub="Share of each sign-up week still active N weeks later">
        {r.data ? <Retention cohorts={r.data.cohorts} /> : <Spinner />}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Sign-in methods" sub="All time"><Composition parts={comp(a.data.accounts, { google: 'Google', 'google+password': 'Google + password', password: 'Password', 'email code': 'Email code only', staff: 'Staff (username)' })} /></Panel>
        <Panel title="Language" sub="All time"><Composition parts={comp(a.data.locales, { en: 'English', ne: 'नेपाली' })} /></Panel>
        <Panel title="Calendar" sub="All time"><Composition parts={comp(a.data.calendars, { ad: 'A.D.', bs: 'B.S.' })} /></Panel>
      </div>
      <Panel title="New groups by type" sub="In this period">
        <Bars rows={b.data.groupTypes.map((c) => ({ key: c.k, label: c.k, value: c.n }))} format={num} empty="No new groups in this period" />
      </Panel>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleSlash, Download, Gift, Megaphone, Send, Wrench } from 'lucide-react';
import { api } from '../api';
import { Button, Field, Input, Segmented, Spinner, Toggle, cx, toast } from '../ui';
import { Bars, SERIES, TimeChart } from './charts';
import { Badge, Head, Pager, Panel, PeriodPicker, Person, Stat, Tabs, act, ago, ask, compact, num, td, th, useAdmin, usePeriodDays, when, type Period, type Who } from './kit';
import { actionText } from './feed';

// ================= AI & credits =================
type AiResp = {
  period: Period; series: { day: string; monthly: number; bonus: number }[];
  top: { id: string; name: string; email: string | null; n: number; turns: number; bonus: number; used: number }[];
  pool: { bonus: number; used: number; empty: number; referred: number; users: number };
  turns: { k: number; n: number }[];
  recent: { id: string; userId: string; name: string; bucket: string; turns: number; createdAt: string }[];
  config: { configured: boolean; enabled: boolean; model: string; freeMonthly: number; period: string };
};
export function Ai() {
  const days = usePeriodDays();
  const q = useAdmin<AiResp>(`/ai?days=${days}`);
  if (!q.data) return <Spinner />;
  const { pool, config: c, series } = q.data;
  const total = series.reduce((a, d) => a + d.monthly + d.bonus, 0);
  const who: Who = Object.fromEntries([...q.data.top, ...q.data.recent.map((r) => ({ id: r.userId, name: r.name, email: null }))].map((u) => [u.id, { name: u.name, email: u.email, registered: true, role: 'user' }]));
  return (
    <div className="space-y-6">
      <Head title="AI & credits" sub={<>Model <b>{c.model}</b> · {c.configured ? (c.enabled ? <span className="text-owed">on</span> : <span className="text-owe">switched off</span>) : 'no API key'} · {c.freeMonthly} free bills per user per month</>} right={<PeriodPicker />} />
      <div className={cx('grid grid-cols-2 gap-3 md:grid-cols-4', q.isPlaceholderData && 'refetching')}>
        <Stat label="AI bills in period" value={num(total)} hint={`${Math.round((series.reduce((a, d) => a + d.bonus, 0) / (total || 1)) * 100)}% paid with bonus credits`} />
        <Stat label={`Free credits used (${c.period})`} value={num(pool.used)} hint={`of ${num(pool.users * c.freeMonthly)} available`} />
        <Stat label="Bonus credits unspent" value={num(pool.bonus)} hint="never expire" />
        <Stat label="Out of credits" value={num(pool.empty)} hint={`users this month · ${num(pool.referred)} joined by invite`} />
      </div>
      <Panel title="AI bills per day" sub="Stacked by where the credit came from">
        <TimeChart data={series} kind="columns" format={compact} integer
          series={[{ key: 'monthly', label: 'Free monthly', color: SERIES[0] }, { key: 'bonus', label: 'Bonus', color: SERIES[1] }]} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Heaviest users" pad={false}>
          {!q.data.top.length ? <p className="px-5 pb-5 text-sm text-muted">No AI use in this period</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr><th className={th}>Person</th><th className={cx(th, 'text-right')}>Bills</th><th className={cx(th, 'text-right')}>Turns</th><th className={cx(th, 'text-right')}>Bonus left</th></tr></thead>
              <tbody>{q.data.top.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className={td}><Person id={u.id} who={who} sub={u.email} size={26} /></td>
                  <td className={cx(td, 'text-right tabular-nums')}>{u.n}</td><td className={cx(td, 'text-right tabular-nums')}>{u.turns}</td><td className={cx(td, 'text-right tabular-nums')}>{u.bonus}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </Panel>
        <Panel title="Back-and-forth per bill" sub="Turns in one AI session (10 = 10 or more)">
          <Bars rows={q.data.turns.map((t) => ({ key: String(t.k), label: `${t.k}${t.k === 10 ? '+' : ''} turn${t.k === 1 ? '' : 's'}`, value: t.n }))} format={num} />
        </Panel>
      </div>
      <Panel title="Latest AI bills" pad={false}>
        <ul className="divide-y divide-line">
          {q.data.recent.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-2 text-sm">
              <Person id={r.userId} who={who} size={24} />
              <span className="ml-auto text-muted">{r.turns} turn{r.turns === 1 ? '' : 's'} · {r.bucket} · {ago(r.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

// ================= platform controls =================
type Settings = {
  announcement: { active: boolean; text: string; tone: 'info' | 'warn' | 'good' }; aiEnabled: boolean; signupsEnabled: boolean;
  maintenance: { active: boolean; message: string };
};
export function Controls() {
  const q = useAdmin<Settings>('/settings');
  const [a, setA] = useState<Settings['announcement'] | null>(null);
  const [m, setM] = useState('');
  useEffect(() => { if (q.data) { setA(q.data.announcement); setM(q.data.maintenance.message); } }, [q.data]);
  if (!q.data || !a) return <Spinner />;
  const s = q.data;
  const save = (patch: Partial<Settings>, done: string) => act(() => api('/admin/settings', patch, 'PUT'), done);
  const flip = async (key: 'aiEnabled' | 'signupsEnabled', label: string) => {
    const on = !s[key];
    if (!on && (await ask({ title: `Switch off ${label}?`, body: 'Takes effect for everyone within a few seconds. You can switch it back on any time.', confirm: 'Switch off', danger: true })) === null) return;
    save({ [key]: on }, `${label} ${on ? 'on' : 'off'}`);
  };
  const maintenance = async () => {
    const on = !s.maintenance.active;
    if (on && (await ask({ title: 'Turn on maintenance mode?', body: 'Everyone except admins gets a “back soon” screen right away, and the app stops working for them until you turn it off.', confirm: 'Turn on', danger: true, typeToConfirm: 'MAINTENANCE' })) === null) return;
    save({ maintenance: { active: on, message: m || s.maintenance.message } }, on ? 'Maintenance mode on' : 'Split-Up is open again');
  };
  const broadcast = async () => {
    const msg = await ask({ title: 'Message everyone', body: 'Goes to every registered user’s notifications, with a live pop-up for anyone online. Use sparingly.', confirm: 'Send to everyone', input: { label: 'Message', multiline: true, required: true }, danger: false });
    if (!msg) return;
    if ((await ask({ title: 'Send it?', body: <>“{msg}”</>, confirm: 'Yes, send' })) === null) return;
    const r = await act(() => api<{ sent: number }>('/admin/broadcast', { message: msg }));
    if (r) toast(`Sent to ${r.sent} people`);
  };
  const gift = async () => {
    const n = await ask({ title: 'Gift AI credits to everyone', body: 'Adds bonus credits (they never expire) to every active registered user.', confirm: 'Gift', input: { label: 'Credits each', type: 'number', initial: '5', required: true } });
    if (!n || !(+n >= 1 && +n <= 100)) return;
    const note = await ask({ title: 'Tell them?', body: 'Optional notification sent with the gift. Leave empty to gift quietly.', confirm: 'Gift now', input: { label: 'Message', initial: `🎁 You got ${n} bonus AI credits from Split-Up!` } });
    if (note === null) return;
    const r = await act(() => api<{ users: number }>('/admin/credits/gift-all', { amount: +n, note: note || undefined }));
    if (r) toast(`${n} credits gifted to ${r.users} people`);
  };
  const Switch = ({ on, label, sub, onClick, icon: Icon }: { on: boolean; label: string; sub: string; onClick: () => void; icon: typeof Wrench }) => (
    <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5">
      <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', on ? 'bg-owed-soft text-owed' : 'bg-owe-soft text-owe')}><Icon size={20} /></span>
      <span className="min-w-0 flex-1"><b className="block">{label}</b><span className="text-sm text-muted">{sub}</span></span>
      <Toggle checked={on} onChange={onClick} label={<span className="sr-only">{label}</span>} />
    </div>
  );
  return (
    <div className="space-y-6">
      <Head title="Platform controls" sub="Switches that affect everyone. Every change is in the audit log." />
      <div className="grid gap-3 md:grid-cols-2">
        <Switch on={s.aiEnabled} label="AI bill scanning & chat" sub={s.aiEnabled ? 'On for everyone with credits' : 'Off: AI buttons are hidden'} onClick={() => flip('aiEnabled', 'AI')} icon={s.aiEnabled ? CheckCircle2 : CircleSlash} />
        <Switch on={s.signupsEnabled} label="New sign-ups" sub={s.signupsEnabled ? 'Anyone can create an account' : 'Paused: only existing accounts can log in'} onClick={() => flip('signupsEnabled', 'Sign-ups')} icon={s.signupsEnabled ? CheckCircle2 : CircleSlash} />
      </div>

      <Panel title={<span className="flex items-center gap-2"><Megaphone size={17} /> Announcement banner</span>} sub="A strip at the top of the app for everyone. People can dismiss it; changing the text shows it again.">
        <div className="space-y-4">
          <Field label="Text"><Input maxLength={280} value={a.text} onChange={(e) => setA({ ...a, text: e.target.value })} placeholder="e.g. Happy Dashain! Scan your festival bills with AI 🎉" /></Field>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-72 shrink-0"><Segmented value={a.tone} onChange={(tone) => setA({ ...a, tone })} options={[{ value: 'info', label: 'Info' }, { value: 'good', label: 'Good news' }, { value: 'warn', label: 'Warning' }]} /></div>
            <div className={cx('min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-sm', a.tone === 'warn' ? 'bg-owe-soft text-owe' : a.tone === 'good' ? 'bg-owed-soft text-owed' : 'bg-marigold-soft')}>{a.text || 'Preview'}</div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {s.announcement.active && <Button variant="soft" onClick={() => save({ announcement: { ...a, active: false } }, 'Banner hidden')}>Hide banner</Button>}
            <Button disabled={!a.text.trim()} onClick={() => save({ announcement: { ...a, active: true } }, 'Banner is live')}>{s.announcement.active ? 'Update banner' : 'Show banner'}</Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><Send size={17} /> Message everyone</span>} sub="A notification to every registered user">
          <Button onClick={broadcast}><Send size={15} /> Write a message</Button>
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Gift size={17} /> Gift AI credits</span>} sub="Bonus credits for every active user, e.g. for a festival">
          <Button variant="marigold" onClick={gift}><Gift size={15} /> Gift credits</Button>
        </Panel>
      </div>

      <Panel title={<span className="flex items-center gap-2"><Wrench size={17} /> Maintenance mode</span>} className={cx(s.maintenance.active && 'border-owe')}
        sub={s.maintenance.active ? 'ON: only admins can use Split-Up right now' : 'Shows a “back soon” screen to everyone except admins'}>
        <div className="space-y-3">
          <Field label="Message people see"><Input maxLength={280} value={m} onChange={(e) => setM(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            {s.maintenance.active && m !== s.maintenance.message && <Button variant="soft" onClick={() => save({ maintenance: { active: true, message: m } }, 'Message updated')}>Update message</Button>}
            <Button variant={s.maintenance.active ? 'marigold' : 'danger'} onClick={maintenance}>{s.maintenance.active ? 'Turn off maintenance' : 'Turn on maintenance'}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ================= audit log =================
type AuditResp = { total: number; page: number; pageSize: number; items: { id: string; at: string; actorId: string | null; action: string; targetType: string | null; targetId: string | null; data: Record<string, any>; ip: string | null }[]; people: Who };
export function Audit() {
  const [sp, setSp] = useSearchParams();
  const action = sp.get('action') ?? 'admin', page = Number(sp.get('page') ?? 0);
  const q = useAdmin<AuditResp>(`/audit?action=${action}&page=${page}`);
  return (
    <div className="space-y-5">
      <Head title="Audit log" sub="Who did what. Admin actions and sign-ins are recorded here and can't be edited."
        right={<a href="/api/admin/export/audit" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-semibold hover:bg-line"><Download size={14} /> Export CSV</a>} />
      <Tabs value={action} onChange={(v) => setSp({ action: v }, { replace: true })} options={[{ value: 'admin', label: 'Admin actions' }, { value: 'login', label: 'Sign-ins' }, { value: 'all', label: 'Everything' }]} />
      <Panel pad={false} className={cx(q.isPlaceholderData && 'refetching')}>
        {!q.data ? <Spinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>What</th><th className={th}>Details</th><th className={th}>IP</th></tr></thead>
                <tbody>{q.data.items.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className={cx(td, 'whitespace-nowrap text-muted')} title={when(r.at)}>{ago(r.at)}</td>
                    <td className={td}><Person id={r.actorId} who={q.data!.people} size={24} /></td>
                    <td className={td}>
                      {r.action === 'login' ? `signed in${r.data.method ? ` with ${r.data.method}` : ''}` : actionText(r.action, r.data)}
                      {r.targetType === 'user' && r.targetId && r.targetId !== r.actorId && <> <Link className="font-semibold hover:underline" to={`/admin/users/${r.targetId}`}>{q.data!.people[r.targetId]?.name ?? 'user'}</Link></>}
                      {r.targetType === 'group' && r.targetId && <> <Link className="font-semibold hover:underline" to={`/admin/groups/${r.targetId}`}>(group)</Link></>}
                    </td>
                    <td className={cx(td, 'max-w-sm')}><Details data={r.data} /></td>
                    <td className={cx(td, 'whitespace-nowrap font-mono text-xs text-muted')}>{r.ip ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Pager page={q.data.page} total={q.data.total} size={q.data.pageSize} onPage={(p) => setSp({ action, page: String(p) }, { replace: true })} />
          </>
        )}
      </Panel>
    </div>
  );
}
function Details({ data }: { data: Record<string, any> }) {
  const entries = Object.entries(data).filter(([k]) => k !== 'method');
  if (!entries.length) return <span className="text-muted">—</span>;
  const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <details className="text-xs">
      <summary className="cursor-pointer truncate text-muted">{entries.map(([k, v]) => `${k}: ${show(v)}`).join(' · ').slice(0, 80)}</summary>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

// ================= system =================
type Sys = {
  server: { node: string; uptime: number; pid: number; platform: string; memory: { rss: number; heapUsed: number; heapTotal: number }; env: string; socket: boolean };
  db: { version: string; size: number; connections: number; migrations: number; now: string };
  tables: { t: string; n: number; size: number }[]; live: { users: number; streams: number };
  integrations: { email: boolean; google: boolean; googleRedirect: boolean; openai: boolean; model: string; adminEmails: number };
};
const bytes = (b: number) => (b > 1 << 30 ? `${(b / (1 << 30)).toFixed(1)} GB` : b > 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const uptime = (s: number) => (s > 86400 ? `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h` : s > 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m`);
export function System() {
  const q = useAdmin<Sys>('/system', { refetchInterval: 10_000 });
  if (!q.data) return <Spinner />;
  const { server: s, db, integrations: i } = q.data;
  const Check = ({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) => (
    <li className="flex items-center gap-3 py-2 text-sm">
      {ok ? <CheckCircle2 size={18} className="text-owed" /> : <CircleSlash size={18} className="text-muted" />}
      <span className="flex-1">{label}</span>{sub && <span className="text-xs text-muted">{sub}</span>}
      <Badge tone={ok ? 'good' : 'muted'}>{ok ? 'on' : 'off'}</Badge>
    </li>
  );
  const maxSize = Math.max(...q.data.tables.map((t) => t.size), 1);
  return (
    <div className="space-y-6">
      <Head title="System" sub={`Refreshes every 10 seconds · server time ${new Date(db.now).toLocaleTimeString('en-GB')}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Uptime" value={uptime(s.uptime)} hint={`pid ${s.pid} · ${s.env}`} />
        <Stat label="Memory" value={bytes(s.memory.rss)} hint={`heap ${bytes(s.memory.heapUsed)} / ${bytes(s.memory.heapTotal)}`} />
        <Stat label="Database" value={bytes(db.size)} hint={`${db.connections} connections · ${db.migrations} migrations`} />
        <Stat label="Live connections" value={num(q.data.live.streams)} hint={`${q.data.live.users} people online`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Integrations">
          <ul className="divide-y divide-line">
            <Check ok={i.email} label="Email (login codes)" sub="SMTP" />
            <Check ok={i.google} label="Google sign-in" sub={i.googleRedirect ? 'redirect flow' : 'in-page button'} />
            <Check ok={i.openai} label="OpenAI" sub={i.model} />
            <Check ok={i.adminEmails > 0} label="ADMIN_EMAILS" sub={`${i.adminEmails} address${i.adminEmails === 1 ? '' : 'es'}`} />
          </ul>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Node</dt><dd>{s.node} · {s.platform}</dd>
            <dt className="text-muted">Postgres</dt><dd>{db.version}</dd>
            <dt className="text-muted">Listening on</dt><dd>{s.socket ? 'Unix socket (nginx)' : 'TCP port'}</dd>
          </dl>
        </Panel>
        <Panel title="Tables" sub="Rows and disk size" pad={false}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr><th className={th}>Table</th><th className={cx(th, 'text-right')}>Rows</th><th className={th}>Size</th></tr></thead>
            <tbody>{q.data.tables.map((t) => (
              <tr key={t.t} className="border-t border-line">
                <td className={cx(td, 'py-2 font-mono text-xs')}>{t.t}</td><td className={cx(td, 'py-2 text-right tabular-nums')}>{num(t.n)}</td>
                <td className={cx(td, 'py-2')}><span className="flex items-center gap-2"><span className="h-2 rounded-r-[4px]" style={{ width: `${Math.max(2, (t.size / maxSize) * 100)}px`, background: SERIES[0] }} /><span className="text-xs text-muted tabular-nums">{bytes(t.size)}</span></span></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Panel>
      </div>
      <Panel title="Exports" sub="CSV, opens in Excel or Google Sheets. Exports are logged.">
        <div className="flex flex-wrap gap-2">
          {['users', 'groups', 'expenses', 'settlements', 'audit'].map((k) => (
            <a key={k} href={`/api/admin/export/${k}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold capitalize hover:bg-line"><Download size={14} /> {k}</a>
          ))}
        </div>
      </Panel>
    </div>
  );
}

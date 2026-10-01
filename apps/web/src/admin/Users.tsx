import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Ban, CheckCircle2, Download, Eye, KeyRound, LogOut, MessageSquare, Pencil, ShieldCheck, ShieldOff, Sparkles, Trash2, UserX,
} from 'lucide-react';
import { CATEGORIES, type Category } from '@splitup/shared';
import { api } from '../api';
import { Avatar, Button, Field, Input, Modal, Segmented, Spinner, cx, toast } from '../ui';
import { ActivityCalendar } from './charts';
import {
  Badge, Head, Pager, Panel, Search, Tabs, act, ago, ask, device, num, rs, rsShort, td, th, useAdmin, when,
  type AdminUser, type Expense, type FeedItem, type Settlement, type Who,
} from './kit';
import { FeedList, openExpenseDrawer } from './feed';

type Row = AdminUser & { groups: number; friends: number; expenses: number; paid: number };
type List = { total: number; page: number; pageSize: number; users: Row[] };

export function UserBadges({ u }: { u: Pick<AdminUser, 'role' | 'registered' | 'suspendedAt' | 'online'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {u.role === 'admin' && <Badge tone="ink">admin</Badge>}
      {u.suspendedAt && <Badge tone="bad">suspended</Badge>}
      {!u.registered && <Badge>not joined</Badge>}
      {u.online && <Badge tone="good">online</Badge>}
    </span>
  );
}

export function Users() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '', filter = sp.get('filter') ?? 'registered', sort = sp.get('sort') ?? 'joined', page = Number(sp.get('page') ?? 0);
  const set = (k: string, v: string) => setSp((p) => { p.set(k, v); if (k !== 'page') p.delete('page'); return p; }, { replace: true });
  const list = useAdmin<List>(`/users?q=${encodeURIComponent(q)}&filter=${filter}&sort=${sort}&page=${page}`);
  const nav = useNavigate();
  return (
    <div className="space-y-5">
      <Head title="Users" sub={list.data ? `${num(list.data.total)} matching` : undefined}
        right={<a href="/api/admin/export/users" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-semibold hover:bg-line"><Download size={14} /> Export CSV</a>} />
      <div className="flex flex-wrap items-center gap-3">
        <Search value={q} onChange={(v) => set('q', v)} placeholder="Name, email, phone, friend code…" />
        <Tabs value={filter} onChange={(v) => set('filter', v)} options={[
          { value: 'registered', label: 'Joined' }, { value: 'placeholders', label: 'Not joined' }, { value: 'admins', label: 'Admins' },
          { value: 'suspended', label: 'Suspended' }, { value: 'all', label: 'Everyone' },
        ]} />
        <select value={sort} onChange={(e) => set('sort', e.target.value)} className="h-10 rounded-full border border-line bg-surface px-3 text-sm font-semibold" aria-label="Sort">
          <option value="joined">Newest</option><option value="seen">Recently active</option><option value="paid">Most money paid</option>
          <option value="groups">Most groups</option><option value="name">Name A–Z</option>
        </select>
      </div>
      <Panel pad={false} className={cx(list.isPlaceholderData && 'refetching')}>
        {!list.data ? <Spinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr>
                  <th className={th}>Person</th><th className={th}>Joined</th><th className={th}>Last seen</th>
                  <th className={cx(th, 'text-right')}>Groups</th><th className={cx(th, 'text-right')}>Friends</th><th className={cx(th, 'text-right')}>Expenses</th>
                  <th className={cx(th, 'text-right')}>Paid</th><th className={cx(th, 'text-right')}>AI credits</th>
                </tr></thead>
                <tbody>
                  {list.data.users.map((u) => (
                    <tr key={u.id} onClick={() => nav(`/admin/users/${u.id}`)} className="cursor-pointer border-t border-line transition hover:bg-surface-2">
                      <td className={td}>
                        <span className="flex items-center gap-3">
                          <Avatar id={u.id} name={u.name} size={34} />
                          <span className="min-w-0">
                            <span className="flex items-center gap-2"><Link to={`/admin/users/${u.id}`} className="truncate font-semibold hover:underline">{u.name}</Link><UserBadges u={u} /></span>
                            <span className="block truncate text-xs text-muted">{u.email ?? (u.username ? `@${u.username}` : u.phone ?? '—')}</span>
                          </span>
                        </span>
                      </td>
                      <td className={cx(td, 'whitespace-nowrap text-muted')}>{ago(u.joinedAt ?? u.createdAt)}</td>
                      <td className={cx(td, 'whitespace-nowrap text-muted')}>{u.online ? <span className="font-semibold text-owed">now</span> : ago(u.lastSeenAt)}</td>
                      <td className={cx(td, 'text-right tabular-nums')}>{u.groups}</td>
                      <td className={cx(td, 'text-right tabular-nums')}>{u.friends}</td>
                      <td className={cx(td, 'text-right tabular-nums')}>{u.expenses}</td>
                      <td className={cx(td, 'text-right font-semibold tabular-nums')}>{rsShort(u.paid)}</td>
                      <td className={cx(td, 'text-right tabular-nums')}>{u.registered ? u.credits.left : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={list.data.page} total={list.data.total} size={list.data.pageSize} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </Panel>
    </div>
  );
}

type Detail = {
  user: AdminUser; counts: { notifications: number; created: number; paid: number; share: number }; balance: { owed: number; owe: number };
  groups: { id: string; name: string; type: string; createdBy: string; members: number }[]; friendIds: string[];
  expenses: Expense[]; settlements: Settlement[];
  aiSessions: { id: string; bucket: string; turns: number; createdAt: string }[];
  sessions: { id: string; createdAt: string; expiresAt: string; method: string | null; ip: string | null; userAgent: string | null; impersonatorId: string | null }[];
  referrals: { id: string; name: string; joinedAt: string | null }[];
  activeDays: string[]; history: FeedItem[]; people: Who; groupNames: Record<string, string>;
};

export function UserDetail() {
  const id = useParams().id!;
  const q = useAdmin<Detail>(`/users/${id}`, { refetchInterval: 20_000 });
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  if (q.error) return <p className="py-16 text-center text-muted">{q.error.message}</p>;
  if (!q.data) return <Spinner />;
  const { user: u, counts, balance } = q.data;
  const who: Who = { ...q.data.people, [u.id]: { name: u.name, email: u.email, registered: u.registered, role: u.role } };
  const post = (path: string, body: unknown = {}, done?: string) => act(() => api(`/admin/users/${u.id}${path}`, body), done);

  const actions = {
    viewAs: async () => {
      if ((await ask({ title: `View Split-Up as ${u.name}?`, body: 'You’ll see exactly what they see, and anything you do happens as them. Every change is written to the audit log. A red bar lets you come back.', confirm: 'View as them' })) === null) return;
      await api(`/admin/users/${u.id}/impersonate`, {});
      location.href = '/';
    },
    message: async () => {
      const m = await ask({ title: `Message ${u.name}`, body: 'Shows up in their notifications, from the Split-Up team.', confirm: 'Send', input: { label: 'Message', multiline: true, required: true } });
      if (m) post('/message', { message: m }, 'Message sent');
    },
    credits: async () => {
      const v = await ask({ title: 'Give AI credits', body: `They have ${u.credits.left} left (${u.credits.monthly} free this month + ${u.credits.bonus} bonus). Use a negative number to take some away.`, confirm: 'Update credits', input: { label: 'Bonus credits to add', type: 'number', initial: '5', required: true } });
      if (v && Number.isInteger(+v)) post('/credits', { bonus: +v }, 'Credits updated');
    },
    resetMonth: () => post('/credits', { resetMonthly: true }, 'This month’s free credits are back'),
    role: async () => {
      const toAdmin = u.role !== 'admin';
      if ((await ask({ title: toAdmin ? `Make ${u.name} an admin?` : `Remove admin rights from ${u.name}?`, body: toAdmin ? 'Admins can see and change everything on Split-Up, including other admins.' : undefined, confirm: toAdmin ? 'Make admin' : 'Remove admin', danger: !toAdmin })) !== null)
        act(() => api(`/admin/users/${u.id}`, { role: toAdmin ? 'admin' : 'user' }, 'PATCH'), 'Role updated');
    },
    logout: async () => {
      if ((await ask({ title: 'Sign out everywhere?', body: `Ends all ${q.data!.sessions.length} sessions on their phones and browsers.`, confirm: 'Sign out', danger: true })) !== null)
        post('/logout', {}, 'Signed out everywhere');
    },
    password: async () => {
      const pw = await ask({ title: `Set a password for ${u.name}`, body: 'They’ll be signed out everywhere and can log in with this password.', confirm: 'Set password', input: { label: 'New password (8+ characters)', type: 'text', required: true } });
      if (pw) post('/password', { password: pw }, 'Password set');
    },
    suspend: async () => {
      if (u.suspendedAt) return post('/unsuspend', {}, `${u.name} can use Split-Up again`);
      const reason = await ask({ title: `Suspend ${u.name}?`, body: 'They’re signed out right away and can’t log back in until you lift it. Their expenses stay so friends’ balances still add up.', confirm: 'Suspend', danger: true, input: { label: 'Reason (only admins see this)', placeholder: 'e.g. spam, abuse report #12' } });
      if (reason !== null) post('/suspend', { reason }, 'Suspended');
    },
    anonymize: async () => {
      if ((await ask({ title: `Anonymize ${u.name}?`, body: 'Removes their name, email, phone, payment details and login. They become “Deleted user”; their share of expenses stays so balances don’t break. This can’t be undone.', confirm: 'Anonymize', danger: true, typeToConfirm: 'ANONYMIZE' })) !== null)
        post('/anonymize', {}, 'Anonymized');
    },
    remove: async () => {
      if ((await ask({ title: `Delete ${u.name} permanently?`, body: 'Only possible for accounts that aren’t part of any expense, payment or group. This can’t be undone.', confirm: 'Delete forever', danger: true, typeToConfirm: 'DELETE' })) === null) return;
      if (await act(() => api(`/admin/users/${u.id}`, undefined, 'DELETE'), 'Deleted')) nav('/admin/users');
    },
  };

  return (
    <div className="space-y-5">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={15} /> Users</Link>
      <Head
        title={<span className="flex flex-wrap items-center gap-3"><Avatar id={u.id} name={u.name} size={48} /> {u.name} <UserBadges u={u} /></span>}
        sub={<>
          {[u.email, u.username && `@${u.username}`, u.phone].filter(Boolean).join(' · ') || 'No contact details'}
          <br />Joined {when(u.joinedAt ?? u.createdAt)} · last seen {u.online ? 'now' : ago(u.lastSeenAt)}
          {u.suspendedAt && <span className="block font-semibold text-owe">Suspended {ago(u.suspendedAt)}{u.suspendReason ? `: ${u.suspendReason}` : ''}</span>}
        </>}
      />

      <div className="flex flex-wrap gap-2">
        {u.registered && !u.suspendedAt && <Button size="sm" variant="marigold" onClick={actions.viewAs}><Eye size={15} /> View as</Button>}
        {u.registered && <Button size="sm" variant="soft" onClick={actions.message}><MessageSquare size={15} /> Message</Button>}
        <Button size="sm" variant="soft" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button>
        {u.registered && <Button size="sm" variant="soft" onClick={actions.credits}><Sparkles size={15} /> Credits</Button>}
        {u.registered && <Button size="sm" variant="soft" onClick={actions.role}>{u.role === 'admin' ? <><ShieldOff size={15} /> Remove admin</> : <><ShieldCheck size={15} /> Make admin</>}</Button>}
        <Button size="sm" variant="soft" onClick={actions.password}><KeyRound size={15} /> Set password</Button>
        {!!q.data.sessions.length && <Button size="sm" variant="soft" onClick={actions.logout}><LogOut size={15} /> Sign out everywhere</Button>}
        <Button size="sm" variant="danger" onClick={actions.suspend}>{u.suspendedAt ? <><CheckCircle2 size={15} /> Lift suspension</> : <><Ban size={15} /> Suspend</>}</Button>
        <Button size="sm" variant="danger" onClick={actions.anonymize}><UserX size={15} /> Anonymize</Button>
        <Button size="sm" variant="danger" onClick={actions.remove}><Trash2 size={15} /> Delete</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Others owe them', rs(balance.owed), 'text-owed'], ['They owe', rs(balance.owe), 'text-owe'],
          ['Paid for others', rsShort(counts.paid), ''], ['Their share', rsShort(counts.share), ''],
        ].map(([l, v, c]) => <div key={l} className="rounded-3xl border border-line bg-surface p-4"><p className="text-sm text-muted">{l}</p><p className={cx('mt-1 font-display text-xl font-bold', c)}>{v}</p></div>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4 min-w-0">
          <Panel title="Activity" sub="Days they used Split-Up"><ActivityCalendar days={q.data.activeDays} /></Panel>
          <Panel title={`Expenses (${num(counts.created)} created)`} sub="Latest 25 they're part of" pad={false}>
            <ExpenseTable list={q.data.expenses} who={who} groups={q.data.groupNames} me={u.id} />
          </Panel>
          <Panel title="Payments" pad={false}>
            <SettlementTable list={q.data.settlements} who={who} />
          </Panel>
          <Panel title="Timeline" sub="Everything they did, newest first" pad={false}>
            <FeedList items={q.data.history} who={who} groups={q.data.groupNames} dense />
          </Panel>
        </div>
        <div className="space-y-4 min-w-0">
          <Panel title="Account">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Sign-in</dt><dd>{[u.google && 'Google', u.hasPassword && 'password', u.email && 'email code', u.username && 'username'].filter(Boolean).join(', ') || '—'}</dd>
              <dt className="text-muted">Language</dt><dd>{u.locale === 'ne' ? 'नेपाली' : 'English'} · {u.calendar.toUpperCase()}</dd>
              <dt className="text-muted">eSewa / Khalti</dt><dd>{u.esewaId ?? '—'} / {u.khaltiId ?? '—'}{u.hasQr && ' · QR'}</dd>
              <dt className="text-muted">Friend code</dt><dd className="font-mono">{u.friendCode ?? '—'}</dd>
              <dt className="text-muted">Friends</dt><dd>{q.data.friendIds.length}</dd>
              <dt className="text-muted">Invited by</dt><dd>{u.referredBy ? <Link className="font-semibold hover:underline" to={`/admin/users/${u.referredBy}`}>{who[u.referredBy]?.name ?? 'someone'}</Link> : '—'}</dd>
              <dt className="text-muted">Invited</dt><dd>{q.data.referrals.length ? q.data.referrals.map((r, i) => <span key={r.id}>{i ? ', ' : ''}<Link className="font-semibold hover:underline" to={`/admin/users/${r.id}`}>{r.name}</Link></span>) : '—'}</dd>
              {u.createdBy && <><dt className="text-muted">Added by</dt><dd><Link className="font-semibold hover:underline" to={`/admin/users/${u.createdBy}`}>{who[u.createdBy]?.name ?? 'someone'}</Link></dd></>}
              <dt className="text-muted">Notifications</dt><dd>{num(counts.notifications)}</dd>
              <dt className="text-muted">ID</dt><dd className="truncate font-mono text-xs">{u.id}</dd>
            </dl>
          </Panel>
          {u.registered && (
            <Panel title="AI credits" right={<Button size="sm" variant="ghost" onClick={actions.resetMonth}>Reset month</Button>}>
              <p className="font-display text-3xl font-bold">{u.credits.left} <span className="text-base font-normal text-muted">left</span></p>
              <p className="text-sm text-muted">{u.credits.monthly} of {u.credits.perMonth} free this month · {u.credits.bonus} bonus · renews {u.credits.renewsOn}</p>
              {!!q.data.aiSessions.length && (
                <ul className="mt-3 space-y-1 text-sm">
                  {q.data.aiSessions.map((s) => <li key={s.id} className="flex justify-between gap-2"><span className="text-muted">{ago(s.createdAt)}</span><span>{s.turns} turn{s.turns === 1 ? '' : 's'} · {s.bucket}</span></li>)}
                </ul>
              )}
            </Panel>
          )}
          <Panel title="Groups" pad={false}>
            {!q.data.groups.length ? <p className="px-5 pb-5 text-sm text-muted">Not in any group</p> : (
              <ul className="divide-y divide-line">
                {q.data.groups.map((g) => (
                  <li key={g.id}><Link to={`/admin/groups/${g.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-surface-2">
                    <span className="truncate font-semibold">{g.name}</span><span className="shrink-0 text-xs text-muted">{g.members} members{g.createdBy === u.id ? ' · owner' : ''}</span>
                  </Link></li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Signed-in devices" pad={false}>
            {!q.data.sessions.length ? <p className="px-5 pb-5 text-sm text-muted">Not signed in anywhere</p> : (
              <ul className="divide-y divide-line">
                {q.data.sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.impersonatorId ? `Viewed by ${who[s.impersonatorId]?.name ?? 'an admin'}` : device(s.userAgent)}</span>
                      <span className="block truncate text-xs text-muted">{s.method ?? 'sign-in'} · {ago(s.createdAt)}{s.ip ? ` · ${s.ip}` : ''}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => post('/logout', { session: s.id }, 'Session ended')}>End</Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
      {editing && <EditUser u={u} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditUser({ u, onClose }: { u: AdminUser; onClose: () => void }) {
  const [f, setF] = useState({ name: u.name, email: u.email ?? '', username: u.username ?? '', phone: u.phone ?? '', esewaId: u.esewaId ?? '', khaltiId: u.khaltiId ?? '', locale: u.locale, calendar: u.calendar });
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const n = (s: string) => s.trim() || null;
    const ok = await act(() => api(`/admin/users/${u.id}`, {
      name: f.name, email: n(f.email), username: n(f.username), phone: n(f.phone), esewaId: n(f.esewaId), khaltiId: n(f.khaltiId), locale: f.locale, calendar: f.calendar,
    }, 'PATCH'), 'Saved');
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${u.name}`}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><Input required maxLength={60} {...field('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" hint="Changing it moves their sign-in to the new address"><Input type="email" {...field('email')} /></Field>
          <Field label="Username"><Input {...field('username')} placeholder="optional" /></Field>
          <Field label="Phone"><Input {...field('phone')} /></Field>
          <Field label="eSewa ID"><Input {...field('esewaId')} /></Field>
          <Field label="Khalti ID"><Input {...field('khaltiId')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Segmented value={f.locale} onChange={(v) => setF({ ...f, locale: v })} options={[{ value: 'en', label: 'English' }, { value: 'ne', label: 'नेपाली' }]} />
          <Segmented value={f.calendar} onChange={(v) => setF({ ...f, calendar: v })} options={[{ value: 'ad', label: 'A.D.' }, { value: 'bs', label: 'B.S.' }]} />
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

export function ExpenseTable({ list, who, groups, me }: { list: Expense[]; who: Who; groups: Record<string, string>; me?: string }) {
  if (!list.length) return <p className="px-5 pb-5 text-sm text-muted">No expenses</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr><th className={th}>Expense</th><th className={th}>Where</th><th className={th}>Paid by</th><th className={th}>Date</th><th className={cx(th, 'text-right')}>Amount</th></tr></thead>
        <tbody>{list.map((e) => {
          const net = me ? e.payers.filter((p) => p.userId === me).reduce((a, p) => a + p.amount, 0) - e.shares.filter((p) => p.userId === me).reduce((a, p) => a + p.amount, 0) : 0;
          return (
            <tr key={e.id} onClick={() => openExpenseDrawer(e.id)} className={cx('cursor-pointer border-t border-line transition hover:bg-surface-2', e.deletedAt && 'opacity-50')}>
              <td className={td}><span className="mr-1.5">{CATEGORIES[e.category as Category]}</span><span className={cx('font-semibold', e.deletedAt && 'line-through')}>{e.description}</span></td>
              <td className={cx(td, 'text-muted')}>{e.groupId ? groups[e.groupId] ?? 'group' : 'Friends'}</td>
              <td className={cx(td, 'whitespace-nowrap')}>{e.payers.map((p) => who[p.userId]?.name.split(' ')[0] ?? '?').join(', ')}</td>
              <td className={cx(td, 'whitespace-nowrap text-muted')}>{e.date}</td>
              <td className={cx(td, 'whitespace-nowrap text-right tabular-nums')}><b>{rs(e.amount)}</b>{me && net !== 0 && <span className={cx('block text-xs', net > 0 ? 'text-owed' : 'text-owe')}>{net > 0 ? 'lent ' : 'owes '}{rs(Math.abs(net))}</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

export function SettlementTable({ list, who, onChange }: { list: Settlement[]; who: Who; onChange?: boolean }) {
  if (!list.length) return <p className="px-5 pb-5 text-sm text-muted">No payments</p>;
  const toggle = (s: Settlement) => act(() => api(`/admin/settlements/${s.id}${s.deletedAt ? '/restore' : ''}`, s.deletedAt ? {} : undefined, s.deletedAt ? 'POST' : 'DELETE'), s.deletedAt ? 'Restored' : 'Deleted');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr><th className={th}>From → To</th><th className={th}>Method</th><th className={th}>Date</th><th className={cx(th, 'text-right')}>Amount</th>{onChange && <th className={th} />}</tr></thead>
        <tbody>{list.map((s) => (
          <tr key={s.id} className={cx('border-t border-line', s.deletedAt && 'opacity-50')}>
            <td className={td}>
              <Link className="font-semibold hover:underline" to={`/admin/users/${s.fromUser}`}>{who[s.fromUser]?.name ?? '?'}</Link> → <Link className="font-semibold hover:underline" to={`/admin/users/${s.toUser}`}>{who[s.toUser]?.name ?? '?'}</Link>
              {s.confirmedAt && <CheckCircle2 size={13} className="ml-1 inline text-owed" aria-label="confirmed" />}
              {s.deletedAt && <Badge tone="bad">deleted</Badge>}
            </td>
            <td className={cx(td, 'capitalize')}>{s.method}</td>
            <td className={cx(td, 'whitespace-nowrap text-muted')}>{s.date}</td>
            <td className={cx(td, 'whitespace-nowrap text-right font-semibold tabular-nums')}>{rs(s.amount)}</td>
            {onChange && <td className={cx(td, 'text-right')}><Button size="sm" variant={s.deletedAt ? 'soft' : 'ghost'} onClick={() => toggle(s)}>{s.deletedAt ? 'Restore' : 'Delete'}</Button></td>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export const copy = (s: string) => navigator.clipboard.writeText(s).then(() => toast('Copied'));

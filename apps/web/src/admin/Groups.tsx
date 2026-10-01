import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Pencil, Trash2, UserMinus, UserPlus } from 'lucide-react';
import type { Debt } from '@splitup/shared';
import { api } from '../api';
import { Avatar, Button, Field, Input, Modal, Segmented, Spinner, Toggle, cx } from '../ui';
import { Badge, Head, Pager, Panel, Person, Search, act, ago, ask, num, rs, rsShort, td, th, useAdmin, when, type Expense, type Settlement, type Who } from './kit';
import { ExpenseTable, SettlementTable } from './Users';

type G = { id: string; name: string; type: string; simplify: boolean; inviteCode: string; createdBy: string; createdAt: string };
type List = { total: number; page: number; pageSize: number; groups: (G & { members: number; expenses: number; volume: number; lastAt: string | null })[]; people: Who };
const TYPES = ['trip', 'home', 'couple', 'food', 'office', 'other'] as const;

export function Groups() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '', sort = sp.get('sort') ?? 'recent', page = Number(sp.get('page') ?? 0);
  const set = (k: string, v: string) => setSp((p) => { p.set(k, v); if (k !== 'page') p.delete('page'); return p; }, { replace: true });
  const list = useAdmin<List>(`/groups?q=${encodeURIComponent(q)}&sort=${sort}&page=${page}`);
  const nav = useNavigate();
  return (
    <div className="space-y-5">
      <Head title="Groups" sub={list.data ? `${num(list.data.total)} groups` : undefined}
        right={<a href="/api/admin/export/groups" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-semibold hover:bg-line"><Download size={14} /> Export CSV</a>} />
      <div className="flex flex-wrap items-center gap-3">
        <Search value={q} onChange={(v) => set('q', v)} placeholder="Search groups…" />
        <select value={sort} onChange={(e) => set('sort', e.target.value)} className="h-10 rounded-full border border-line bg-surface px-3 text-sm font-semibold" aria-label="Sort">
          <option value="recent">Newest</option><option value="active">Recently active</option><option value="volume">Most money</option><option value="members">Most members</option>
        </select>
      </div>
      <Panel pad={false} className={cx(list.isPlaceholderData && 'refetching')}>
        {!list.data ? <Spinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Group</th><th className={th}>Created by</th><th className={cx(th, 'text-right')}>Members</th><th className={cx(th, 'text-right')}>Expenses</th><th className={cx(th, 'text-right')}>Split</th><th className={th}>Last expense</th></tr></thead>
                <tbody>{list.data.groups.map((g) => (
                  <tr key={g.id} onClick={() => nav(`/admin/groups/${g.id}`)} className="cursor-pointer border-t border-line transition hover:bg-surface-2">
                    <td className={td}><span className="font-semibold">{g.name}</span> <span className="text-xs text-muted">{g.type}</span></td>
                    <td className={td} onClick={(e) => e.stopPropagation()}><Person id={g.createdBy} who={list.data!.people} size={24} /></td>
                    <td className={cx(td, 'text-right tabular-nums')}>{g.members}</td><td className={cx(td, 'text-right tabular-nums')}>{g.expenses}</td>
                    <td className={cx(td, 'text-right font-semibold tabular-nums')}>{rsShort(g.volume)}</td>
                    <td className={cx(td, 'whitespace-nowrap text-muted')}>{ago(g.lastAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <Pager page={list.data.page} total={list.data.total} size={list.data.pageSize} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </Panel>
    </div>
  );
}

type Detail = { group: G & { memberIds: string[] }; expenses: Expense[]; settlements: Settlement[]; debts: Debt[]; people: Who; volume: number };

export function GroupDetail() {
  const id = useParams().id!;
  const q = useAdmin<Detail>(`/groups/${id}`);
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  if (q.error) return <p className="py-16 text-center text-muted">{q.error.message}</p>;
  if (!q.data) return <Spinner />;
  const { group: g, people: who, debts } = q.data;
  const bal = (uid: string) => debts.reduce((a, d) => a + (d.to === uid ? d.amount : d.from === uid ? -d.amount : 0), 0);
  const remove = async (uid: string) => {
    const owes = bal(uid);
    const r = await ask({
      title: `Remove ${who[uid]?.name} from ${g.name}?`, danger: true, confirm: 'Remove',
      body: owes ? `They still have a balance of ${rs(Math.abs(owes))} here. Removing them anyway leaves it on the books for the others.` : 'They’ll lose access to this group.',
    });
    if (r !== null) act(() => api(`/admin/groups/${g.id}/members/${uid}${owes ? '?force=1' : ''}`, undefined, 'DELETE'), 'Removed');
  };
  const del = async () => {
    if ((await ask({ title: `Delete ${g.name}?`, body: `Deletes the group with its ${q.data!.expenses.length} expenses and ${q.data!.settlements.length} payments for all ${g.memberIds.length} members. This can't be undone.`, confirm: 'Delete group', danger: true, typeToConfirm: g.name })) === null) return;
    if (await act(() => api(`/admin/groups/${g.id}`, undefined, 'DELETE'), 'Group deleted')) nav('/admin/groups');
  };
  return (
    <div className="space-y-5">
      <Link to="/admin/groups" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={15} /> Groups</Link>
      <Head title={g.name} sub={<>{g.type} · created {when(g.createdAt)} by <Link className="font-semibold hover:underline" to={`/admin/users/${g.createdBy}`}>{who[g.createdBy]?.name}</Link> · invite code <span className="font-mono">{g.inviteCode}</span>{g.simplify && ' · simplified debts'}</>}
        right={<>
          <Button size="sm" variant="soft" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button>
          <Button size="sm" variant="soft" onClick={() => setAdding(true)}><UserPlus size={15} /> Add member</Button>
          <Button size="sm" variant="danger" onClick={del}><Trash2 size={15} /> Delete</Button>
        </>} />
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-3xl border border-line bg-surface p-4"><p className="text-sm text-muted">Money split</p><p className="font-display text-xl font-bold">{rs(q.data.volume)}</p></div>
        <div className="rounded-3xl border border-line bg-surface p-4"><p className="text-sm text-muted">Still owed</p><p className="font-display text-xl font-bold">{rs(debts.reduce((a, d) => a + d.amount, 0))}</p></div>
        <div className="rounded-3xl border border-line bg-surface p-4"><p className="text-sm text-muted">Members</p><p className="font-display text-xl font-bold">{g.memberIds.length}</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Panel title="Members" pad={false}>
            <ul className="divide-y divide-line">
              {g.memberIds.map((m) => {
                const b = bal(m);
                return (
                  <li key={m} className="flex items-center gap-3 px-5 py-2.5">
                    <Person id={m} who={who} size={30} sub={m === g.createdBy ? 'owner' : who[m]?.registered === false ? 'not joined' : undefined} />
                    <span className={cx('ml-auto text-sm font-semibold tabular-nums', b > 0 ? 'text-owed' : b < 0 ? 'text-owe' : 'text-muted')}>{b ? `${b > 0 ? '+' : '−'}${rs(Math.abs(b))}` : 'settled'}</span>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)} aria-label={`Remove ${who[m]?.name}`}><UserMinus size={15} /></Button>
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title="Who owes whom">
            {!debts.length ? <p className="text-sm text-muted">Everyone is settled up 🎉</p> : (
              <ul className="space-y-2 text-sm">
                {debts.map((d, i) => <li key={i} className="flex justify-between gap-2"><span><b>{who[d.from]?.name}</b> → <b>{who[d.to]?.name}</b></span><b className="tabular-nums">{rs(d.amount)}</b></li>)}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-4 min-w-0">
          <Panel title={`Expenses (${q.data.expenses.length})`} sub="Including deleted ones, greyed out" pad={false}>
            <ExpenseTable list={q.data.expenses} who={who} groups={{ [g.id]: g.name }} />
          </Panel>
          <Panel title={`Payments (${q.data.settlements.length})`} pad={false}><SettlementTable list={q.data.settlements} who={who} onChange /></Panel>
        </div>
      </div>
      {editing && <EditGroup g={g} onClose={() => setEditing(false)} />}
      {adding && <AddMember g={g} onClose={() => setAdding(false)} />}
    </div>
  );
}

function EditGroup({ g, onClose }: { g: G; onClose: () => void }) {
  const [f, setF] = useState({ name: g.name, type: g.type as (typeof TYPES)[number], simplify: g.simplify });
  return (
    <Modal open onClose={onClose} title="Edit group">
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await act(() => api(`/admin/groups/${g.id}`, f, 'PATCH'), 'Saved')) onClose(); }}>
        <Field label="Name"><Input required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type"><Segmented value={f.type} onChange={(type) => setF({ ...f, type })} options={TYPES.map((t) => ({ value: t, label: t }))} /></Field>
        <Toggle checked={f.simplify} onChange={(simplify) => setF({ ...f, simplify })} label="Simplify debts" />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button>Save</Button></div>
      </form>
    </Modal>
  );
}

function AddMember({ g, onClose }: { g: G & { memberIds: string[] }; onClose: () => void }) {
  const [q, setQ] = useState('');
  const r = useAdmin<{ users: { id: string; name: string; email: string | null; registered: boolean }[] }>(`/search?q=${encodeURIComponent(q)}`, { enabled: q.trim().length >= 2 });
  return (
    <Modal open onClose={onClose} title={`Add to ${g.name}`}>
      <div className="space-y-3">
        <Input autoFocus placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-xs text-muted">They become friends with everyone in the group and get a notification.</p>
        <ul className="divide-y divide-line">
          {(q.trim().length >= 2 ? r.data?.users ?? [] : []).map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2">
              <Avatar id={u.id} name={u.name} size={30} />
              <span className="min-w-0 flex-1"><b className="block truncate">{u.name}</b><span className="block truncate text-xs text-muted">{u.email ?? 'no email'}</span></span>
              {!u.registered && <Badge>not joined</Badge>}
              {g.memberIds.includes(u.id) ? <Badge tone="good">member</Badge>
                : <Button size="sm" onClick={async () => { if (await act(() => api(`/admin/groups/${g.id}/members`, { userId: u.id }), `${u.name} added`)) onClose(); }}>Add</Button>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

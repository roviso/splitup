import { Link, useSearchParams } from 'react-router-dom';
import { Download, RotateCcw, Trash2 } from 'lucide-react';
import { CATEGORIES, type Category } from '@splitup/shared';
import { api } from '../api';
import { Button, Modal, Spinner, cx } from '../ui';
import { Badge, Head, Pager, Panel, Search, Tabs, act, ask, num, rs, rsShort, useAdmin, when, type Expense, type Settlement, type Who } from './kit';
import { ExpenseTable, SettlementTable } from './Users';
import { openExpenseDrawer, useExpenseDrawer } from './feed';

type ExpList = { total: number; volume: number; page: number; pageSize: number; expenses: Expense[]; people: Who; groups: Record<string, string> };
type SetList = { total: number; volume: number; page: number; pageSize: number; settlements: Settlement[]; people: Who; groups: Record<string, string> };

export default function Money() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'expenses';
  const set = (k: string, v: string) => setSp((p) => { p.set(k, v); if (k !== 'page') p.delete('page'); return p; }, { replace: true });
  const exportLink = (kind: string) => <a href={`/api/admin/export/${kind}`} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-semibold hover:bg-line"><Download size={14} /> Export {kind}</a>;
  return (
    <div className="space-y-5">
      <Head title="Money" sub="Every expense and payment on Split-Up" right={<>{exportLink('expenses')}{exportLink('settlements')}</>} />
      <Tabs value={tab} onChange={(v) => setSp({ tab: v }, { replace: true })} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'payments', label: 'Payments' }]} />
      {tab === 'expenses' ? <Expenses sp={sp} set={set} /> : <Payments sp={sp} set={set} />}
    </div>
  );
}

function Expenses({ sp, set }: { sp: URLSearchParams; set: (k: string, v: string) => void }) {
  const q = sp.get('q') ?? '', status = sp.get('status') ?? 'active', category = sp.get('category') ?? '', page = Number(sp.get('page') ?? 0);
  const list = useAdmin<ExpList>(`/expenses?q=${encodeURIComponent(q)}&status=${status}&category=${category}&page=${page}`);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Search value={q} onChange={(v) => set('q', v)} placeholder="Search descriptions…" />
        <Tabs value={status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'deleted', label: 'Deleted' }, { value: 'all', label: 'All' }]} />
        <select value={category} onChange={(e) => set('category', e.target.value)} className="h-10 rounded-full border border-line bg-surface px-3 text-sm font-semibold" aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(CATEGORIES).map(([k, e]) => <option key={k} value={k}>{e} {k}</option>)}
        </select>
        {list.data && <span className="text-sm text-muted">{num(list.data.total)} expenses · {rsShort(list.data.volume)}</span>}
      </div>
      <Panel pad={false} className={cx(list.isPlaceholderData && 'refetching')}>
        {!list.data ? <Spinner /> : (
          <>
            <ExpenseTable list={list.data.expenses} who={list.data.people} groups={list.data.groups} />
            <Pager page={list.data.page} total={list.data.total} size={list.data.pageSize} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </Panel>
    </>
  );
}

function Payments({ sp, set }: { sp: URLSearchParams; set: (k: string, v: string) => void }) {
  const status = sp.get('status') ?? 'active', method = sp.get('method') ?? '', page = Number(sp.get('page') ?? 0);
  const list = useAdmin<SetList>(`/settlements?status=${status}&method=${method}&page=${page}`);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Active' }, { value: 'deleted', label: 'Deleted' }, { value: 'all', label: 'All' }]} />
        <select value={method} onChange={(e) => set('method', e.target.value)} className="h-10 rounded-full border border-line bg-surface px-3 text-sm font-semibold" aria-label="Method">
          <option value="">All methods</option>
          {['cash', 'esewa', 'khalti', 'fonepay', 'bank', 'other'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {list.data && <span className="text-sm text-muted">{num(list.data.total)} payments · {rsShort(list.data.volume)}</span>}
      </div>
      <Panel pad={false} className={cx(list.isPlaceholderData && 'refetching')}>
        {!list.data ? <Spinner /> : (
          <>
            <SettlementTable list={list.data.settlements} who={list.data.people} onChange />
            <Pager page={list.data.page} total={list.data.total} size={list.data.pageSize} onPage={(p) => set('page', String(p))} />
          </>
        )}
      </Panel>
    </>
  );
}

/** Any expense, opened from anywhere in the console. */
export function ExpenseDrawer() {
  const id = useExpenseDrawer();
  const q = useAdmin<{ expense: Expense; people: Who; groups: Record<string, string> }>(`/expenses/${id}`, { enabled: !!id });
  const e = id && q.data?.expense.id === id ? q.data.expense : null;
  const who = q.data?.people ?? {};
  const close = () => openExpenseDrawer(null);
  const remove = async (hard: boolean) => {
    if (!e) return;
    const ok = await ask(hard
      ? { title: 'Delete permanently?', body: 'The expense and its split are erased for everyone. Balances change. This can’t be undone.', confirm: 'Erase forever', danger: true, typeToConfirm: 'ERASE' }
      : { title: `Delete “${e.description}”?`, body: 'Everyone in it sees it as deleted and balances change. You can restore it later.', confirm: 'Delete', danger: true });
    if (ok === null) return;
    if (await act(() => api(`/admin/expenses/${e.id}${hard ? '?hard=1' : ''}`, undefined, 'DELETE'), hard ? 'Erased' : 'Deleted') && hard) close();
  };
  // meta.items is ExpenseForm's raw input: prices are rupee strings.
  const items = (e?.meta?.items ?? []) as { name: string; price: string; userIds?: string[] }[];
  return (
    <Modal open={!!id} onClose={close} title={e ? <span>{CATEGORIES[e.category as Category]} {e.description}</span> : 'Expense'} wide>
      {!e ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-4xl font-semibold tracking-tight">{rs(e.amount)}</p>
              <p className="mt-1 text-sm text-muted">
                {e.date} · {e.splitType} · {e.groupId ? <Link onClick={close} className="font-semibold hover:underline" to={`/admin/groups/${e.groupId}`}>{q.data!.groups[e.groupId] ?? 'group'}</Link> : 'between friends'}
              </p>
              <p className="text-xs text-muted">Added by {who[e.createdBy]?.name ?? '?'} on {when(e.createdAt)}{e.updatedAt && ` · edited ${when(e.updatedAt)}`}</p>
            </div>
            {e.deletedAt && <Badge tone="bad">deleted {when(e.deletedAt)}</Badge>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {([['Paid', e.payers], ['Owes', e.shares]] as const).map(([label, ps]) => (
              <div key={label} className="rounded-2xl bg-surface-2 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
                <ul className="space-y-1 text-sm">
                  {ps.map((p) => <li key={p.userId} className="flex justify-between gap-2"><Link onClick={close} to={`/admin/users/${p.userId}`} className="truncate hover:underline">{who[p.userId]?.name ?? '?'}</Link><b className="tabular-nums">{rs(p.amount)}</b></li>)}
                </ul>
              </div>
            ))}
          </div>
          {!!items.length && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Items{e.meta?.sc ? ` · ${e.meta.sc}% service` : ''}{e.meta?.vat ? ` · ${e.meta.vat}% VAT` : ''}</p>
              <ul className="divide-y divide-line rounded-2xl border border-line text-sm">
                {items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-3 px-4 py-2">
                    <span className="min-w-0"><span className="block truncate">{it.name}</span>{it.userIds && <span className="block truncate text-xs text-muted">{it.userIds.map((u) => who[u]?.name.split(' ')[0] ?? '?').join(', ')}</span>}</span>
                    <span className="shrink-0 tabular-nums">{rs(Math.round((parseFloat(it.price) || 0) * 100))}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {e.notes && <p className="rounded-2xl bg-surface-2 p-4 text-sm">{e.notes}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {e.deletedAt
              ? <Button variant="soft" onClick={() => act(() => api(`/admin/expenses/${e.id}/restore`, {}), 'Restored')}><RotateCcw size={15} /> Restore</Button>
              : <Button variant="danger" onClick={() => remove(false)}><Trash2 size={15} /> Delete</Button>}
            <Button variant="danger" onClick={() => remove(true)}>Erase forever</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

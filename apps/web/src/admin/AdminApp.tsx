import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowLeft, Bot, Gauge, LineChart, Menu, Radio, Receipt, ScrollText, Search as SearchIcon, Server, SlidersHorizontal, UserRound, Users as UsersIcon, X,
} from 'lucide-react';
import { useMe } from '../store';
import { Avatar, Modal, cx } from '../ui';
import { AskHost, Badge, rs, useAdmin } from './kit';
import { Insights, Overview } from './Dashboard';
import Live from './Live';
import { UserDetail, Users } from './Users';
import { GroupDetail, Groups } from './Groups';
import Money, { ExpenseDrawer } from './Money';
import { Ai, Audit, Controls, System } from './Platform';
import { openExpenseDrawer } from './feed';

const NAV = [
  { to: '/admin', label: 'Overview', icon: Gauge, end: true },
  { to: '/admin/live', label: 'Live', icon: Radio },
  { to: '/admin/insights', label: 'Insights', icon: LineChart },
  { to: '/admin/users', label: 'Users', icon: UserRound },
  { to: '/admin/groups', label: 'Groups', icon: UsersIcon },
  { to: '/admin/money', label: 'Money', icon: Receipt },
  { to: '/admin/ai', label: 'AI & credits', icon: Bot },
  { to: '/admin/controls', label: 'Platform controls', icon: SlidersHorizontal },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { to: '/admin/system', label: 'System', icon: Server },
];

export default function AdminApp() {
  const me = useMe();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  useEffect(() => { document.title = 'Split-Up Admin'; return () => { document.title = 'Split-Up — split bills with friends'; }; }, []);
  const link = ({ isActive }: { isActive: boolean }) =>
    cx('flex items-center gap-3 rounded-2xl px-3.5 h-10 text-sm font-semibold transition', isActive ? 'bg-ink text-on-ink' : 'text-muted hover:bg-surface-2 hover:text-ink');

  const side = (
    <div className="flex h-full flex-col gap-6 p-5">
      <Link to="/admin" className="flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight" onClick={() => setMenu(false)}>
        <img src="/icon.svg" alt="" className="size-8" />
        <span>Split<span className="text-marigold">-</span>Up</span>
        <Badge tone="ink">admin</Badge>
      </Link>
      <button onClick={() => { setPalette(true); setMenu(false); }} className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm text-muted hover:text-ink cursor-pointer">
        <SearchIcon size={15} /> Search everything <kbd className="ml-auto rounded bg-surface-2 px-1.5 text-[11px]">⌘K</kbd>
      </button>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link} onClick={() => setMenu(false)}><n.icon size={17} /> {n.label}</NavLink>)}
      </nav>
      <div className="mt-auto space-y-2">
        <Link to="/" className="flex items-center gap-2 rounded-2xl px-3.5 h-10 text-sm font-semibold text-muted hover:bg-surface-2 hover:text-ink"><ArrowLeft size={16} /> Back to the app</Link>
        <div className="flex items-center gap-3 rounded-2xl p-2">
          <Avatar id={me.id} name={me.name} size={32} />
          <span className="min-w-0 text-sm"><b className="block truncate">{me.name}</b><span className="block truncate text-xs text-muted">{me.email ?? `@${me.username}`}</span></span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="md:flex">
      <aside className="hidden md:block sticky top-0 h-dvh w-64 shrink-0 border-r border-line bg-surface/60 backdrop-blur">
        <div className="dhaka" />
        {side}
      </aside>
      {/* mobile */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-2 backdrop-blur md:hidden">
        <button onClick={() => setMenu(true)} className="grid size-10 place-items-center rounded-full hover:bg-surface-2 cursor-pointer" aria-label="Menu"><Menu size={20} /></button>
        <span className="font-display font-extrabold">Split-Up <Badge tone="ink">admin</Badge></span>
        <button onClick={() => setPalette(true)} className="grid size-10 place-items-center rounded-full hover:bg-surface-2 cursor-pointer" aria-label="Search"><SearchIcon size={19} /></button>
      </div>
      {menu && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setMenu(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-bg" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setMenu(false)} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full hover:bg-surface-2 cursor-pointer" aria-label="Close"><X size={18} /></button>
            {side}
          </div>
        </div>
      )}

      <main className="mx-auto w-full min-w-0 max-w-[1400px] px-4 pb-16 pt-6 md:px-8 md:pt-8">
        <Routes>
          <Route path="/admin" element={<Overview />} />
          <Route path="/admin/live" element={<Live />} />
          <Route path="/admin/insights" element={<Insights />} />
          <Route path="/admin/users" element={<Users />} />
          <Route path="/admin/users/:id" element={<UserDetail />} />
          <Route path="/admin/groups" element={<Groups />} />
          <Route path="/admin/groups/:id" element={<GroupDetail />} />
          <Route path="/admin/money" element={<Money />} />
          <Route path="/admin/ai" element={<Ai />} />
          <Route path="/admin/controls" element={<Controls />} />
          <Route path="/admin/audit" element={<Audit />} />
          <Route path="/admin/system" element={<System />} />
          <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
      <ExpenseDrawer />
      <AskHost />
      <Palette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

type Hits = {
  users: { id: string; name: string; email: string | null; username: string | null; registered: boolean; role: string }[];
  groups: { id: string; name: string; type: string }[];
  expenses: { id: string; description: string; amount: number; deletedAt: string | null }[];
};
/** ⌘K: jump to any page, person, group or expense. */
function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const r = useAdmin<Hits>(`/search?q=${encodeURIComponent(q.trim())}`, { enabled: open && q.trim().length >= 2 });
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  const pages = NAV.filter((n) => !q.trim() || n.label.toLowerCase().includes(q.trim().toLowerCase()));
  const hits = q.trim().length >= 2 ? r.data : undefined;
  const items: { key: string; icon: React.ReactNode; label: string; sub?: string; go: () => void }[] = [
    ...pages.map((n) => ({ key: n.to, icon: <n.icon size={16} />, label: n.label, sub: 'Page', go: () => nav(n.to) })),
    ...(hits?.users ?? []).map((u) => ({ key: u.id, icon: <Avatar id={u.id} name={u.name} size={22} />, label: u.name, sub: [u.email ?? (u.username && `@${u.username}`), !u.registered && 'not joined', u.role === 'admin' && 'admin'].filter(Boolean).join(' · ') || 'Person', go: () => nav(`/admin/users/${u.id}`) })),
    ...(hits?.groups ?? []).map((g) => ({ key: g.id, icon: <UsersIcon size={16} />, label: g.name, sub: `Group · ${g.type}`, go: () => nav(`/admin/groups/${g.id}`) })),
    ...(hits?.expenses ?? []).map((e) => ({ key: e.id, icon: <Activity size={16} />, label: e.description, sub: `Expense · ${rs(e.amount)}${e.deletedAt ? ' · deleted' : ''}`, go: () => openExpenseDrawer(e.id) })),
  ];
  const pick = (i: number) => { items[i]?.go(); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title="Search">
      <div className="-mt-1 space-y-3">
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder="People, groups, expenses, pages… (name, email, friend code or ID)"
          className="h-12 w-full rounded-2xl border border-line bg-surface px-4 outline-none focus:border-ink"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); pick(sel); }
          }} />
        <ul className="max-h-[50dvh] overflow-y-auto" role="listbox">
          {items.map((it, i) => (
            <li key={it.key} role="option" aria-selected={i === sel}>
              <button onClick={() => pick(i)} onPointerMove={() => setSel(i)}
                className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left cursor-pointer', i === sel && 'bg-surface-2')}>
                <span className="grid size-7 shrink-0 place-items-center text-muted">{it.icon}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{it.label}</span>{it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}</span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && r.isFetching && !hits && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {q.trim().length >= 2 && hits && items.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
        </ul>
      </div>
    </Modal>
  );
}

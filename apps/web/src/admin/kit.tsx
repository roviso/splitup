import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Expense, Settlement } from '../api';
import { api, refresh } from '../api';
import { money } from '../i18n';
import { Avatar, Button, Field, Input, Modal, createStore, cx, toast, toastError } from '../ui';
import { Sparkline } from './charts';

// ---------- data ----------
/** Admin GET, keyed by path. Keeps the previous result while a new period/filter loads (no layout jump). */
export function useAdmin<T>(path: string, opts: { refetchInterval?: number | false; enabled?: boolean } = {}) {
  return useQuery({ queryKey: ['admin', path], queryFn: () => api<T>('/admin' + path), placeholderData: keepPreviousData, ...opts });
}
/** Run an admin write, toast the result, refetch everything. */
export async function act<T>(f: () => Promise<T>, done?: string): Promise<T | undefined> {
  try {
    const r = await f();
    if (done) toast(done);
    await refresh();
    return r;
  } catch (e) { toastError(e); }
}

export type Period = { start: string; end: string; days: number; prevStart: string; prevEnd: string };
export type Who = Record<string, { name: string; email: string | null; registered: boolean; role: string }>;
export type FeedItem = { cat: string; kind: string; at: string; actor: string | null; target: string | null; data: Record<string, any> };
export type Feed = { items: FeedItem[]; people: Who; groups: Record<string, string>; online?: { id: string; name: string }[]; streams?: number };
export type AdminUser = {
  id: string; name: string; email: string | null; username: string | null; phone: string | null; registered: boolean; role: 'user' | 'admin';
  locale: string; calendar: string; esewaId: string | null; khaltiId: string | null; friendCode: string | null; inviteToken: string | null;
  createdBy: string | null; createdAt: string; joinedAt: string | null; lastSeenAt: string | null; suspendedAt: string | null; suspendReason: string | null;
  referredBy: string | null; aiUsed: number; aiPeriod: string | null; aiBonus: number;
  hasPassword: boolean; google: boolean; hasQr: boolean; online?: boolean;
  credits: { left: number; monthly: number; bonus: number; perMonth: number; renewsOn: string };
};
export type { Expense, Settlement };

// ---------- period ----------
const PERIODS = [{ v: 7, l: '7 days' }, { v: 30, l: '30 days' }, { v: 90, l: '90 days' }, { v: 365, l: '12 months' }, { v: 0, l: 'All time' }];
const saved = () => { try { return Number(localStorage.getItem('admin-days') ?? 30); } catch { return 30; } };
export const [usePeriodDays, setPeriodDays] = createStore<number>(saved());
export function PeriodPicker() {
  const days = usePeriodDays();
  return (
    <div className="flex flex-wrap gap-1 rounded-full bg-surface-2 p-1" role="tablist" aria-label="Date range">
      {PERIODS.map((p) => (
        <button key={p.v} role="tab" aria-selected={days === p.v}
          onClick={() => { setPeriodDays(p.v); try { localStorage.setItem('admin-days', String(p.v)); } catch { /* */ } }}
          className={cx('h-8 rounded-full px-3 text-sm font-semibold transition cursor-pointer', days === p.v ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>
          {p.l}
        </button>
      ))}
    </div>
  );
}

// ---------- numbers ----------
const n0 = new Intl.NumberFormat('en-IN');
export const num = (n: number) => n0.format(n);
/** 1,284 / 12.9K / 4.2M */
export const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
/** Paisa → "Rs 4.2 L" / "Rs 1.3 Cr": lakh and crore, the way Nepal reads big money. */
export function rsShort(paisa: number) {
  const r = paisa / 100, a = Math.abs(r);
  const f = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toLocaleString('en-IN');
  if (a >= 1e7) return `Rs ${f(r / 1e7)} Cr`;
  if (a >= 1e5) return `Rs ${f(r / 1e5)} L`;
  if (a >= 1e3) return `Rs ${f(r / 1e3)}K`;
  return `Rs ${Math.round(r)}`;
}
export const rs = (paisa: number) => money(paisa, 'en');
export const pctChange = (cur: number, prev: number) => (prev ? ((cur - prev) / prev) * 100 : cur ? Infinity : 0);
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const dayLabel = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export function ago(iso: string | null) {
  if (!iso) return 'never';
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
/** Browser + OS from a user agent, short. */
export function device(ua: string | null) {
  if (!ua) return 'Unknown device';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : /curl|node|okhttp/i.test(ua) ? 'API client' : 'Browser';
  return os ? `${br} on ${os}` : br;
}

// ---------- layout ----------
export function Panel({ title, sub, right, children, className, pad = true }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx('min-w-0 rounded-3xl border border-line bg-surface', className)}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-base font-bold">{title}</h2>}
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? 'p-5 pt-3' : 'pt-3'}>{children}</div>
    </section>
  );
}
export function Head({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}
/** Change vs the previous period; `upIsGood` picks the colour. Infinity = from zero. */
export function Delta({ cur, prev, upIsGood = true, short }: { cur: number; prev: number; upIsGood?: boolean; short?: boolean }) {
  const d = pctChange(cur, prev);
  if (!d || !isFinite(d) && !cur) return <span className="text-xs text-muted">no change</span>;
  const up = d > 0, good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-semibold', good ? 'text-owed' : 'text-owe')}>
      <Icon size={14} />{isFinite(d) ? `${Math.abs(d) >= 100 ? Math.round(Math.abs(d)) : Math.abs(d).toFixed(1)}%` : 'new'}
      {!short && <span className="ml-1 font-normal text-muted">vs prev.</span>}
    </span>
  );
}
export function Stat({ label, value, cur, prev, spark, upIsGood, hint, to }: {
  label: string; value: ReactNode; cur?: number; prev?: number; spark?: number[]; upIsGood?: boolean; hint?: ReactNode; to?: string;
}) {
  const body = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span>{cur !== undefined && prev !== undefined ? <Delta cur={cur} prev={prev} upIsGood={upIsGood} short /> : hint && <span className="text-xs text-muted">{hint}</span>}</span>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
    </>
  );
  const cls = 'block min-w-0 rounded-3xl border border-line bg-surface p-4';
  return to ? <Link to={to} className={cx(cls, 'transition hover:border-ink/30')}>{body}</Link> : <div className={cls}>{body}</div>;
}
export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'good' | 'bad' | 'warn' | 'ink' }) {
  return (
    <span className={cx('inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-bold uppercase tracking-wide',
      tone === 'good' && 'bg-owed-soft text-owed', tone === 'bad' && 'bg-owe-soft text-owe', tone === 'warn' && 'bg-marigold-soft text-ink',
      tone === 'ink' && 'bg-ink text-on-ink', tone === 'muted' && 'bg-surface-2 text-muted')}>{children}</span>
  );
}
export function Person({ id, who, size = 28, sub }: { id: string | null | undefined; who: Who; size?: number; sub?: ReactNode }) {
  if (!id) return <span className="text-muted">—</span>;
  const p = who[id];
  return (
    <Link to={`/admin/users/${id}`} className="inline-flex min-w-0 items-center gap-2 hover:underline">
      <Avatar id={id} name={p?.name ?? '?'} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">{p?.name ?? 'Unknown'}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </Link>
  );
}
export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm text-muted">
      <span>{total ? `${num(page * size + 1)}–${num(Math.min(total, (page + 1) * size))} of ${num(total)}` : 'Nothing here'}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="soft" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
        <Button size="sm" variant="soft" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
      </div>
    </div>
  );
}
export function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-10 max-w-xs rounded-full" type="search" />;
}
export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} aria-pressed={value === o.value}
          className={cx('h-8 rounded-full px-3 text-sm font-semibold transition cursor-pointer', value === o.value ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>{o.label}</button>
      ))}
    </div>
  );
}
export const th = 'px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap';
export const td = 'px-5 py-3 align-middle';

// ---------- confirm / prompt ----------
type Ask = { title: string; body?: ReactNode; confirm: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean; type?: string; multiline?: boolean; initial?: string }; typeToConfirm?: string };
const [useAsk, setAsk] = createStore<(Ask & { resolve: (v: string | null) => void }) | null>(null);
/** Promise-based confirm. Resolves to the typed text ('' when there's no input), or null if cancelled. */
export const ask = (a: Ask) => new Promise<string | null>((resolve) => setAsk({ ...a, resolve }));
export function AskHost() {
  const a = useAsk();
  const [v, setV] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => setV(a?.input?.initial ?? ''), [a]);
  const close = (r: string | null) => { a?.resolve(r); setAsk(null); setV(''); setTyped(''); };
  const ok = (!a?.input?.required || v.trim()) && (!a?.typeToConfirm || typed === a.typeToConfirm);
  return (
    <Modal open={!!a} onClose={() => close(null)} title={a?.title ?? ''}>
      {a && (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) close(v.trim()); }}>
          {a.body && <div className="text-sm text-muted">{a.body}</div>}
          {a.input && (
            <Field label={a.input.label}>
              {a.input.multiline
                ? <textarea autoFocus className="min-h-24 w-full rounded-xl border border-line bg-surface p-3 outline-none focus:border-ink" placeholder={a.input.placeholder} value={v} onChange={(e) => setV(e.target.value)} maxLength={500} />
                : <Input autoFocus type={a.input.type ?? 'text'} placeholder={a.input.placeholder} value={v} onChange={(e) => setV(e.target.value)} />}
            </Field>
          )}
          {a.typeToConfirm && (
            <Field label={`Type “${a.typeToConfirm}” to confirm`}>
              <Input autoFocus={!a.input} value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => close(null)}>Cancel</Button>
            <Button type="submit" variant={a.danger ? 'danger' : 'ink'} disabled={!ok}>{a.confirm}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

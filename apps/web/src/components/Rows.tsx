import { Trash2 } from 'lucide-react';
import { CATEGORIES } from '@splitup/shared';
import { api, myNet, refresh, type Expense, type Person, type Settlement } from '../api';
import { date, money, month, usePrefs, useT } from '../i18n';
import { openDetail, usePeople } from '../store';
import { cx, toast, toastError } from '../ui';

export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', esewa: 'eSewa', khalti: 'Khalti', fonepay: 'Fonepay', bank: 'Bank', other: 'Other' };

function DateTile({ iso }: { iso: string }) {
  const p = usePrefs();
  const [d, ...m] = date(iso, p, 'short').split(' ');
  return (
    <span className="flex w-10 shrink-0 flex-col items-center leading-none text-muted">
      <span className="text-[10px] font-semibold uppercase">{m.join(' ').slice(0, 6)}</span>
      <span className="font-display text-lg font-bold text-ink">{d}</span>
    </span>
  );
}

export function ExpenseRow({ e, people }: { e: Expense; people: Person[] }) {
  const t = useT();
  const { lang } = usePrefs();
  const { name, me } = usePeople(people);
  const net = myNet(e, me.id);
  const involved = [...e.payers, ...e.shares].some((p) => p.userId === me.id);
  const payer = e.payers.length > 1 ? t('{n} people', { n: e.payers.length }) : name(e.payers[0]?.userId);
  return (
    <button onClick={() => openDetail({ expense: e, people })} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 cursor-pointer">
      <DateTile iso={e.date} />
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-xl">{CATEGORIES[e.category] ?? '🧾'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{e.description}</span>
        <span className="block truncate text-xs text-muted">{t('{who} paid {amount}', { who: payer, amount: money(e.amount, lang) })}</span>
      </span>
      <span className="text-right leading-tight">
        {!involved ? <span className="text-xs text-muted">{t('not involved')}</span> : !net ? <span className="text-xs text-muted">{t('no balance')}</span> : (
          <>
            <span className={cx('block text-xs', net > 0 ? 'text-owed' : 'text-owe')}>{net > 0 ? t('you lent') : t('you borrowed')}</span>
            <span className={cx('font-semibold', net > 0 ? 'text-owed' : 'text-owe')}>{money(net, lang)}</span>
          </>
        )}
      </span>
    </button>
  );
}

export function SettlementRow({ s, people }: { s: Settlement; people: Person[] }) {
  const t = useT();
  const { lang } = usePrefs();
  const { name, obj } = usePeople(people);
  const remove = async () => {
    if (!confirm(t('Delete this payment?'))) return;
    try { await api(`/settlements/${s.id}`, undefined, 'DELETE'); await refresh(); toast(t('Payment deleted')); } catch (e) { toastError(e); }
  };
  return (
    <div className="group flex items-center gap-3 px-4 py-3">
      <DateTile iso={s.date} />
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-owed-soft text-xl">💸</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{t('{from} paid {to}', { from: name(s.fromUser), to: obj(s.toUser) })}</span>
        <span className="block truncate text-xs text-muted">{t(METHOD_LABEL[s.method] ?? s.method)}{s.note && ` · ${s.note}`}</span>
      </span>
      <span className="font-semibold text-owed">{money(s.amount, lang)}</span>
      <button onClick={remove} aria-label={t('Delete')} className="grid size-8 place-items-center rounded-full text-muted opacity-60 hover:bg-owe-soft hover:text-owe hover:opacity-100 cursor-pointer"><Trash2 size={15} /></button>
    </div>
  );
}

/** Expenses and payments together, newest first, under month headings. */
export function Ledger({ expenses, settlements, people }: { expenses: Expense[]; settlements: Settlement[]; people: Person[] }) {
  const p = usePrefs();
  const rows = [
    ...expenses.map((e) => ({ key: 'e' + e.id, date: e.date, at: e.createdAt, node: <ExpenseRow e={e} people={people} /> })),
    ...settlements.map((s) => ({ key: 's' + s.id, date: s.date, at: s.createdAt, node: <SettlementRow s={s} people={people} /> })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  const months: { label: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const label = month(r.date, p);
    if (months.at(-1)?.label !== label) months.push({ label, rows: [] });
    months.at(-1)!.rows.push(r);
  }
  return (
    <div className="space-y-5">
      {months.map((m) => (
        <section key={m.label}>
          <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">{m.label}</h3>
          <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
            {m.rows.map((r) => <div key={r.key}>{r.node}</div>)}
          </div>
        </section>
      ))}
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Camera, Plus, Sparkles, X } from 'lucide-react';
import {
  CATEGORIES, guessCategory, splitEqual, splitItemized, splitPercent, splitShares, sum, toPaisa, type Category, type Portion,
} from '@splitup/shared';
import { api, refresh } from '../api';
import { amount, cur, date, money, usePrefs, usesBs, useT, today } from '../i18n';
import { openExpense, useConfig, useDash, useExpenseModal, usePeople, type ExpenseCtx } from '../store';
import { openAi, snapBill, type AiCtx } from '../ai';
import { useAiGate } from './Credits';
import { Avatar, Button, Input, Modal, Segmented, cx, inputCls, toast, toastError } from '../ui';
import PersonPicker from './PersonPicker';

type SplitType = 'equal' | 'exact' | 'percent' | 'shares' | 'itemized';
type Row = { name: string; price: string; userIds: string[] };

export default function ExpenseForm() {
  const ctx = useExpenseModal();
  const t = useT();
  return (
    <Modal open={!!ctx} onClose={() => openExpense(null)} title={ctx?.expense ? t('Edit expense') : t('Add expense')} wide>
      {ctx && <Form ctx={ctx} />}
    </Modal>
  );
}

const num = (s: string | undefined) => Number(s) || 0;

function Form({ ctx }: { ctx: ExpenseCtx }) {
  const t = useT();
  const prefs = usePrefs();
  const { lang } = prefs;
  const dash = useDash().data;
  const ai = useConfig().data?.ai;
  const gate = useAiGate();
  const { name, full, me } = usePeople();
  const e = ctx.expense;
  const m = (e?.meta ?? {}) as Record<string, any>;

  const [groupId, setGroupId] = useState<string | null>(e ? e.groupId : ctx.groupId ?? null);
  const [withIds, setWithIds] = useState<string[]>(
    e && !e.groupId ? [...new Set([...e.payers, ...e.shares].map((p) => p.userId))].filter((i) => i !== me.id) : ctx.friendId ? [ctx.friendId] : [],
  );
  const [description, setDescription] = useState(e?.description ?? '');
  const [category, setCategory] = useState<Category>(e?.category ?? 'other');
  const [catTouched, setCatTouched] = useState(!!e);
  const [catOpen, setCatOpen] = useState(false);
  const [amountStr, setAmountStr] = useState(e ? String(e.amount / 100) : '');
  const [day, setDay] = useState(e?.date ?? today());
  const [notes, setNotes] = useState(e?.notes ?? '');
  const [splitType, setSplitType] = useState<SplitType>(e?.splitType ?? 'equal');
  const [payerMode, setPayerMode] = useState<'single' | 'multi'>(e && e.payers.length > 1 ? 'multi' : 'single');
  const [payer, setPayer] = useState(e?.payers[0]?.userId ?? me.id);
  const [payerOpen, setPayerOpen] = useState(false);
  const [payerAmts, setPayerAmts] = useState<Record<string, string>>(Object.fromEntries((e?.payers ?? []).map((p) => [p.userId, String(p.amount / 100)])));
  const [excluded, setExcluded] = useState<string[]>(m.excluded ?? []);
  const [exact, setExact] = useState<Record<string, string>>(m.exact ?? {});
  const [pct, setPct] = useState<Record<string, string>>(m.pct ?? {});
  const [weights, setWeights] = useState<Record<string, string>>(m.weights ?? {});
  const [items, setItems] = useState<Row[]>(m.items ?? [{ name: '', price: '', userIds: [] }]);
  const [sc, setSc] = useState<string>(m.sc ?? '10');
  const [vat, setVat] = useState<string>(m.vat ?? '13');
  const [extra, setExtra] = useState<string>(m.extra ?? '');
  const [discount, setDiscount] = useState<string>(m.discount ?? '');
  const [busy, setBusy] = useState(false);

  const group = dash?.groups.find((g) => g.id === groupId);
  const fixed = !!e || !!ctx.groupId || !!ctx.friendId;
  const participants = [...new Set([
    ...(groupId ? group?.memberIds ?? [] : [me.id, ...withIds]),
    ...(e ? [...e.payers, ...e.shares].map((p) => p.userId) : []),
  ])];

  // ---- compute the split ----
  let total = toPaisa(amountStr || 0);
  let shares: Portion[] = [];
  let bill: ReturnType<typeof splitItemized> | null = null;
  let err = '';
  try {
    if (splitType === 'equal') {
      const ids = participants.filter((i) => !excluded.includes(i));
      if (!ids.length) err = t('Pick at least one person');
      else shares = splitEqual(total, ids);
    } else if (splitType === 'exact') {
      shares = participants.map((userId) => ({ userId, amount: toPaisa(exact[userId] || 0) }));
      const left = total - sum(shares.map((s) => s.amount));
      if (left) err = left > 0 ? t('{amount} left to assign', { amount: money(left, lang) }) : t('{amount} over the total', { amount: money(left, lang) });
    } else if (splitType === 'percent') {
      const ps = participants.map((i) => num(pct[i]));
      if (Math.abs(sum(ps) - 100) > 0.001) err = t('Percentages must add up to 100 (now {n})', { n: +sum(ps).toFixed(2) });
      else shares = splitPercent(total, participants, ps);
    } else if (splitType === 'shares') {
      const ws = participants.map((i) => num(weights[i] ?? '1'));
      if (sum(ws) <= 0) err = t('Give someone at least 1 share');
      else shares = splitShares(total, participants, ws);
    } else {
      const priced = items.map((i) => ({ name: i.name, price: toPaisa(i.price || 0), userIds: i.userIds })).filter((i) => i.price > 0);
      if (!priced.length) { err = t('Add at least one item with a price'); total = 0; }
      else {
        bill = splitItemized(priced, { serviceCharge: num(sc), vat: num(vat), extra: toPaisa(extra || 0), discount: toPaisa(discount || 0) });
        total = bill.total;
        shares = bill.shares;
      }
    }
  } catch (x) { err = (x as Error).message; }
  const payers: Portion[] = payerMode === 'single' ? [{ userId: payer, amount: total }] : participants.map((userId) => ({ userId, amount: toPaisa(payerAmts[userId] || 0) }));
  if (!err && payerMode === 'multi' && sum(payers.map((p) => p.amount)) !== total) err = t('Paid amounts must add up to {amount}', { amount: money(total, lang) });
  if (!(total > 0)) err = splitType === 'itemized' ? err || t('Add at least one item with a price') : t('Enter an amount');
  if (!groupId && !withIds.length) err = t('Choose a group or at least one friend');
  if (!description.trim()) err = err || t('Add a description');
  const shareOf = (id: string) => shares.find((s) => s.userId === id)?.amount ?? 0;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (err) return toast(err, true);
    setBusy(true);
    const body = {
      groupId, description: description.trim(), amount: total, category, date: day, splitType,
      payers: payers.filter((p) => p.amount > 0), shares: shares.filter((s) => s.amount > 0), notes: notes.trim() || undefined,
      meta: { excluded, exact, pct, weights, items: splitType === 'itemized' ? items : undefined, sc, vat, extra, discount },
    };
    try {
      await api(e ? `/expenses/${e.id}` : '/expenses', body, e ? 'PUT' : 'POST');
      await refresh();
      toast(e ? t('Expense updated') : t('Expense added ✓'));
      openExpense(null);
    } catch (x) { toastError(x); } finally { setBusy(false); }
  };

  const personRow = (id: string, control: React.ReactNode, amount?: number) => (
    <div key={id} className="flex items-center gap-3 py-1.5">
      <Avatar id={id} name={full(id)} size={32} />
      <span className="min-w-0 flex-1 truncate font-medium">{name(id)}</span>
      {control}
      {amount !== undefined && <span className="w-24 text-right text-sm tabular-nums text-muted">{money(amount, lang)}</span>}
    </div>
  );
  const small = cx(inputCls, 'h-9 w-24 text-right');

  const toAi = (f: (c: AiCtx) => void) => gate(() => { const c = { groupId: ctx.groupId, friendId: ctx.friendId }; openExpense(null); f(c); });

  return (
    <form onSubmit={submit} className="space-y-5">
      {!e && ai && (
        <div className="flex items-center gap-2 rounded-2xl bg-marigold-soft py-1.5 pl-3 pr-1.5 text-sm">
          <Sparkles size={16} className="shrink-0 text-marigold" />
          <span className="min-w-0 flex-1 font-medium">{t('Let AI fill it in')}</span>
          <Button type="button" size="sm" onClick={() => toAi(snapBill)}><Camera size={14} /> {t('Scan bill')}</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => toAi(openAi)}>{t('Describe')}</Button>
        </div>
      )}
      {/* who */}
      {fixed ? (
        <p className="text-sm text-muted">
          {groupId ? <>{t('In')} <b className="text-ink">{group?.name}</b></> : <>{t('With')} <b className="text-ink">{withIds.map(name).join(', ')}</b></>}
        </p>
      ) : (
        <div className="space-y-3 rounded-3xl bg-surface-2 p-4">
          <label className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted">{t('Group')}</span>
            <select value={groupId ?? ''} onChange={(x) => setGroupId(x.target.value || null)} className={cx(inputCls, 'flex-1')}>
              <option value="">{t('No group — split with friends')}</option>
              {dash?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          {!groupId && <PersonPicker selected={withIds} onChange={setWithIds} />}
        </div>
      )}

      {/* what */}
      <div className="flex gap-2">
        <div className="relative">
          <button type="button" onClick={() => setCatOpen(!catOpen)} className="grid size-14 place-items-center rounded-2xl border border-line bg-surface text-3xl cursor-pointer" aria-label={t('Category')}>{CATEGORIES[category]}</button>
          {catOpen && (
            <div className="absolute left-0 top-16 z-10 grid w-72 grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-2 shadow-xl">
              {(Object.keys(CATEGORIES) as Category[]).map((c) => (
                <button type="button" key={c} onClick={() => { setCategory(c); setCatTouched(true); setCatOpen(false); }}
                  className={cx('flex flex-col items-center rounded-xl p-2 text-2xl hover:bg-surface-2 cursor-pointer', c === category && 'bg-marigold-soft')}>
                  {CATEGORIES[c]}<span className="text-[10px] capitalize text-muted">{t(c)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Input autoFocus={!e} required maxLength={100} value={description} placeholder={t('What was it? e.g. Momo at Bhojan Griha')} className="h-14 text-lg"
          onChange={(x) => { setDescription(x.target.value); if (!catTouched) setCategory(guessCategory(x.target.value) ?? 'other'); }} />
      </div>

      {/* how much */}
      <div className="flex items-center gap-2 rounded-3xl border border-line bg-surface px-5 py-3 focus-within:border-ink">
        <span className="font-display text-3xl font-bold text-muted">{cur(lang)}</span>
        {splitType === 'itemized' ? (
          <span className="font-display text-4xl font-extrabold tabular-nums">{amount(total, lang)}</span>
        ) : (
          <input inputMode="decimal" value={amountStr} onChange={(x) => setAmountStr(x.target.value.replace(/[^\d.]/g, ''))} placeholder="0"
            className="w-full bg-transparent font-display text-4xl font-extrabold tabular-nums outline-none focus-visible:outline-none" aria-label={t('Amount')} />
        )}
      </div>

      {/* paid by */}
      <div className="text-center">
        {t('Paid by')}{' '}
        <button type="button" onClick={() => setPayerOpen(!payerOpen)} className="rounded-full bg-marigold-soft px-3 py-1 font-bold cursor-pointer">
          {payerMode === 'multi' ? t('multiple people') : name(payer)} ▾
        </button>
      </div>
      {payerOpen && (
        <div className="rounded-3xl border border-line p-3">
          {participants.map((id) => personRow(id, payerMode === 'single'
            ? <input type="radio" name="payer" checked={payer === id} onChange={() => { setPayer(id); setPayerOpen(false); }} className="size-5 accent-[var(--ink)]" />
            : <input className={small} inputMode="decimal" placeholder="0" value={payerAmts[id] ?? ''} onChange={(x) => setPayerAmts({ ...payerAmts, [id]: x.target.value })} />))}
          <button type="button" onClick={() => setPayerMode(payerMode === 'single' ? 'multi' : 'single')} className="mt-2 text-sm font-semibold underline cursor-pointer">
            {payerMode === 'single' ? t('More than one person paid') : t('Just one person paid')}
          </button>
        </div>
      )}

      {/* split */}
      <div className="space-y-3">
        <Segmented value={splitType} onChange={setSplitType} options={[
          { value: 'equal', label: <span title={t('Equally')}>=</span> },
          { value: 'exact', label: <span title={t('Exact amounts')}>1.23</span> },
          { value: 'percent', label: <span title={t('Percentages')}>%</span> },
          { value: 'shares', label: <span title={t('Shares')}>▦</span> },
          { value: 'itemized', label: <span title={t('Itemized bill')}>🧾</span> },
        ]} />
        <p className="text-center text-sm font-semibold">
          {{ equal: t('Split equally'), exact: t('Split by exact amounts'), percent: t('Split by percentages'), shares: t('Split by shares'), itemized: t('Itemized bill — everyone pays for what they had') }[splitType]}
        </p>

        {splitType !== 'itemized' && (
          <div className="rounded-3xl border border-line p-3">
            {participants.map((id) => {
              if (splitType === 'equal') return personRow(id,
                <input type="checkbox" checked={!excluded.includes(id)} onChange={() => setExcluded(excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id])} className="size-5 accent-[var(--ink)]" />, shareOf(id));
              const [val, set, ph] = splitType === 'exact' ? [exact, setExact, '0'] : splitType === 'percent' ? [pct, setPct, '0'] : [weights, setWeights, '1'];
              return personRow(id, <span className="flex items-center gap-1">
                <input className={small} inputMode="decimal" placeholder={ph} value={val[id] ?? ''} onChange={(x) => set({ ...val, [id]: x.target.value })} />
                <span className="w-4 text-sm text-muted">{splitType === 'percent' ? '%' : splitType === 'shares' ? '×' : ''}</span>
              </span>, splitType === 'exact' ? undefined : shareOf(id));
            })}
            {splitType === 'percent' && participants.length > 0 && (
              <button type="button" className="mt-1 text-sm font-semibold underline cursor-pointer"
                onClick={() => {
                  const each = Math.floor(10000 / participants.length) / 100;
                  setPct(Object.fromEntries(participants.map((id, i) => [id, String(i ? each : +(100 - each * (participants.length - 1)).toFixed(2))])));
                }}>
                {t('Fill evenly')}
              </button>
            )}
          </div>
        )}

        {splitType === 'itemized' && (
          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="space-y-2 rounded-3xl border border-line bg-surface p-3">
                <div className="flex gap-2">
                  <Input placeholder={t('Item, e.g. Buff momo')} value={it.name} onChange={(x) => setItems(items.map((r, j) => (j === i ? { ...r, name: x.target.value } : r)))} />
                  <input className={cx(inputCls, 'w-28 text-right')} inputMode="decimal" placeholder={`${cur(lang)} 0`} value={it.price}
                    onChange={(x) => setItems(items.map((r, j) => (j === i ? { ...r, price: x.target.value.replace(/[^\d.]/g, '') } : r)))} />
                  <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-owe-soft hover:text-owe cursor-pointer" aria-label={t('Remove item')}><X size={18} /></button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setItems(items.map((r, j) => (j === i ? { ...r, userIds: r.userIds.length === participants.length ? [] : participants } : r)))}
                    className="rounded-full border border-line px-2.5 py-1 text-xs font-bold cursor-pointer">{t('Everyone')}</button>
                  {participants.map((id) => {
                    const on = it.userIds.includes(id);
                    return (
                      <button type="button" key={id} onClick={() => setItems(items.map((r, j) => (j === i ? { ...r, userIds: on ? r.userIds.filter((u) => u !== id) : [...r.userIds, id] } : r)))}
                        className={cx('flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold transition cursor-pointer', on ? 'bg-ink text-on-ink' : 'bg-surface-2 text-muted')}>
                        <Avatar id={id} name={full(id)} size={22} /> {name(id)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <Button type="button" variant="soft" size="sm" onClick={() => setItems([...items, { name: '', price: '', userIds: items.at(-1)?.userIds ?? [] }])}><Plus size={16} /> {t('Add item')}</Button>
            <div className="grid grid-cols-2 gap-3 rounded-3xl bg-surface-2 p-4 text-sm">
              <label className="flex items-center justify-between gap-2">{t('Service charge')}<span className="flex items-center gap-1"><input className={cx(small, 'w-16')} inputMode="decimal" value={sc} onChange={(x) => setSc(x.target.value)} />%</span></label>
              <label className="flex items-center justify-between gap-2">{t('VAT')}<span className="flex items-center gap-1"><input className={cx(small, 'w-16')} inputMode="decimal" value={vat} onChange={(x) => setVat(x.target.value)} />%</span></label>
              <label className="flex items-center justify-between gap-2">{t('Delivery/tip')}<input className={cx(small, 'w-20')} inputMode="decimal" placeholder="0" value={extra} onChange={(x) => setExtra(x.target.value)} /></label>
              <label className="flex items-center justify-between gap-2">{t('Discount')}<input className={cx(small, 'w-20')} inputMode="decimal" placeholder="0" value={discount} onChange={(x) => setDiscount(x.target.value)} /></label>
            </div>
            {bill && (
              <div className="receipt mb-4 rounded-t-3xl bg-ink p-4 font-mono text-sm text-on-ink">
                {[[t('Subtotal'), bill.subtotal], [t('Service charge'), bill.serviceCharge], [t('VAT'), bill.vat]].map(([k, v]) => (
                  <p key={k as string} className="flex justify-between opacity-80"><span>{k}</span><span>{money(v as number, lang)}</span></p>
                ))}
                <p className="mt-1 flex justify-between border-t border-dashed border-on-ink/30 pt-1 font-bold"><span>{t('Total')}</span><span>{money(bill.total, lang)}</span></p>
                <div className="mt-3 space-y-0.5 border-t border-dashed border-on-ink/30 pt-2">
                  {bill.shares.map((s) => <p key={s.userId} className="flex justify-between"><span>{name(s.userId)}</span><span className="text-marigold">{money(s.amount, lang)}</span></p>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* when + notes */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium text-muted">{t('Date')}</span>
          <Input type="date" value={day} max={today()} onChange={(x) => setDay(x.target.value)} required />
          {usesBs(prefs) && day && <span className="block text-xs text-muted">{date(day, prefs)}</span>}
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-muted">{t('Notes')}</span>
          <Input value={notes} maxLength={1000} onChange={(x) => setNotes(x.target.value)} placeholder={t('Optional')} />
        </label>
      </div>

      <div className="sticky -bottom-5 -mx-5 -mb-5 space-y-2 border-t border-line bg-bg px-5 py-4">
        {err && <p className="text-center text-sm font-medium text-owe">{err}</p>}
        <Button type="submit" size="lg" className="w-full" busy={busy} disabled={!!err}>{e ? t('Save changes') : t('Save expense')}</Button>
      </div>
    </form>
  );
}

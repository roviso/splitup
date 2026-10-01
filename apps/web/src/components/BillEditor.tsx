import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Pencil, Plus, Scissors, Trash2, UserPlus, Users } from 'lucide-react';
import { allocate, CATEGORIES, draftTotal, priceDraft, type Category, type Draft } from '@splitup/shared';
import { api, refresh, type Person } from '../api';
import { cur, date, money, usePrefs, usesBs, useT, today } from '../i18n';
import { useDash, usePeople } from '../store';
import { Avatar, Button, cx, inputCls, toastError } from '../ui';
import PersonPicker from './PersonPicker';

/** Number box that lets people type "12." without the dot vanishing. */
function Num({ value, onChange, className, placeholder = '0' }: { value: number; onChange: (n: number) => void; className?: string; placeholder?: string }) {
  const [s, setS] = useState(value ? String(value) : '');
  useEffect(() => { if ((Number(s) || 0) !== value) setS(value ? String(value) : ''); }, [value]);
  return (
    <input inputMode="decimal" value={s} placeholder={placeholder} className={cx(inputCls, 'h-9 text-right tabular-nums', className)}
      onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ''); setS(v); onChange(Number(v) || 0); }} />
  );
}
const toRs = (p: number) => p / 100, toPaisa = (r: number) => Math.round(r * 100);

/**
 * The review screen: tap a person, then tap what they had. Everything recalculates live,
 * and the AI chat below edits the same draft.
 */
export default function BillEditor({ draft: d, onChange, photo, fixedGroup, friendId, busy }: {
  draft: Draft; onChange: (d: Draft) => void; photo?: string; fixedGroup: boolean; friendId?: string; busy: boolean;
}) {
  const t = useT();
  const prefs = usePrefs();
  const { lang } = prefs;
  const dash = useDash().data;
  const { name, full, me } = usePeople();
  const [active, setActive] = useState<string>(me.id); // person being "painted" onto items; 'all' = everyone
  const [editing, setEditing] = useState<number | null>(null);
  const [charges, setCharges] = useState(false);
  const [addPeople, setAddPeople] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const people = [...new Set([...d.peopleIds, ...d.payers.map((p) => p.userId)])];
  const first = (id: string) => name(id).split(' ')[0]; // chips stay compact: "Bibek", not "Bibek Shrestha"
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const setItems = (items: Draft['items']) => set({ items });
  const whole = draftTotal(d);
  let priced: ReturnType<typeof priceDraft> = null;
  try { priced = priceDraft(d); } catch { /* discount bigger than the bill: shown via the total */ }
  const shareOf = (id: string) => priced?.shares.find((s) => s.userId === id)?.amount ?? 0;
  const open = d.items.filter((i) => !i.userIds.length).length;

  // Keep the painter on someone who's still on the bill.
  useEffect(() => { if (active !== 'all' && !people.includes(active)) setActive(people[0] ?? me.id); }, [people.join()]);

  const tap = (k: number) => setItems(d.items.map((it, j) => {
    if (j !== k) return it;
    if (active === 'all') return { ...it, userIds: it.userIds.length === people.length ? [] : people };
    return { ...it, userIds: it.userIds.includes(active) ? it.userIds.filter((u) => u !== active) : [...it.userIds, active] };
  }));

  /** Change who's in; drop anyone no longer on the bill from items and payers. */
  const setPeople = (groupId: string | null, ids: string[]) => {
    const keep = (u: string) => ids.includes(u);
    const payers = d.payers.filter((p) => keep(p.userId));
    onChange({
      ...d, groupId, peopleIds: ids,
      items: d.items.map((i) => ({ ...i, userIds: i.userIds.filter(keep) })),
      payers: payers.length ? payers : [{ userId: me.id, amount: null }],
    });
  };
  const members = (gid: string) => dash?.groups.find((g) => g.id === gid)?.memberIds ?? [me.id];

  const addUnknown = async (n: string) => {
    setAdding(n);
    try {
      const p = await api<Person>('/friends', { name: n });
      await refresh();
      onChange({ ...d, peopleIds: [...new Set([...d.peopleIds, p.id])], unknownNames: d.unknownNames.filter((x) => x !== n) });
    } catch (e) { toastError(e); } finally { setAdding(null); }
  };

  const splitUnits = (k: number) => {
    const it = d.items[k];
    const prices = allocate(it.price, Array.from({ length: it.qty }, () => 1));
    setItems(d.items.flatMap((x, j) => (j === k ? prices.map((price) => ({ name: it.name, qty: 1, price, userIds: [] })) : [x])));
    setEditing(null);
  };

  const diff = d.billTotal === null ? 0 : d.billTotal - whole.total;
  const payer = d.payers.length === 1 || d.payers.some((p) => p.amount === null) ? d.payers[0]?.userId : null;

  return (
    <div className={cx('space-y-5 transition', busy && 'pointer-events-none opacity-60')}>
      {/* what & how much */}
      <div className="flex gap-3">
        {photo && (
          <a href={photo} target="_blank" rel="noreferrer" className="shrink-0" aria-label={t('See the photo')}>
            <img src={photo} alt="" className="h-[4.5rem] w-14 rounded-xl object-cover ring-1 ring-line" />
          </a>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl bg-marigold-soft text-2xl" title={t('Category')}>
              {CATEGORIES[d.category]}
              <select value={d.category} onChange={(e) => set({ category: e.target.value as Category })} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t('Category')}>
                {(Object.keys(CATEGORIES) as Category[]).map((c) => <option key={c} value={c}>{CATEGORIES[c]} {t(c)}</option>)}
              </select>
            </label>
            <input value={d.description} maxLength={100} onChange={(e) => set({ description: e.target.value })} placeholder={t('What was it?')} className={cx(inputCls, 'font-semibold')} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="min-w-0 text-sm text-muted">
              <input type="date" value={d.date} max={today()} onChange={(e) => e.target.value && set({ date: e.target.value })} className="rounded-lg bg-transparent outline-none" aria-label={t('Date')} />
              {usesBs(prefs) && <span className="block text-xs">{date(d.date, prefs)}</span>}
            </label>
            <span className="font-display text-3xl font-extrabold tabular-nums">{money(Math.max(0, whole.total), lang)}</span>
          </div>
        </div>
      </div>

      {/* who's in */}
      <div className="space-y-2 rounded-3xl bg-surface-2 p-3">
        {fixedGroup || friendId ? (
          <p className="px-1 text-sm text-muted">
            {d.groupId ? <>{t('In')} <b className="text-ink">{dash?.groups.find((g) => g.id === d.groupId)?.name}</b></> : <>{t('With')} <b className="text-ink">{people.filter((i) => i !== me.id).map(name).join(', ')}</b></>}
          </p>
        ) : (
          <select value={d.groupId ?? ''} onChange={(e) => setPeople(e.target.value || null, e.target.value ? members(e.target.value) : [me.id])} className={cx(inputCls, 'h-10 text-sm')} aria-label={t('Group')}>
            <option value="">{t('No group — split with friends')}</option>
            {dash?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {!d.groupId && (
          <>
            <button type="button" onClick={() => setAddPeople(!addPeople)} className="flex w-full items-center gap-2 rounded-2xl px-1 py-1 text-sm font-semibold cursor-pointer">
              <UserPlus size={16} /> {people.length > 1 ? t('Add or remove people') : t('Who were you with?')}
              <ChevronDown size={16} className={cx('ml-auto transition', addPeople && 'rotate-180')} />
            </button>
            {addPeople && <PersonPicker selected={people.filter((i) => i !== me.id)} onChange={(ids) => setPeople(null, [me.id, ...ids])} />}
          </>
        )}
        {!!d.unknownNames.length && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-marigold-soft px-3 py-2 text-sm">
            <span className="flex-1">{d.groupId ? t('Not in this group: {names}. Add them from group settings first.', { names: d.unknownNames.join(', ') }) : t('Not your friends yet: {names}', { names: d.unknownNames.join(', ') })}</span>
            {!d.groupId && d.unknownNames.map((n) => (
              <Button key={n} size="sm" variant="soft" busy={adding === n} onClick={() => addUnknown(n)}><Plus size={14} /> {n}</Button>
            ))}
          </div>
        )}
      </div>

      {/* painter: pick a person, then tap their items */}
      <div className="sticky -top-5 z-10 -mx-5 space-y-2 bg-bg/95 px-5 py-2 backdrop-blur">
        <p className="text-xs font-medium text-muted">{t('Tap a person, then tap everything they had')}</p>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {people.map((id) => (
            <button key={id} type="button" onClick={() => setActive(id)}
              className={cx('flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left transition cursor-pointer', active === id ? 'bg-ink text-on-ink shadow-md' : 'bg-surface-2')}>
              <Avatar id={id} name={full(id)} size={30} />
              <span className="leading-tight">
                <span className="block text-sm font-semibold">{first(id)}</span>
                <span className={cx('block text-[11px] tabular-nums', active === id ? 'text-marigold' : 'text-muted')}>{money(shareOf(id), lang)}</span>
              </span>
            </button>
          ))}
          <button type="button" onClick={() => setActive('all')}
            className={cx('flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-semibold transition cursor-pointer', active === 'all' ? 'bg-ink text-on-ink shadow-md' : 'bg-surface-2')}>
            <span className="grid size-[30px] place-items-center rounded-full bg-marigold text-[#1b1a17]"><Users size={16} /></span> {t('Everyone')}
          </button>
        </div>
      </div>

      {/* items */}
      <div className="space-y-2">
        {d.items.map((it, k) => {
          const mine = active !== 'all' && it.userIds.includes(active);
          const all = it.userIds.length === people.length && people.length > 1;
          if (editing === k) return (
            <div key={k} className="space-y-2 rounded-2xl border border-ink bg-surface p-3">
              <input autoFocus value={it.name} onChange={(e) => setItems(d.items.map((x, j) => (j === k ? { ...x, name: e.target.value } : x)))} placeholder={t('Item, e.g. Buff momo')} className={inputCls} />
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">{t('Qty')}</span>
                <Num value={it.qty} className="w-16" placeholder="1" onChange={(n) => setItems(d.items.map((x, j) => (j === k ? { ...x, qty: n > 0 ? n : 1 } : x)))} />
                <span className="ml-auto text-muted">{cur(lang)}</span>
                <Num value={toRs(it.price)} className="w-28" onChange={(n) => setItems(d.items.map((x, j) => (j === k ? { ...x, price: toPaisa(n) } : x)))} />
              </div>
              <div className="flex flex-wrap gap-2">
                {Number.isInteger(it.qty) && it.qty > 1 && it.qty <= 20 && <Button size="sm" variant="soft" onClick={() => splitUnits(k)}><Scissors size={14} /> {t('Split into {n}', { n: it.qty })}</Button>}
                <Button size="sm" variant="danger" onClick={() => { setItems(d.items.filter((_, j) => j !== k)); setEditing(null); }}><Trash2 size={14} /> {t('Remove')}</Button>
                <Button size="sm" className="ml-auto" onClick={() => setEditing(null)}><Check size={14} /> {t('Done')}</Button>
              </div>
            </div>
          );
          return (
            <div key={k} role="button" tabIndex={0} onClick={() => tap(k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), tap(k))}
              className={cx('flex items-center gap-3 rounded-2xl border p-3 transition cursor-pointer select-none active:scale-[.99]',
                !it.userIds.length ? 'border-dashed border-marigold bg-marigold-soft/40' : mine ? 'border-ink bg-surface' : 'border-line bg-surface')}>
              <span className={cx('grid size-6 shrink-0 place-items-center rounded-full border-2 transition', mine || (active === 'all' && all) ? 'border-ink bg-ink text-on-ink' : 'border-line')}>
                {(mine || (active === 'all' && all)) && <Check size={14} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{it.name}{it.qty > 1 && <span className="ml-1.5 text-xs font-bold text-muted">×{it.qty}</span>}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  {!it.userIds.length ? <span className="font-semibold text-marigold">{t('Tap to assign')}</span>
                    : all ? t('Everyone')
                      : <><span className="flex -space-x-1.5">{it.userIds.slice(0, 5).map((u) => <Avatar key={u} id={u} name={full(u)} size={18} ring />)}</span><span className="truncate">{it.userIds.map(first).join(', ')}</span></>}
                </span>
              </span>
              <span className="text-right font-semibold tabular-nums">{money(it.price, lang)}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(k); }} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label={t('Edit')}><Pencil size={15} /></button>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="soft" onClick={() => { setItems([...d.items, { name: '', qty: 1, price: 0, userIds: [] }]); setEditing(d.items.length); }}><Plus size={16} /> {t('Add item')}</Button>
          {open > 0 && people.length > 1 && (
            <Button size="sm" variant="soft" onClick={() => setItems(d.items.map((i) => (i.userIds.length ? i : { ...i, userIds: people })))}><Users size={16} /> {t('Everyone shared the rest')}</Button>
          )}
        </div>
      </div>

      {/* service charge, VAT, extras */}
      <div className="space-y-2">
        <button type="button" onClick={() => setCharges(!charges)} className="flex w-full items-center gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm cursor-pointer">
          <span className="flex-1 text-left">
            <b>{t('Service charge')}</b> {d.serviceCharge}% · <b>{t('VAT')}</b> {d.vat}%
            {!!d.extra && <> · +{money(d.extra, lang)}</>}{!!d.discount && <> · −{money(d.discount, lang)}</>}
          </span>
          <span className="text-muted">{charges ? t('Done') : t('Edit')}</span>
        </button>
        {charges && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line p-3 text-sm">
            <label className="flex items-center justify-between gap-2">{t('Service charge')}<span className="flex items-center gap-1"><Num className="w-16" value={d.serviceCharge} onChange={(n) => set({ serviceCharge: Math.min(100, n) })} />%</span></label>
            <label className="flex items-center justify-between gap-2">{t('VAT')}<span className="flex items-center gap-1"><Num className="w-16" value={d.vat} onChange={(n) => set({ vat: Math.min(100, n) })} />%</span></label>
            <label className="flex items-center justify-between gap-2">{t('Delivery/tip')}<Num className="w-20" value={toRs(d.extra)} onChange={(n) => set({ extra: toPaisa(n) })} /></label>
            <label className="flex items-center justify-between gap-2">{t('Discount')}<Num className="w-20" value={toRs(d.discount)} onChange={(n) => set({ discount: toPaisa(n) })} /></label>
          </div>
        )}
        {d.billTotal !== null && (Math.abs(diff) <= 100 ? (
          <p className="flex items-center gap-2 rounded-2xl bg-owed-soft px-4 py-2.5 text-sm font-medium text-owed"><Check size={16} /> {t('Matches the bill total')}</p>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-owe-soft px-4 py-2.5 text-sm">
            <AlertTriangle size={16} className="shrink-0 text-owe" />
            <span className="flex-1">{t('The bill says {bill}; these add up to {sum}.', { bill: money(d.billTotal, lang), sum: money(whole.total, lang) })}</span>
            <Button size="sm" variant="soft" onClick={() => set(diff > 0 ? { extra: d.extra + diff } : { discount: d.discount - diff })}>{t('Match bill')}</Button>
          </div>
        ))}
      </div>

      {/* paid by */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted">{t('Paid by')}</p>
        <div className="flex flex-wrap gap-2">
          {people.map((id) => (
            <button key={id} type="button" onClick={() => set({ payers: [{ userId: id, amount: null }] })}
              className={cx('flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-3 text-sm font-semibold transition cursor-pointer', payer === id ? 'bg-marigold text-[#1b1a17]' : 'bg-surface-2 text-muted')}>
              <Avatar id={id} name={full(id)} size={26} /> {first(id)}
            </button>
          ))}
        </div>
        {!payer && (
          <p className="text-sm text-muted">
            {d.payers.map((p) => `${name(p.userId)} ${money(p.amount ?? 0, lang)}`).join(' · ')}
            {!!priced?.paidGap && <span className="block font-medium text-owe">{t('Paid amounts must add up to {amount}', { amount: money(priced.total, lang) })}</span>}
          </p>
        )}
      </div>

      {/* result */}
      {priced && (
        <div className="receipt mb-4 rounded-t-3xl bg-ink p-4 font-mono text-sm text-on-ink">
          <p className="mb-1 text-xs opacity-60">{t('Each share includes service charge and VAT')}</p>
          {priced.shares.map((s) => (
            <p key={s.userId} className="flex justify-between py-0.5"><span>{name(s.userId)}</span><span className="text-marigold">{money(s.amount, lang)}</span></p>
          ))}
          {open > 0 && <p className="mt-1 border-t border-dashed border-on-ink/30 pt-1 opacity-70">{t('+ {n} not assigned yet', { n: open })}</p>}
        </div>
      )}
    </div>
  );
}

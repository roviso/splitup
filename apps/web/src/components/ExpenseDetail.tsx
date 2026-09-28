import { Pencil, Trash2 } from 'lucide-react';
import { CATEGORIES } from '@splitup/shared';
import { api, refresh } from '../api';
import { ago, date, money, usePrefs, useT } from '../i18n';
import { openDetail, openExpense, useExpenseDetail, usePeople } from '../store';
import { Avatar, Button, Modal, toast, toastError } from '../ui';

export default function ExpenseDetail() {
  const d = useExpenseDetail();
  const t = useT();
  const prefs = usePrefs();
  const { name, full, me } = usePeople(d?.people);
  const e = d?.expense;

  const remove = async () => {
    if (!e || !confirm(t('Delete “{name}”? You can restore it from Activity.', { name: e.description }))) return;
    try { await api(`/expenses/${e.id}`, undefined, 'DELETE'); await refresh(); openDetail(null); toast(t('Expense deleted')); } catch (x) { toastError(x); }
  };

  return (
    <Modal open={!!e} onClose={() => openDetail(null)} title={t('Expense')}>
      {e && (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-3xl bg-marigold-soft text-4xl">{CATEGORIES[e.category] ?? '🧾'}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-2xl font-bold">{e.description}</p>
              <p className="font-display text-3xl font-extrabold">{money(e.amount, prefs.lang)}</p>
              <p className="text-xs text-muted">{date(e.date, prefs)} · {t('added by {name}', { name: name(e.createdBy) })} {ago(e.createdAt, prefs.lang)}</p>
            </div>
          </div>

          <div className="space-y-1 rounded-3xl border border-line p-4">
            {e.payers.map((p) => (
              <p key={'p' + p.userId} className="flex items-center gap-3 py-1">
                <Avatar id={p.userId} name={full(p.userId)} size={28} />
                <span className="flex-1"><b>{name(p.userId)}</b> {t('paid')}</span>
                <span className="font-semibold text-owed">{money(p.amount, prefs.lang)}</span>
              </p>
            ))}
            <div className="my-2 border-t border-dashed border-line" />
            {e.shares.map((s) => (
              <p key={'s' + s.userId} className="flex items-center gap-3 py-1 text-sm">
                <Avatar id={s.userId} name={full(s.userId)} size={24} />
                <span className="flex-1">{s.userId === me.id ? t('Your share') : t("{name}'s share", { name: full(s.userId) })}</span>
                <span className="tabular-nums">{money(s.amount, prefs.lang)}</span>
              </p>
            ))}
          </div>

          {e.splitType === 'itemized' && Array.isArray(e.meta?.items) && (
            <div className="rounded-3xl bg-surface-2 p-4 text-sm">
              <p className="mb-2 font-semibold">{t('Items')}</p>
              {e.meta!.items.filter((i: any) => Number(i.price) > 0).map((i: any, k: number) => (
                <p key={k} className="flex justify-between gap-2 py-0.5">
                  <span>{i.name || t('Item')} <span className="text-muted">· {i.userIds.map(name).join(', ')}</span></span>
                  <span>{money(Math.round(Number(i.price) * 100), prefs.lang)}</span>
                </p>
              ))}
              <p className="mt-2 text-xs text-muted">{t('+ {sc}% service charge, {vat}% VAT', { sc: e.meta!.sc || 0, vat: e.meta!.vat || 0 })}</p>
            </div>
          )}
          {e.notes && <p className="rounded-2xl bg-surface-2 p-3 text-sm">📝 {e.notes}</p>}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { openDetail(null); openExpense({ expense: e }); }}><Pencil size={16} /> {t('Edit')}</Button>
            <Button variant="danger" onClick={remove}><Trash2 size={16} /> {t('Delete')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

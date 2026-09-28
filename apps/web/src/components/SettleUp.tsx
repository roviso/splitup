import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Copy } from 'lucide-react';
import { PAY_METHODS, toPaisa } from '@splitup/shared';
import { api, refresh, type GroupDetail, type Part } from '../api';
import { money, usePrefs, useT, today } from '../i18n';
import { openSettle, useDash, usePeople, useSettleModal, type SettleCtx } from '../store';
import { Avatar, BalanceLine, Button, Empty, Field, Input, Modal, cx, toast, toastError } from '../ui';
import { METHOD_LABEL } from './Rows';

export default function SettleUp() {
  const ctx = useSettleModal();
  const t = useT();
  return (
    <Modal open={!!ctx} onClose={() => openSettle(null)} title={t('Settle up')}>
      {ctx && (ctx.from && ctx.to ? <Form ctx={ctx} /> : <Choose ctx={ctx} />)}
    </Modal>
  );
}

/** No pair chosen yet: list who owes whom (in this group, or across all my balances). */
function Choose({ ctx }: { ctx: SettleCtx }) {
  const t = useT();
  const { lang } = usePrefs();
  const dash = useDash().data;
  const g = useQuery({ queryKey: ['group', ctx.groupId], queryFn: () => api<GroupDetail>(`/groups/${ctx.groupId}`), enabled: !!ctx.groupId });
  const { name, full, me } = usePeople(g.data?.people);
  const rows = ctx.groupId
    ? (g.data?.debts ?? []).map((d) => ({ key: d.from + d.to, from: d.from, to: d.to, amount: d.amount, parts: undefined as Part[] | undefined, mine: d.from === me.id || d.to === me.id }))
      .sort((a, b) => +b.mine - +a.mine)
    : (dash?.balances ?? []).map((b) => ({ key: b.userId, from: b.total < 0 ? me.id : b.userId, to: b.total < 0 ? b.userId : me.id, amount: Math.abs(b.total), parts: b.parts, mine: true, total: b.total }));
  if (!rows.length) return <Empty icon="✨" title={t('Nothing to settle')} text={t('Everyone is square. Enjoy the momo!')} />;
  return (
    <div className="space-y-2">
      <p className="mb-3 text-sm text-muted">{t('Who is paying?')}</p>
      {rows.map((r) => (
        <button key={r.key} onClick={() => openSettle({ ...ctx, from: r.from, to: r.to, amount: r.amount, parts: r.parts })}
          className={cx('flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left transition hover:bg-surface-2 cursor-pointer', !r.mine && 'opacity-70')}>
          <Avatar id={r.from} name={full(r.from)} size={32} />
          <ArrowRight size={16} className="text-muted" />
          <Avatar id={r.to} name={full(r.to)} size={32} />
          <span className="min-w-0 flex-1 text-sm"><b>{name(r.from)}</b> → <b>{name(r.to)}</b></span>
          {'total' in r ? <BalanceLine amount={r.total as number} /> : <span className="font-semibold text-owe">{money(r.amount, lang)}</span>}
        </button>
      ))}
    </div>
  );
}

function Form({ ctx }: { ctx: SettleCtx }) {
  const t = useT();
  const { lang } = usePrefs();
  const { name, full, me } = usePeople();
  const from = ctx.from!, to = ctx.to!;
  const [amountStr, setAmountStr] = useState(ctx.amount ? (ctx.amount / 100).toFixed(ctx.amount % 100 ? 2 : 0) : '');
  const [method, setMethod] = useState<(typeof PAY_METHODS)[number]>('cash');
  const [day, setDay] = useState(today());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pay = useQuery({ queryKey: ['payment', to], queryFn: () => api<{ name: string; esewaId: string | null; khaltiId: string | null; paymentQr: string | null }>(`/users/${to}/payment`) });
  const amount = toPaisa(amountStr || 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const base = { method, date: day, note: note.trim() || undefined };
    try {
      const other = from === me.id ? to : from;
      if (!ctx.groupId && ctx.parts?.length && amount === ctx.amount) {
        // Full settle across contexts: one payment per group, so every group's balance clears too.
        for (const p of ctx.parts) {
          await api('/settlements', { ...base, groupId: p.groupId, amount: Math.abs(p.amount), fromUser: p.amount < 0 ? me.id : other, toUser: p.amount < 0 ? other : me.id });
        }
      } else {
        const iPay = from === me.id;
        const gid = ctx.groupId ?? ctx.parts?.find((p) => (p.amount < 0) === iPay)?.groupId ?? null;
        await api('/settlements', { ...base, groupId: gid, fromUser: from, toUser: to, amount });
      }
      await refresh();
      toast(t('Payment recorded 🎉'));
      openSettle(null);
    } catch (x) { toastError(x); } finally { setBusy(false); }
  };

  const copy = async (s: string) => { await navigator.clipboard.writeText(s); toast(t('Copied')); };
  const p = pay.data;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center justify-center gap-4">
        <div className="text-center"><Avatar id={from} name={full(from)} size={52} /><p className="mt-1 text-sm font-semibold">{name(from)}</p></div>
        <ArrowRight className="text-marigold" />
        <div className="text-center"><Avatar id={to} name={full(to)} size={52} /><p className="mt-1 text-sm font-semibold">{name(to)}</p></div>
      </div>

      <div className="flex items-center gap-2 rounded-3xl border border-line bg-surface px-5 py-3 focus-within:border-ink">
        <span className="font-display text-3xl font-bold text-muted">रु</span>
        <input inputMode="decimal" autoFocus value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))}
          className="w-full bg-transparent font-display text-4xl font-extrabold tabular-nums outline-none focus-visible:outline-none" aria-label={t('Amount')} />
      </div>
      {ctx.amount && amount !== ctx.amount && amount > 0 && <p className="-mt-3 text-center text-xs text-muted">{t('Partial payment — {amount} will remain', { amount: money(Math.max(0, ctx.amount - amount), lang) })}</p>}

      <div className="flex flex-wrap justify-center gap-2">
        {PAY_METHODS.map((m) => (
          <button type="button" key={m} onClick={() => setMethod(m)}
            className={cx('rounded-full border px-3.5 py-1.5 text-sm font-semibold transition cursor-pointer', method === m ? 'border-ink bg-ink text-on-ink' : 'border-line hover:bg-surface-2')}>
            {t(METHOD_LABEL[m])}
          </button>
        ))}
      </div>

      {to !== me.id && p && (p.esewaId || p.khaltiId || p.paymentQr) && (
        <div className="space-y-3 rounded-3xl bg-marigold-soft p-4">
          <p className="text-sm font-semibold">{t('Pay {name} with', { name: p.name })}</p>
          {p.esewaId && <PayId label="eSewa" color="#60BB46" id={p.esewaId} onCopy={copy} />}
          {p.khaltiId && <PayId label="Khalti" color="#5C2D91" id={p.khaltiId} onCopy={copy} />}
          {p.paymentQr && <img src={p.paymentQr} alt={t('Payment QR')} className="mx-auto size-48 rounded-2xl bg-white object-contain p-2" />}
          <p className="text-xs text-muted">{t('Pay in your wallet app, then record it here.')}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('Date')}><Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label={t('Note')}><Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t('Optional')} /></Field>
      </div>
      <Button type="submit" size="lg" className="w-full" busy={busy} disabled={!(amount > 0)}>{t('Record payment')}</Button>
    </form>
  );
}

function PayId({ label, color, id, onCopy }: { label: string; color: string; id: string; onCopy: (s: string) => void }) {
  return (
    <button type="button" onClick={() => onCopy(id)} className="flex w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left cursor-pointer">
      <span className="rounded-lg px-2 py-1 text-xs font-bold text-white" style={{ background: color }}>{label}</span>
      <span className="flex-1 font-mono font-semibold">{id}</span>
      <Copy size={16} className="text-muted" />
    </button>
  );
}

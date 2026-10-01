import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Gift, Share2, Sparkles } from 'lucide-react';
import type { Credits } from '@splitup/shared';
import { addUrl, api, prettyCode, qc, refresh, type Me } from '../api';
import { date, usePrefs, useT } from '../i18n';
import { useMe } from '../store';
import { Button, Input, Modal, createStore, cx, shareLink, toast, toastError } from '../ui';

export const [useCreditsModal, openCredits] = createStore(false);

/** Update the balance everywhere after an AI request, without refetching. */
export const setCredits = (c: Credits) => qc.setQueryData<Me>(['me'], (m) => m && { ...m, aiCredits: c });

/** Run an AI action if there's a credit to spend, else show how to get more. */
export function useAiGate() {
  const left = useMe().aiCredits.left;
  return (f: () => void) => (left > 0 ? f() : openCredits(true));
}

// ---------- invite codes waiting to be used (from an /add/<code> link or typed at sign-up) ----------
const KEY = 'invite';
export const rememberInvite = (code: string) => { try { localStorage.setItem(KEY, code.trim()); } catch { /* private mode */ } };
export const pendingInvite = () => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const forgetInvite = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };

type Redeemed = { me: Me; bonus: number; inviter: { name: string } };
export async function redeem(code: string) {
  const r = await api<Redeemed>('/me/referral', { code });
  forgetInvite();
  qc.setQueryData(['me'], r.me);
  await refresh();
  return r;
}

export function CreditsPill({ className }: { className?: string }) {
  const t = useT();
  const { left } = useMe().aiCredits;
  return (
    <button type="button" onClick={() => openCredits(true)} title={t('AI credits')}
      className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums transition cursor-pointer',
        left ? 'bg-marigold-soft text-ink hover:brightness-95' : 'bg-owe-soft text-owe', className)}>
      <Sparkles size={12} className={left ? 'text-marigold' : ''} /> {t('{n} left', { n: left })}
    </button>
  );
}

/** Balance, how it renews, and the invite code that earns more. Used on Account and in the credits sheet. */
export function CreditsPanel() {
  const t = useT();
  const prefs = usePrefs();
  const me = useMe();
  const c = me.aiCredits;
  const refs = useQuery({ queryKey: ['referrals'], queryFn: () => api<{ joined: number; bonus: number }>('/me/referrals') });
  const code = me.friendCode;
  const share = () => code && shareLink(t('Split bills with me on Split-Up! Sign up with my invite code {code} and we both get {n} free AI bill scans.', { code: prettyCode(code), n: c.perMonth }), addUrl(code), t('Invite link copied'));

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-extrabold tabular-nums">{c.left}</span>
            <span className="font-semibold text-muted">{t('credits left')}</span>
          </p>
          <p className="text-sm text-muted">{t('1 credit = 1 bill scanned or split by AI. Fixing it afterwards is free.')}</p>
        </div>
      </div>
      <div className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span>{t('{n} free every month', { n: c.perMonth })}</span>
          <span className="flex gap-1" aria-label={t('{n} of {m} left this month', { n: c.monthly, m: c.perMonth })}>
            {Array.from({ length: c.perMonth }, (_, i) => <span key={i} className={cx('size-2.5 rounded-full', i < c.monthly ? 'bg-marigold' : 'bg-line')} />)}
          </span>
        </div>
        <p className="text-xs text-muted">{t('Renews on {date}', { date: date(c.renewsOn, prefs) })}</p>
        {c.bonus > 0 && <p className="flex items-center justify-between border-t border-line pt-2"><span>{t('Bonus credits (never expire)')}</span><b>+{c.bonus}</b></p>}
      </div>

      <div className="space-y-3 rounded-3xl bg-marigold-soft p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-marigold text-[#1b1a17]"><Gift size={20} /></span>
          <div>
            <p className="font-display text-lg font-bold leading-tight">{t('Invite friends, get {n} credits each', { n: refs.data?.bonus ?? 5 })}</p>
            <p className="text-sm text-muted">{t('They get {n} too when they sign up with your code.', { n: refs.data?.bonus ?? 5 })}</p>
          </div>
        </div>
        {code && (
          <div className="flex items-center gap-2">
            <span className="flex-1 rounded-2xl border border-dashed border-ink/30 bg-surface px-4 py-2.5 text-center font-display text-xl font-extrabold tracking-[.15em]">{prettyCode(code)}</span>
            <Button variant="soft" onClick={async () => { await navigator.clipboard.writeText(prettyCode(code)); toast(t('Code copied')); }} aria-label={t('Copy code')}><Copy size={16} /></Button>
          </div>
        )}
        <Button variant="ink" className="w-full" onClick={share} disabled={!code}><Share2 size={16} /> {t('Share invite')}</Button>
        {!!refs.data?.joined && <p className="text-center text-sm font-medium">🎉 {t('{n} friends joined with your code', { n: refs.data.joined })}</p>}
      </div>

      {me.canRedeem && <RedeemForm />}
    </div>
  );
}

function RedeemForm() {
  const t = useT();
  const [code, setCode] = useState(pendingInvite());
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await redeem(code);
      toast(t('You and {name} got {n} bonus AI credits 🎉', { name: r.inviter.name.split(' ')[0], n: r.bonus }));
    } catch (x) { toastError(x); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-sm font-medium">{t('Got an invite code from a friend?')}</p>
      <div className="flex gap-2">
        <Input required minLength={4} maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="7KQ2-M9XP" className="font-display tracking-widest" />
        <Button type="submit" variant="soft" busy={busy}>{t('Apply')}</Button>
      </div>
    </form>
  );
}

export default function CreditsSheet() {
  const open = useCreditsModal();
  const t = useT();
  return (
    <Modal open={open} onClose={() => openCredits(false)} title={t('AI credits')}>
      {open && <CreditsPanel />}
    </Modal>
  );
}

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Camera, ImageUp, Mic, Sparkles } from 'lucide-react';
import { draftToExpense, priceDraft, unassigned, type Draft, type ScannedBill } from '@splitup/shared';
import { ApiError, api, qc, refresh } from '../api';
import { Speech, draftFromBill, openAi, pickedPhoto, registerPicker, shrink, useAi, type AiCtx } from '../ai';
import { money, usePrefs, useT, today } from '../i18n';
import { useDash, usePeople } from '../store';
import { Button, Modal, cx, inputCls, toast, toastError } from '../ui';
import BillEditor from './BillEditor';
import { CreditsPill, openCredits, setCredits } from './Credits';
import type { Credits } from '@splitup/shared';

type Msg = { role: 'user' | 'assistant'; content: string };
let dirty = false; // an unsaved bill is on screen: ask before throwing it away

export default function SmartSplit() {
  const ctx = useAi();
  const t = useT();
  const close = () => {
    if (dirty && !confirm(t('Discard this bill?'))) return;
    dirty = false;
    openAi(null);
  };
  return (
    <>
      <input ref={registerPicker} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickedPhoto(f); }} />
      <Modal open={!!ctx} onClose={close} wide title={<span className="flex items-center gap-2"><Sparkles size={20} className="text-marigold" /> {t('Smart split')} {ctx && <CreditsPill className="ml-1 font-sans" />}</span>}>
        {ctx && <Flow ctx={ctx} />}
      </Modal>
    </>
  );
}

function Flow({ ctx }: { ctx: AiCtx }) {
  const t = useT();
  const { lang } = usePrefs();
  const dash = useDash().data;
  const { name, me } = usePeople();
  const [where, setWhere] = useState(''); // start screen, opened from nowhere in particular: '' = let the AI work it out
  const [phase, setPhase] = useState<'start' | 'reading' | 'review'>('start');
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [chat, setChat] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [photo, setPhoto] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<string>(); // this bill's AI session: follow-ups don't cost a credit
  const run = useRef(0); // bumped on cancel, so a late answer is ignored
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);

  const setDraft = (d: Draft) => { dirty = d.items.length > 0; setDraftState(d); };
  const { left } = me.aiCredits;
  /** New bills need a credit; once this bill has a session, keep going for free. */
  const gate = (f: () => void) => (session || left > 0 ? f() : openCredits(true));
  const paid = (r: { session: string; credits: Credits }) => { setSession(r.session); setCredits(r.credits); };
  const failed = (e: unknown) => {
    qc.invalidateQueries({ queryKey: ['me'] }); // a failed request is refunded
    if (e instanceof ApiError && e.status === 402) openCredits(true);
    else toastError(e);
  };
  const fixedGroup = ctx.groupId ?? null;
  const groupId = fixedGroup ?? draft?.groupId ?? (where || null);
  const members = (gid: string) => dash?.groups.find((g) => g.id === gid)?.memberIds ?? [me.id];
  const other = (groupId ? members(groupId) : ctx.friendId ? [ctx.friendId] : dash?.friendIds ?? []).find((i) => i !== me.id);
  const buddy = other ? name(other).split(' ')[0] : 'Ram';

  const scan = async (file: File) => {
    const mine = ++run.current;
    setPhoto(URL.createObjectURL(file));
    setPhase('reading');
    try {
      const r = await api<{ bill: ScannedBill; session: string; credits: Credits }>('/ai/scan', { image: await shrink(file), session });
      paid(r);
      if (mine !== run.current) return;
      const { bill } = r;
      const peopleIds = groupId ? members(groupId) : [me.id, ...(ctx.friendId ? [ctx.friendId] : [])];
      setDraft(draftFromBill(bill, { groupId, peopleIds, me: me.id, today: today() }));
      setChat([{ role: 'assistant', content: t('Found {n} items. Tap who had what, or tell me: “{name} had the beer, we shared the rest”.', { n: bill.items.length, name: buddy }) }]);
      setPhase('review');
    } catch (e) {
      if (mine !== run.current) return;
      failed(e);
      setPhase(draft ? 'review' : 'start');
    }
  };

  const send = async (text: string) => {
    if (!session && left <= 0) { openCredits(true); return false; }
    const msgs: Msg[] = [...chat, { role: 'user', content: text }];
    setChat(msgs);
    setThinking(true);
    setPhase('review');
    try {
      const r = await api<{ reply: string; draft: Draft; session: string; credits: Credits }>('/ai/chat', { messages: msgs, draft, groupId, friendId: ctx.friendId ?? null, today: today(), lang, session });
      paid(r);
      setDraft(r.draft);
      setChat([...msgs, { role: 'assistant', content: r.reply }]);
      return true;
    } catch (e) {
      failed(e);
      setChat(chat);
      if (!draft && !chat.length) setPhase('start');
      return false;
    } finally {
      setThinking(false);
    }
  };

  // Opened with a photo or a message: get going straight away (once, even under StrictMode).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (ctx.photo) scan(ctx.photo);
    else if (ctx.message) send(ctx.message);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api('/expenses', draftToExpense(draft!));
      dirty = false;
      await refresh();
      toast(t('Expense added ✓'));
      openAi(null);
    } catch (e) { toastError(e); } finally { setSaving(false); }
  };

  const fileInputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scan(f); }} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scan(f); }} />
    </>
  );

  if (phase === 'reading') return <Reading photo={photo} onCancel={() => { run.current++; setPhase(draft ? 'review' : 'start'); }} />;

  if (phase === 'start') {
    return (
      <div className="space-y-5">
        {fileInputs}
        {fixedGroup || ctx.friendId ? (
          <p className="text-sm text-muted">{fixedGroup ? <>{t('In')} <b className="text-ink">{dash?.groups.find((g) => g.id === fixedGroup)?.name}</b></> : <>{t('With')} <b className="text-ink">{name(ctx.friendId!)}</b></>}</p>
        ) : (
          <label className="flex items-center gap-3 text-sm">
            <span className="shrink-0 font-medium text-muted">{t('Splitting in')}</span>
            <select value={where} onChange={(e) => setWhere(e.target.value)} className={cx(inputCls, 'h-10 flex-1')}>
              <option value="">✨ {t('Let AI work it out')}</option>
              {dash?.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}

        <div className="relative overflow-hidden rounded-3xl bg-[#1b1a17] p-5 text-[#fbf7f0]">
          <div className="dhaka absolute inset-x-0 top-0 h-1.5" />
          <div className="flex items-start gap-4 pt-1">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-marigold text-[#1b1a17]"><Camera size={28} /></span>
            <div>
              <p className="font-display text-xl font-bold">{t('Snap the bill')}</p>
              <p className="text-sm text-[#fbf7f0]/70">{t('AI reads every item and price, plus service charge and VAT. Then tap who had what.')}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="marigold" className="flex-1" onClick={() => gate(() => camera.current?.click())}><Camera size={18} /> {t('Take photo')}</Button>
            <Button className="bg-white/10 text-[#fbf7f0] hover:bg-white/15" onClick={() => gate(() => gallery.current?.click())}><ImageUp size={18} /> {t('Upload')}</Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t('or just tell me')}<span className="h-px flex-1 bg-line" /></div>

        <Composer onSend={send} busy={thinking} big autoFocus={!('ontouchstart' in window)}
          placeholder={t('e.g. Dinner at Thakali, I paid 3,450. {name} and I shared the momo…', { name: buddy })}
          examples={[
            t('Momo Rs 600 with {name}, I paid', { name: buddy }),
            t('Taxi Rs 900, split with everyone'),
            t('{name} paid 2k for lunch for all of us', { name: buddy }),
          ]} />
      </div>
    );
  }

  // review
  const hasItems = !!draft?.items.length;
  let problem = '';
  let total = 0;
  if (draft && hasItems) {
    const left = unassigned(draft).length;
    try {
      const p = priceDraft(draft);
      total = p?.total ?? 0;
      if (!p) problem = t('Assign the items to save');
      else if (p.paidGap) problem = t('Paid amounts must add up to {amount}', { amount: money(p.total, lang) });
    } catch { problem = t('The discount is bigger than the bill'); }
    if (left) problem = left === 1 ? t('Assign 1 more item to save') : t('Assign {n} more items to save', { n: left });
    else if (!draft.groupId && draft.peopleIds.filter((i) => i !== me.id).length === 0) problem = t('Add who you were with');
  }
  const last = [...chat].reverse().find((m) => m.role === 'assistant');

  return (
    <div className="space-y-5">
      {fileInputs}
      {hasItems ? (
        <BillEditor draft={draft!} onChange={setDraft} photo={photo} fixedGroup={!!fixedGroup} friendId={ctx.friendId} busy={thinking} />
      ) : (
        <Transcript chat={chat} thinking={thinking} />
      )}

      <div className="sticky -bottom-5 -mx-5 -mb-5 space-y-2.5 border-t border-line bg-bg/95 px-5 pb-4 pt-3 backdrop-blur">
        {hasItems && (thinking || last) && (
          <p className="flex items-start gap-2 text-sm">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-marigold" />
            {thinking ? <Dots /> : <span className="line-clamp-2">{last!.content}</span>}
          </p>
        )}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Composer onSend={send} busy={thinking} placeholder={hasItems ? t('Tell me who had what…') : t('Reply…')} />
          </div>
          {!hasItems && (
            <button onClick={() => gate(() => camera.current?.click())} className="grid size-[52px] shrink-0 place-items-center rounded-full bg-marigold text-[#1b1a17] cursor-pointer" aria-label={t('Scan a bill')}><Camera size={20} /></button>
          )}
        </div>
        {hasItems && (
          <Button size="lg" className="w-full" busy={saving} disabled={!!problem || thinking} onClick={save}>
            {problem || t('Save · {amount}', { amount: money(total, lang) })}
          </Button>
        )}
      </div>
    </div>
  );
}

const READING = ['Reading the items…', 'Finding service charge and VAT…', 'Adding it all up…', 'Almost there…'];
function Reading({ photo, onCancel }: { photo?: string; onCancel: () => void }) {
  const t = useT();
  const [k, setK] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setK((x) => Math.min(x + 1, READING.length - 1)), 1800);
    return () => clearInterval(i);
  }, []);
  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <div className="relative w-56 overflow-hidden rounded-3xl bg-[#1b1a17] p-3 shadow-xl">
        {photo && <img src={photo} alt="" className="max-h-80 w-full rounded-2xl object-contain opacity-80" />}
        <div className="scanner-frame pointer-events-none absolute inset-2" aria-hidden><span /><span /><span /><span /><i className="scanner-line" /></div>
      </div>
      <div aria-live="polite">
        <p className="font-display text-xl font-bold">{t(READING[k])}</p>
        <p className="mt-1 text-sm text-muted">{t('This takes a few seconds.')}</p>
      </div>
      <Button variant="ghost" onClick={onCancel}>{t('Cancel')}</Button>
    </div>
  );
}

function Transcript({ chat, thinking }: { chat: Msg[]; thinking: boolean }) {
  return (
    <div className="flex min-h-40 flex-col gap-2">
      {chat.map((m, i) => (
        <p key={i} className={cx('max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-sm', m.role === 'user' ? 'self-end rounded-br-md bg-ink text-on-ink' : 'self-start rounded-bl-md bg-surface-2')}>{m.content}</p>
      ))}
      {thinking && <p className="self-start rounded-3xl rounded-bl-md bg-surface-2 px-4 py-3"><Dots /></p>}
    </div>
  );
}

const Dots = () => (
  <span className="inline-flex gap-1 py-1.5" aria-label="…">
    {[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
  </span>
);

/** Text box for talking to the AI. Enter sends, Shift+Enter is a new line; the mic dictates where the browser supports it. */
function Composer({ onSend, busy, placeholder, examples, big, autoFocus }: {
  onSend: (text: string) => Promise<boolean>; busy: boolean; placeholder: string; examples?: string[]; big?: boolean; autoFocus?: boolean;
}) {
  const t = useT();
  const { lang } = usePrefs();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const rec = useRef<any>(null);
  useEffect(() => () => rec.current?.abort(), []);

  const submit = async () => {
    const v = text.trim();
    if (!v || busy) return;
    rec.current?.stop();
    setText('');
    if (!(await onSend(v))) setText(v);
  };
  const mic = () => {
    if (listening) return rec.current?.stop();
    const r = new Speech!();
    r.lang = lang === 'ne' ? 'ne-NP' : 'en-IN';
    r.interimResults = true;
    r.onresult = (e: any) => setText(Array.from(e.results as ArrayLike<any>).map((x) => x[0].transcript).join(''));
    r.onend = r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  return (
    <div className="space-y-2">
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex items-end gap-1 rounded-[26px] border border-line bg-surface p-1.5 pl-4 transition focus-within:border-ink">
        <textarea value={text} rows={big ? 3 : 1} autoFocus={autoFocus} placeholder={placeholder} aria-label={placeholder}
          onChange={(e) => setText(e.target.value)} maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          className="no-ring max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 leading-snug outline-none [field-sizing:content] placeholder:text-muted/70" />
        {Speech && (
          <button type="button" onClick={mic} aria-label={t('Speak')} aria-pressed={listening}
            className={cx('grid size-10 shrink-0 place-items-center rounded-full transition cursor-pointer', listening ? 'bg-owe text-white animate-pulse' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
            <Mic size={18} />
          </button>
        )}
        <button type="submit" disabled={!text.trim() || busy} aria-label={t('Send')}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-on-ink transition disabled:opacity-25 cursor-pointer">
          {busy ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : <ArrowUp size={18} strokeWidth={2.5} />}
        </button>
      </form>
      {examples && (
        <div className="flex flex-wrap gap-1.5">
          {examples.map((x) => (
            <button key={x} type="button" onClick={() => setText(x)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-ink cursor-pointer">{x}</button>
          ))}
        </div>
      )}
    </div>
  );
}

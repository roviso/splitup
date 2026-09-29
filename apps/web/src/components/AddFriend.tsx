import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, QrCode, RefreshCw, ScanLine, Search, Send, Share2, UserPlus } from 'lucide-react';
import { addUrl, api, prettyCode, qc, refresh, type Me } from '../api';
import { useT } from '../i18n';
import { celebrate } from '../live';
import { useMe } from '../store';
import { Avatar, Button, Field, Input, Modal, Segmented, cx, shareLink, toast, toastError, whatsapp } from '../ui';
import QR from './QR';
import Scanner from './Scanner';

export type AddTab = 'code' | 'scan' | 'find' | 'invite';
type Found = { person: { id: string; name: string; email: string | null }; isMe: boolean; isFriend: boolean; q: string };

export const inviteUrl = (token: string) => `${location.origin}/invite/${token}`;

/** Add a friend: show my QR, scan theirs, look them up, or invite someone who isn't on Split-Up yet. */
export default function AddFriend({ tab, onTab, onClose }: { tab: AddTab | null; onTab: (t: AddTab) => void; onClose: () => void }) {
  const t = useT();
  const [found, setFound] = useState<Found | null>(null);
  const close = () => { setFound(null); onClose(); };
  const show = (tb: AddTab) => { setFound(null); onTab(tb); };

  return (
    <Modal open={!!tab} onClose={close} title={t('Add friend')}>
      {tab && (
        <div className="space-y-5">
          <Segmented value={tab} onChange={show} options={[
            { value: 'code', label: <Tab icon={<QrCode size={15} />} label={t('My code')} /> },
            { value: 'scan', label: <Tab icon={<ScanLine size={15} />} label={t('Scan')} /> },
            { value: 'find', label: <Tab icon={<Search size={15} />} label={t('Find')} /> },
            { value: 'invite', label: <Tab icon={<Send size={15} />} label={t('Invite')} /> },
          ]} />
          {found ? <FoundCard found={found} onBack={() => setFound(null)} onDone={close} />
            : tab === 'code' ? <MyCode />
            : tab === 'scan' ? <ScanTab onFound={setFound} onClose={close} />
            : tab === 'find' ? <FindTab onFound={setFound} onInvite={() => show('invite')} />
            : <InviteTab onDone={close} />}
        </div>
      )}
    </Modal>
  );
}

const Tab = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <span className="flex items-center justify-center gap-1.5 whitespace-nowrap"><span className="hidden min-[430px]:inline">{icon}</span>{label}</span>
);

/** My personal QR + code. Friends scan it with the phone camera (opens /add/CODE) or inside Split-Up. */
export function MyCode({ compact }: { compact?: boolean }) {
  const t = useT();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  if (!me.friendCode) return null;
  const url = addUrl(me.friendCode);
  const reset = async () => {
    if (!confirm(t('Make a new code? Your old QR and link will stop working.'))) return;
    setBusy(true);
    try { qc.setQueryData(['me'], await api<Me>('/me/code/reset', {})); toast(t('New code ready')); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] bg-ink text-on-ink shadow-lg">
        <div className="dhaka" />
        <div className="flex flex-col items-center gap-4 p-6">
          <div className="flex items-center gap-3 self-stretch">
            <Avatar id={me.id} name={me.name} size={44} />
            <div className="min-w-0 text-left">
              <p className="truncate font-display text-lg font-bold">{me.name}</p>
              <p className="text-xs opacity-70">{t('Scan to split bills with me')}</p>
            </div>
          </div>
          <div className="code-glow rounded-[26px] p-[3px]">
            <div className="rounded-[23px] bg-white p-3"><QR text={url} size={compact ? 180 : 220} /></div>
          </div>
          <button onClick={async () => { await navigator.clipboard.writeText(prettyCode(me.friendCode!)); toast(t('Code copied')); }}
            className="flex items-center gap-2 rounded-full bg-on-ink/10 px-4 py-2 font-mono text-2xl font-bold tracking-[.2em] transition hover:bg-on-ink/20 cursor-pointer" aria-label={t('Copy code')}>
            {prettyCode(me.friendCode)} <Copy size={16} className="opacity-60" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="marigold" onClick={() => shareLink(t('Add me on Split-Up so we can split bills:'), url, t('Link copied'))}><Share2 size={16} /> {t('Share link')}</Button>
        <a href={whatsapp(null, `${t('Add me on Split-Up so we can split bills:')} ${url}`)} target="_blank" rel="noreferrer">
          <Button className="w-full bg-[#25D366]! text-white!"><Send size={16} /> WhatsApp</Button>
        </a>
      </div>
      {!compact && (
        <p className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>{t('Friends can scan this with their phone camera. No app needed.')}</span>
          <button onClick={reset} disabled={busy} className="flex shrink-0 items-center gap-1 font-semibold hover:text-ink cursor-pointer"><RefreshCw size={12} /> {t('New code')}</button>
        </p>
      )}
    </div>
  );
}

/** Pull a friend code (or a whole in-app link) out of whatever the camera read. */
function readScan(text: string): { code?: string; path?: string } {
  try {
    const u = new URL(text);
    if (u.origin === location.origin || /splitup/i.test(u.hostname)) {
      const add = u.pathname.match(/^\/add\/([\w-]+)/);
      if (add) return { code: add[1] };
      if (/^\/(join|invite)\//.test(u.pathname)) return { path: u.pathname };
    }
    return {};
  } catch {
    const code = text.toUpperCase().replace(/[^0-9A-Z]/g, '');
    return code.length === 8 ? { code } : {};
  }
}

async function lookup(q: string): Promise<Found> {
  return { ...(await api<Omit<Found, 'q'>>(`/people/lookup?q=${encodeURIComponent(q)}`)), q };
}

function ScanTab({ onFound, onClose }: { onFound: (f: Found) => void; onClose: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [key, setKey] = useState(0);
  const handle = async (text: string) => {
    const r = readScan(text);
    try {
      if (r.path) { onClose(); nav(r.path); return; } // a group invite QR works here too
      if (!r.code) throw new Error(t("That QR isn't a Split-Up code"));
      onFound(await lookup(r.code));
    } catch (e) { toastError(e); setKey(key + 1); } // restart the camera and keep scanning
  };
  return (
    <div className="space-y-3">
      <Scanner key={key} onScan={handle} />
      <p className="text-center text-xs text-muted">{t('Also reads group invite QR codes.')}</p>
    </div>
  );
}

function FindTab({ onFound, onInvite }: { onFound: (f: Found) => void; onInvite: () => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setMissing(false);
    try { onFound(await lookup(q.trim())); } catch (x) { if ((x as { status?: number }).status === 404) setMissing(true); else toastError(x); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('Friend code or email')} hint={t('Their code is on their Friends page, like 7KQ2-M9XP.')}>
        <Input autoFocus required value={q} onChange={(e) => { setQ(e.target.value); setMissing(false); }} placeholder="7KQ2-M9XP / name@gmail.com" autoCapitalize="characters" autoComplete="off" spellCheck={false} />
      </Field>
      {missing && (
        <div className="rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold">{q.includes('@') ? t('Nobody on Split-Up uses that email yet') : t('No one has that friend code')}</p>
          <p className="mt-1 text-muted">{t('Check for typos, or invite them. Their history links up when they join.')}</p>
          <Button type="button" size="sm" variant="soft" className="mt-3" onClick={onInvite}><Send size={14} /> {t('Invite instead')}</Button>
        </div>
      )}
      <Button type="submit" busy={busy} disabled={q.trim().length < 4} className="w-full"><Search size={16} /> {t('Find')}</Button>
    </form>
  );
}

function FoundCard({ found, onBack, onDone }: { found: Found; onBack: () => void; onDone: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const p = found.person;
  const add = async () => {
    setBusy(true);
    try {
      await api('/friends/connect', { q: found.q });
      await refresh();
      onDone();
      celebrate({ id: p.id, name: p.name, byMe: true });
    } catch (e) { toastError(e); setBusy(false); }
  };
  return (
    <div className="space-y-5 text-center animate-[fade_.3s]">
      <div className="mx-auto w-fit rounded-full bg-marigold-soft p-2"><Avatar id={p.id} name={p.name} size={96} /></div>
      <div>
        <p className="font-display text-2xl font-extrabold">{p.name}</p>
        {p.email && <p className="text-sm text-muted">{p.email}</p>}
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-owed-soft px-3 py-1 text-xs font-semibold text-owed">✓ {t('On Split-Up')}</p>
      </div>
      {found.isMe ? <p className="text-muted">{t("That's you! Share your code with a friend instead.")}</p>
        : found.isFriend ? <Button className="w-full" onClick={() => { onDone(); nav(`/friends/${p.id}`); }}>{t('Already friends. Open')}</Button>
        : <Button variant="marigold" size="lg" className="w-full" busy={busy} onClick={add}><UserPlus size={18} /> {t('Add {name}', { name: p.name.split(' ')[0] })}</Button>}
      <button onClick={onBack} className="text-sm font-semibold text-muted hover:text-ink cursor-pointer">{t('Back')}</button>
    </div>
  );
}

/** For people not on Split-Up yet: a placeholder you can split with now, plus a link to claim it. */
function InviteTab({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [added, setAdded] = useState<{ id: string; name: string; phone: string | null; inviteToken: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<{ id: string; name: string; phone: string | null; inviteToken: string | null; registered: boolean }>('/friends', { name: f.name, email: f.email || undefined, phone: f.phone || undefined });
      await refresh();
      if (p.inviteToken) setAdded(p);
      else { onDone(); celebrate({ id: p.id, name: p.name, byMe: true }); } // they were already on Split-Up
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  if (added?.inviteToken) {
    return (
      <div className="space-y-4">
        <p className="text-muted">{t('{name} is added. You can start splitting now. Send them this link so they can see it too.', { name: added.name })}</p>
        <a href={whatsapp(added.phone, t('Hey! I added you on Split-Up to split our bills: {url}', { url: inviteUrl(added.inviteToken) }))} target="_blank" rel="noreferrer">
          <Button className="w-full bg-[#25D366]! text-white!"><Send size={16} /> {t('Send on WhatsApp')}</Button>
        </a>
        <Button variant="soft" className="w-full" onClick={async () => { await navigator.clipboard.writeText(inviteUrl(added.inviteToken!)); toast(t('Invite link copied')); }}>{t('Copy invite link')}</Button>
        <Button variant="ghost" className="w-full" onClick={onDone}>{t('Done')}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <p className={cx('rounded-2xl bg-surface-2 p-3 text-sm text-muted')}>{t("Not on Split-Up yet? Add them by name and start splitting. When they join with this email or your invite link, everything links up.")}</p>
      <Field label={t('Name')}><Input required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label={t('Email (optional)')} hint={t('If they already use Split-Up, we link you right away.')}>
        <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label={t('Phone (optional)')}><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98XXXXXXXX" /></Field>
      <Button type="submit" busy={busy} className="w-full">{t('Add friend')}</Button>
    </form>
  );
}

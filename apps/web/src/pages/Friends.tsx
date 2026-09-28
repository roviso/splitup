import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookUser, Search, Send, UserPlus } from 'lucide-react';
import { parseContacts, type Contact } from '@splitup/shared';
import { api, byId, refresh } from '../api';
import { useT } from '../i18n';
import { useDash } from '../store';
import { Avatar, BalanceLine, Button, Card, Empty, Field, Input, Modal, PageHead, Spinner, cx, toast, toastError, whatsapp } from '../ui';

export const inviteUrl = (token: string) => `${location.origin}/invite/${token}`;

export default function Friends() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const { data, isPending } = useDash();
  if (isPending || !data) return <Spinner />;
  const people = byId(data.people);
  const bal = new Map(data.balances.map((b) => [b.userId, b.total]));
  // friends plus anyone I have a balance with (e.g. a group member)
  const ids = [...new Set([...data.friendIds, ...bal.keys()])];
  const list = ids.map((id) => people.get(id)!).filter(Boolean)
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Math.abs(bal.get(b.id) ?? 0) - Math.abs(bal.get(a.id) ?? 0) || a.name.localeCompare(b.name));

  return (
    <div>
      <PageHead title={t('Friends')} right={<>
        <Button variant="soft" onClick={() => setParams({ import: '1' })} aria-label={t('Import contacts')}><BookUser size={18} /><span className="hidden sm:inline">{t('Import')}</span></Button>
        <Button variant="marigold" onClick={() => setParams({ add: '1' })}><UserPlus size={18} /><span className="hidden sm:inline">{t('Add friend')}</span></Button>
      </>} />
      {ids.length ? (
        <>
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search friends')} className="pl-10" />
          </div>
          <Card className="divide-y divide-line overflow-hidden">
            {list.map((p) => (
              <Link key={p.id} to={`/friends/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                <Avatar id={p.id} name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{p.registered ? p.email ?? p.phone : <span className="text-marigold">● {t('Invite pending')}</span>}</span>
                </span>
                <BalanceLine amount={bal.get(p.id) ?? 0} />
              </Link>
            ))}
          </Card>
        </>
      ) : (
        <Empty icon="🤝" title={t('No friends yet')} text={t('Add friends by email or phone, or import your contacts.')}
          action={<div className="flex flex-wrap justify-center gap-2">
            <Button variant="marigold" onClick={() => setParams({ add: '1' })}><UserPlus size={18} /> {t('Add friend')}</Button>
            <Button variant="soft" onClick={() => setParams({ import: '1' })}><BookUser size={18} /> {t('Import contacts')}</Button>
          </div>} />
      )}
      <AddFriend open={params.has('add')} onClose={() => setParams({})} />
      <ImportContacts open={params.has('import')} onClose={() => setParams({})} />
    </div>
  );
}

function AddFriend({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [added, setAdded] = useState<{ name: string; phone: string | null; inviteToken: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setAdded(null); setF({ name: '', email: '', phone: '' }); onClose(); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api<{ name: string; phone: string | null; inviteToken: string | null }>('/friends', { name: f.name, email: f.email || undefined, phone: f.phone || undefined });
      await refresh();
      if (p.inviteToken) setAdded(p); else { toast(t('{name} added', { name: p.name })); close(); }
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={close} title={added ? t('Invite {name}', { name: added.name }) : t('Add friend')}>
      {added?.inviteToken ? (
        <div className="space-y-4">
          <p className="text-muted">{t('{name} is added. You can start splitting now — send them this link so they can see it too.', { name: added.name })}</p>
          <a href={whatsapp(added.phone, t('Hey! I added you on Split-Up to split our bills: {url}', { url: inviteUrl(added.inviteToken) }))} target="_blank" rel="noreferrer">
            <Button className="w-full bg-[#25D366]! text-white!"><Send size={16} /> {t('Send on WhatsApp')}</Button>
          </a>
          <Button variant="soft" className="w-full" onClick={async () => { await navigator.clipboard.writeText(inviteUrl(added.inviteToken!)); toast(t('Invite link copied')); }}>{t('Copy invite link')}</Button>
          <Button variant="ghost" className="w-full" onClick={close}>{t('Done')}</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('Name')}><Input required autoFocus maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t('Email (optional)')} hint={t('If they already use Split-Up, we link you right away.')}>
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={t('Phone (optional)')}><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98XXXXXXXX" /></Field>
          <Button type="submit" busy={busy} className="w-full">{t('Add friend')}</Button>
        </form>
      )}
    </Modal>
  );
}

function ImportContacts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [list, setList] = useState<(Contact & { on: boolean })[]>([]);
  const [busy, setBusy] = useState(false);
  const picker = 'contacts' in navigator && 'ContactsManager' in window;
  const close = () => { setList([]); onClose(); };
  const load = (cs: Contact[]) => cs.length ? setList(cs.map((c) => ({ ...c, on: true }))) : toast(t('No contacts with an email or phone found'), true);

  const pick = async () => {
    try {
      const got = await (navigator as any).contacts.select(['name', 'email', 'tel'], { multiple: true });
      load(parseContacts(['BEGIN:VCARD', ...got.flatMap((c: any) => [`FN:${c.name?.[0] ?? ''}`, c.email?.[0] && `EMAIL:${c.email[0]}`, c.tel?.[0] && `TEL:${c.tel[0]}`, 'END:VCARD', 'BEGIN:VCARD'])].join('\n')));
    } catch (e) { toastError(e); }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const chosen = list.filter((c) => c.on).map(({ on, ...c }) => c);
      let added = 0;
      for (let i = 0; i < chosen.length; i += 500) added += (await api<{ added: number }>('/friends/import', { contacts: chosen.slice(i, i + 500) })).added;
      await refresh();
      toast(t('{n} friends added', { n: added }));
      close();
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const on = list.filter((c) => c.on).length;

  return (
    <Modal open={open} onClose={close} title={t('Import contacts')}>
      {!list.length ? (
        <div className="space-y-4">
          <p className="text-muted">{t("Bring in the people you split with. We never message anyone — you choose who to invite.")}</p>
          {picker && <Button variant="marigold" className="w-full" onClick={pick}><BookUser size={18} /> {t('Choose from phone contacts')}</Button>}
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-line p-6 text-center hover:bg-surface-2">
            <span className="text-3xl">📇</span>
            <span className="font-semibold">{t('Upload a contacts file')}</span>
            <span className="text-xs text-muted">{t('.vcf from your phone, or .csv from Google Contacts / Outlook')}</span>
            <input type="file" accept=".vcf,.csv,text/vcard,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(parseContacts(await f.text())); }} />
          </label>
          <p className="text-xs text-muted">{t('On Android: Contacts app → Settings → Export → .vcf. On iPhone: share contacts from the Contacts app. The mobile app will import directly.')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{t('{n} of {total} selected', { n: on, total: list.length })}</span>
            <button className="font-semibold cursor-pointer" onClick={() => setList(list.map((c) => ({ ...c, on: on !== list.length })))}>{on === list.length ? t('Select none') : t('Select all')}</button>
          </div>
          <div className="max-h-[50dvh] space-y-1 overflow-y-auto">
            {list.map((c, i) => (
              <label key={i} className={cx('flex cursor-pointer items-center gap-3 rounded-2xl p-2', c.on && 'bg-marigold-soft')}>
                <input type="checkbox" checked={c.on} onChange={() => setList(list.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} className="size-4 accent-[var(--ink)]" />
                <span className="min-w-0"><span className="block truncate font-semibold">{c.name}</span><span className="block truncate text-xs text-muted">{c.email ?? c.phone}</span></span>
              </label>
            ))}
          </div>
          <Button className="w-full" busy={busy} disabled={!on} onClick={submit}>{t('Add {n} friends', { n: on })}</Button>
        </div>
      )}
    </Modal>
  );
}

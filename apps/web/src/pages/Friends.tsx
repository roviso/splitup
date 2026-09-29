import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookUser, QrCode, ScanLine, Search, UserPlus } from 'lucide-react';
import { parseContacts, type Contact } from '@splitup/shared';
import { api, byId, prettyCode, refresh } from '../api';
import { useT } from '../i18n';
import { useDash, useMe } from '../store';
import { Avatar, BalanceLine, Button, Card, Empty, Input, Modal, PageHead, Spinner, cx, toast, toastError } from '../ui';
import AddFriend, { type AddTab } from '../components/AddFriend';

export { inviteUrl } from '../components/AddFriend';
const TABS: AddTab[] = ['code', 'scan', 'find', 'invite'];

export default function Friends() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const { data, isPending } = useDash();
  const me = useMe();
  if (isPending || !data) return <Spinner />;
  const people = byId(data.people);
  const add = params.get('add');
  const tab = add === null ? null : TABS.includes(add as AddTab) ? (add as AddTab) : 'find';
  const openAdd = (tb: AddTab) => setParams({ add: tb }, { replace: tab !== null });
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
        <Button variant="marigold" onClick={() => openAdd('find')}><UserPlus size={18} /><span className="hidden sm:inline">{t('Add friend')}</span></Button>
      </>} />
      {me.friendCode && (
        <div className="mb-5 flex items-center gap-3 overflow-hidden rounded-3xl bg-ink p-3 pl-4 text-on-ink">
          <button onClick={() => openAdd('code')} className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer">
            <span className="code-glow shrink-0 rounded-2xl p-[2px]"><span className="grid size-11 place-items-center rounded-[14px] bg-ink"><QrCode size={24} /></span></span>
            <span className="min-w-0">
              <span className="block text-xs opacity-70">{t('Your friend code')}</span>
              <span className="block truncate font-mono text-lg font-bold tracking-[.15em]">{prettyCode(me.friendCode)}</span>
            </span>
          </button>
          <Button variant="marigold" size="sm" onClick={() => openAdd('scan')}><ScanLine size={16} /> {t('Scan')}</Button>
        </div>
      )}
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
        <Empty icon="🤝" title={t('No friends yet')} text={t('Scan a friend’s code, show them yours, or find them by email.')}
          action={<div className="flex flex-wrap justify-center gap-2">
            <Button variant="marigold" onClick={() => openAdd('scan')}><ScanLine size={18} /> {t('Scan a code')}</Button>
            <Button variant="soft" onClick={() => openAdd('find')}><UserPlus size={18} /> {t('Add friend')}</Button>
            <Button variant="soft" onClick={() => setParams({ import: '1' })}><BookUser size={18} /> {t('Import contacts')}</Button>
          </div>} />
      )}
      <AddFriend tab={tab} onTab={openAdd} onClose={() => setParams({})} />
      <ImportContacts open={params.has('import')} onClose={() => setParams({})} />
    </div>
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

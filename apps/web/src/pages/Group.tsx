import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, HandCoins, Link2, LogOut, Plus, Settings, Trash2, UserPlus } from 'lucide-react';
import { GROUP_TYPES } from '@splitup/shared';
import { api, myNet, refresh, type GroupDetail } from '../api';
import { money, usePrefs, useT } from '../i18n';
import { openExpense, openSettle, usePeople } from '../store';
import { Avatar, Avatars, Button, Card, Empty, Field, Input, Modal, Money, PageHead, Segmented, Spinner, Toggle, cx, shareLink, toast, toastError } from '../ui';
import { Ledger } from '../components/Rows';
import PersonPicker from '../components/PersonPicker';
import { GROUP_EMOJI } from './Groups';

export default function Group() {
  const { id } = useParams();
  const t = useT();
  const { lang } = usePrefs();
  const [tab, setTab] = useState<'expenses' | 'balances'>('expenses');
  const [settings, setSettings] = useState(false);
  const q = useQuery({ queryKey: ['group', id], queryFn: () => api<GroupDetail>(`/groups/${id}`) });
  const { name, obj, full, get, me } = usePeople(q.data?.people);
  if (q.error) return <Empty icon="🤷" title={t('Group not found')} action={<Link to="/groups"><Button variant="soft">{t('Back to groups')}</Button></Link>} />;
  if (!q.data) return <Spinner />;
  const { group, expenses, settlements, debts, people } = q.data;

  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const mine = expenses.reduce((a, e) => a + (e.shares.find((s) => s.userId === me.id)?.amount ?? 0), 0);
  const myBal = debts.reduce((a, d) => a + (d.to === me.id ? d.amount : d.from === me.id ? -d.amount : 0), 0);
  const members = group.memberIds.map((i) => get(i)).filter((p) => !!p);

  return (
    <div>
      <PageHead
        back={<Link to="/groups" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} /> {t('Groups')}</Link>}
        title={<span className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-marigold-soft text-3xl">{GROUP_EMOJI[group.type] ?? '👥'}</span>{group.name}</span>}
        sub={<span className="mt-2 flex items-center gap-2"><Avatars people={members} max={6} /> <span className="text-sm">{t('{n} members', { n: members.length })}</span></span>}
        right={<Button variant="soft" onClick={() => setSettings(true)} aria-label={t('Group settings')}><Settings size={18} /></Button>}
      />

      <div className="mb-6 grid grid-cols-3 gap-2 text-center">
        <Stat label={t('Your balance')} value={<Money amount={myBal} />} />
        <Stat label={t('Group spend')} value={<span className="font-semibold">{money(total, lang)}</span>} />
        <Stat label={t('Your share')} value={<span className="font-semibold">{money(mine, lang)}</span>} />
      </div>

      <div className="mb-6 flex gap-2">
        <Button variant="marigold" className="flex-1" onClick={() => openExpense({ groupId: group.id })}><Plus size={18} /> {t('Add expense')}</Button>
        <Button variant="soft" className="flex-1" onClick={() => openSettle({ groupId: group.id })}><HandCoins size={18} /> {t('Settle up')}</Button>
      </div>

      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[{ value: 'expenses', label: t('Expenses') }, { value: 'balances', label: t('Balances') }]} /></div>

      {tab === 'expenses' ? (
        expenses.length || settlements.length ? <Ledger expenses={expenses} settlements={settlements} people={people} /> : (
          <Empty icon="🧾" title={t('No expenses yet')} text={t('Add the first bill — momo, taxi, hotel, anything.')}
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button variant="marigold" onClick={() => openExpense({ groupId: group.id })}>{t('Add expense')}</Button>
              <Button variant="soft" onClick={() => shareLink(t('Join "{name}" on Split-Up', { name: group.name }), `${location.origin}/join/${group.inviteCode}`, t('Invite link copied'))}><Link2 size={16} /> {t('Invite link')}</Button>
            </div>} />
        )
      ) : (
        <div className="space-y-4">
          {debts.length ? (
            <Card className="divide-y divide-line overflow-hidden">
              {debts.map((d) => (
                <div key={d.from + d.to} className="flex items-center gap-3 px-4 py-3">
                  <Avatar id={d.from} name={full(d.from)} size={34} />
                  <p className="min-w-0 flex-1 text-sm">
                    <b>{d.from === me.id ? t('You owe {name}', { name: name(d.to) }) : t('{from} owes {to}', { from: name(d.from), to: obj(d.to) })}</b>
                    <span className="block text-base font-semibold text-owe">{money(d.amount, lang)}</span>
                  </p>
                  <Button size="sm" variant={d.from === me.id || d.to === me.id ? 'ink' : 'soft'} onClick={() => openSettle({ groupId: group.id, from: d.from, to: d.to, amount: d.amount })}>{t('Settle')}</Button>
                </div>
              ))}
            </Card>
          ) : <p className="rounded-3xl bg-owed-soft px-5 py-4 font-medium text-owed">✨ {t('Everyone is settled up in this group.')}</p>}
          {group.simplify && debts.length > 0 && <p className="px-1 text-xs text-muted">{t('Debts are simplified to the fewest payments.')}</p>}
          <Card className="divide-y divide-line overflow-hidden">
            {members.map((m) => {
              const bal = debts.reduce((a, d) => a + (d.to === m.id ? d.amount : d.from === m.id ? -d.amount : 0), 0);
              const paid = expenses.reduce((a, e) => a + myNet({ payers: e.payers, shares: [] }, m.id), 0);
              return (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar id={m.id} name={m.name} size={34} />
                  <p className="min-w-0 flex-1"><span className="block truncate font-semibold">{name(m.id)}</span><span className="text-xs text-muted">{t('paid {amount} in total', { amount: money(paid, lang) })}</span></p>
                  <span className="text-right text-sm">
                    <span className={cx('block text-xs', bal > 0 ? 'text-owed' : bal < 0 ? 'text-owe' : 'text-muted')}>{bal > 0 ? t('gets back') : bal < 0 ? t('has to pay') : t('settled up')}</span>
                    {!!bal && <Money amount={bal} />}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
      <GroupSettings open={settings} onClose={() => setSettings(false)} data={q.data} />
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-2xl border border-line bg-surface px-2 py-3 [&_span]:whitespace-nowrap [&_span]:text-[15px] sm:[&_span]:text-lg"><p className="text-xs text-muted">{label}</p>{value}</div>
);

function GroupSettings({ open, onClose, data }: { open: boolean; onClose: () => void; data: GroupDetail }) {
  const t = useT();
  const nav = useNavigate();
  const { lang } = usePrefs();
  const { group, expenses, people } = data;
  const { name, full, me } = usePeople(people);
  const [title, setTitle] = useState(group.name);
  const [adding, setAdding] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const link = `${location.origin}/join/${group.inviteCode}`;

  const act = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await f(); await refresh(); if (ok) toast(ok); } catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const patch = (body: object) => act(() => api(`/groups/${group.id}`, body, 'PATCH'), t('Saved'));

  const exportCsv = () => {
    const cols = group.memberIds;
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [['Date', 'Description', 'Category', 'Amount', ...cols.map(name)].map(esc).join(',')];
    for (const e of expenses) lines.push([e.date, esc(e.description), e.category, (e.amount / 100).toFixed(2), ...cols.map((c) => (myNet(e, c) / 100).toFixed(2))].join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
    a.download = `${group.name}.csv`;
    a.click();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('Group settings')}>
      <div className="space-y-6">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); patch({ name: title }); }}>
          <div className="flex-1"><Field label={t('Group name')}><Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field></div>
          <Button type="submit" variant="soft" busy={busy} disabled={title === group.name || !title.trim()}>{t('Save')}</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {GROUP_TYPES.map((g) => (
            <button key={g} onClick={() => patch({ type: g })} className={cx('grid size-11 place-items-center rounded-2xl border text-2xl cursor-pointer', group.type === g ? 'border-ink bg-marigold-soft' : 'border-line')}>{GROUP_EMOJI[g]}</button>
          ))}
        </div>
        <Toggle checked={group.simplify} onChange={(v) => patch({ simplify: v })} label={<><b>{t('Simplify debts')}</b><br /><span className="text-xs text-muted">{t('Fewer payments: A owes B, B owes C → A pays C.')}</span></>} />

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted">{t('Invite with a link')}</p>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} className="text-sm" />
            <Button variant="soft" onClick={() => shareLink(t('Join "{name}" on Split-Up', { name: group.name }), link, t('Invite link copied'))}><Link2 size={16} /></Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-muted">{t('Members')}</p>
          {group.memberIds.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Avatar id={id} name={full(id)} size={32} />
              <span className="flex-1 font-semibold">{name(id)}</span>
              {(id === me.id || group.createdBy === me.id) && (
                <Button size="sm" variant="ghost" onClick={() => confirm(id === me.id ? t('Leave this group?') : t('Remove {name}?', { name: name(id) })) &&
                  act(async () => { await api(`/groups/${group.id}/members/${id}`, undefined, 'DELETE'); if (id === me.id) nav('/groups'); })}>
                  {id === me.id ? <><LogOut size={14} /> {t('Leave')}</> : t('Remove')}
                </Button>
              )}
            </div>
          ))}
          <details className="rounded-2xl border border-line p-3">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold"><UserPlus size={16} /> {t('Add members')}</summary>
            <div className="mt-3 space-y-3">
              <PersonPicker selected={adding} onChange={setAdding} exclude={group.memberIds} />
              <Button className="w-full" busy={busy} disabled={!adding.length} onClick={() => act(async () => { await api(`/groups/${group.id}/members`, { userIds: adding }); setAdding([]); }, t('Members added'))}>
                {t('Add {n} to group', { n: adding.length })}
              </Button>
            </div>
          </details>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-5">
          <Button variant="soft" onClick={exportCsv} disabled={!expenses.length}><Download size={16} /> {t('Export CSV')}</Button>
          {group.createdBy === me.id && (
            <Button variant="danger" onClick={() => {
              if (prompt(t('This deletes the group and all its {n} expenses for everyone. Type the group name to confirm.', { n: expenses.length })) !== group.name) return;
              act(async () => { await api(`/groups/${group.id}`, undefined, 'DELETE'); nav('/groups'); }, t('Group deleted'));
            }}><Trash2 size={16} /> {t('Delete group')}</Button>
          )}
        </div>
        <p className="text-xs text-muted">{t('Total spent: {amount}', { amount: money(expenses.reduce((a, e) => a + e.amount, 0), lang) })}</p>
      </div>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { GROUP_TYPES } from '@splitup/shared';
import { api, byId, refresh } from '../api';
import { useT } from '../i18n';
import { useDash } from '../store';
import { Avatars, BalanceLine, Button, Card, Empty, Field, Input, Modal, PageHead, Spinner, Toggle, cx, toastError } from '../ui';
import PersonPicker from '../components/PersonPicker';

export const GROUP_EMOJI: Record<string, string> = { trip: '🏔️', home: '🏠', couple: '💞', food: '🥟', office: '💼', other: '👥' };
const TYPE_LABEL: Record<string, string> = { trip: 'Trip', home: 'Home', couple: 'Couple', food: 'Food gang', office: 'Office', other: 'Other' };

export default function Groups() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { data, isPending } = useDash();
  if (isPending || !data) return <Spinner />;
  const people = byId(data.people);
  const creating = params.has('new');

  return (
    <div>
      <PageHead title={t('Groups')} right={<Button variant="marigold" onClick={() => setParams({ new: '1' })}><Plus size={18} /> {t('New group')}</Button>} />
      {data.groups.length ? (
        <div className="grid gap-3 md:grid-cols-2 stagger">
          {data.groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`}>
              <Card className="flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-marigold-soft text-3xl">{GROUP_EMOJI[g.type] ?? '👥'}</span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="truncate font-display text-lg font-bold">{g.name}</p>
                  <Avatars people={g.memberIds.map((id) => people.get(id)).filter((p) => !!p)} size={24} />
                </div>
                <BalanceLine amount={g.balance} />
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon="🏔️" title={t('No groups yet')} text={t('Groups keep trips, flats and regular hangouts tidy.')}
          action={<Button variant="marigold" onClick={() => setParams({ new: '1' })}>{t('Create a group')}</Button>} />
      )}
      <NewGroup open={creating} onClose={() => setParams({})} />
    </div>
  );
}

function NewGroup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('trip');
  const [members, setMembers] = useState<string[]>([]);
  const [simplify, setSimplify] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>('/groups', { name, type, memberIds: members, simplify });
      await refresh();
      setName(''); setMembers([]);
      nav(`/groups/${id}`);
    } catch (err) { toastError(err); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('New group')}>
      <form onSubmit={submit} className="space-y-5">
        <Field label={t('Group name')}>
          <Input required autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Pokhara trip, Flat 4B, Friday momo')} />
        </Field>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-muted">{t('Type')}</span>
          <div className="flex flex-wrap gap-2">
            {GROUP_TYPES.map((g) => (
              <button type="button" key={g} onClick={() => setType(g)}
                className={cx('rounded-full border px-3 py-1.5 text-sm font-semibold transition cursor-pointer', type === g ? 'border-ink bg-ink text-on-ink' : 'border-line hover:bg-surface-2')}>
                {GROUP_EMOJI[g]} {t(TYPE_LABEL[g])}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-muted">{t('Members')}</span>
          <PersonPicker selected={members} onChange={setMembers} />
        </div>
        <Toggle checked={simplify} onChange={setSimplify} label={<><b>{t('Simplify debts')}</b><br /><span className="text-xs text-muted">{t('Fewer payments: A owes B, B owes C → A pays C.')}</span></>} />
        <Button type="submit" busy={busy} className="w-full">{t('Create group')}</Button>
      </form>
    </Modal>
  );
}

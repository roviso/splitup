import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Banknote, Eye, Ghost, LogIn, Pencil, Receipt, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from 'lucide-react';
import { CATEGORIES, type Category } from '@splitup/shared';
import { createStore, cx } from '../ui';
import { ago, rs, type FeedItem, type Who } from './kit';

export const [useExpenseDrawer, openExpenseDrawer] = createStore<string | null>(null);

const ACTIONS: Record<string, string> = {
  'admin.user.edit': 'edited the profile of', 'admin.user.role.admin': 'made an admin:', 'admin.user.role.user': 'removed admin rights from',
  'admin.user.credits': 'changed AI credits for', 'admin.user.suspend': 'suspended', 'admin.user.unsuspend': 'unsuspended',
  'admin.user.logout': 'signed out', 'admin.user.password': 'set a new password for', 'admin.user.message': 'messaged',
  'admin.user.anonymize': 'anonymized', 'admin.user.delete': 'deleted the account of',
  'admin.impersonate.start': 'started viewing as', 'admin.impersonate.stop': 'stopped viewing as', 'admin.impersonate.write': 'made a change while viewing as',
  'admin.group.edit': 'edited a group', 'admin.group.delete': 'deleted a group', 'admin.group.member.add': 'added a member to a group', 'admin.group.member.remove': 'removed a member from a group',
  'admin.expense.delete': 'deleted an expense', 'admin.expense.purge': 'permanently deleted an expense', 'admin.expense.restore': 'restored an expense',
  'admin.settlement.delete': 'deleted a payment', 'admin.settlement.restore': 'restored a payment',
  'admin.broadcast': 'sent a message to everyone', 'admin.credits.gift_all': 'gifted AI credits to everyone', 'admin.export': 'exported data',
};
/** Settings changes read as what happened: "paused sign-ups", "turned maintenance mode on". */
function settingText(key: string, to: any) {
  if (key === 'aiEnabled') return to ? 'switched AI on' : 'switched AI off';
  if (key === 'signupsEnabled') return to ? 'opened sign-ups' : 'paused sign-ups';
  if (key === 'maintenance') return to?.active ? 'turned maintenance mode on' : 'turned maintenance mode off';
  if (key === 'announcement') return to?.active ? 'put up an announcement' : 'took down the announcement';
  return `changed the “${key}” setting`;
}
export const actionText = (a: string, data?: Record<string, any>) => ACTIONS[a] ?? (a.startsWith('admin.settings.') ? settingText(a.slice(15), data?.to) : a);

const TONE = { users: 'bg-owed-soft text-owed', money: 'bg-marigold-soft text-ink', groups: 'bg-surface-2 text-ink', ai: 'bg-marigold-soft text-ink', auth: 'bg-surface-2 text-muted', admin: 'bg-ink text-on-ink' } as const;

export function describe(i: FeedItem, who: Who, groups: Record<string, string>) {
  const d = i.data;
  const P = ({ id }: { id: string | null | undefined }) =>
    id ? <Link to={`/admin/users/${id}`} className="font-semibold hover:underline">{who[id]?.name ?? 'Someone'}</Link> : <b>Someone</b>;
  const G = d.groupId ? <> in <Link to={`/admin/groups/${d.groupId}`} className="font-semibold hover:underline">{groups[d.groupId] ?? 'a group'}</Link></> : null;
  const E = ({ children }: { children: ReactNode }) => <button onClick={() => i.target && openExpenseDrawer(i.target)} className="font-semibold hover:underline cursor-pointer">{children}</button>;
  let icon = Receipt, text: ReactNode, amount: number | null = null, meta: string | null = null;
  switch (i.kind) {
    case 'signup': icon = UserPlus; text = <><P id={i.actor} /> joined Split-Up</>; meta = d.email ?? null; break;
    case 'placeholder': icon = Ghost; text = <><P id={i.actor} /> added <b>{d.name}</b>, who isn’t on Split-Up yet</>; break;
    case 'group_created': icon = Users; text = <><P id={i.actor} /> created <Link to={`/admin/groups/${i.target}`} className="font-semibold hover:underline">{d.name}</Link></>; meta = d.type; break;
    case 'expense_added': text = <><P id={i.actor} /> added <E>“{d.description}”</E>{G}</>; amount = d.amount; meta = `${CATEGORIES[d.category as Category] ?? ''} ${d.splitType}`; break;
    case 'expense_updated': icon = Pencil; text = <><E>“{d.description}”</E> was edited{G}</>; amount = d.amount; break;
    case 'expense_deleted': icon = Trash2; text = <><E>“{d.description}”</E> was deleted{G}</>; amount = d.amount; break;
    case 'settlement': icon = Banknote; text = <><P id={d.from} /> paid <P id={d.to} />{G}</>; amount = d.amount; meta = d.method; break;
    case 'settlement_deleted': icon = Trash2; text = <>A payment from <P id={d.from} /> to <P id={d.to} /> was deleted</>; amount = d.amount; break;
    case 'ai_bill': icon = Sparkles; text = <><P id={i.actor} /> split a bill with AI</>; meta = `${d.bucket} credit · ${d.turns} turn${d.turns === 1 ? '' : 's'}`; break;
    case 'login': icon = LogIn; text = <><P id={i.actor} /> signed in</>; meta = [d.method, d.ip].filter(Boolean).join(' · '); break;
    default: {
      icon = i.kind.startsWith('admin.impersonate') ? Eye : ShieldCheck;
      const target = d.targetType === 'user' && i.target ? <> <P id={i.target} /></> : null;
      text = <><P id={i.actor} /> {actionText(i.kind, d)}{target}</>;
      meta = d.message ?? d.description ?? d.name ?? (i.kind === 'admin.settings.announcement' && d.to?.active ? d.to.text : null) ?? null;
      if (typeof d.amount === 'number' && i.kind !== 'admin.credits.gift_all') amount = d.amount;
    }
  }
  return { icon, text, amount, meta };
}

export function FeedList({ items, who, groups, fresh, dense }: { items: FeedItem[]; who: Who; groups: Record<string, string>; fresh?: Set<string>; dense?: boolean }) {
  if (!items.length) return <p className="px-5 py-10 text-center text-sm text-muted">Nothing has happened yet</p>;
  return (
    <ul className="divide-y divide-line">
      {items.map((i) => {
        const k = `${i.kind}:${i.target}:${i.at}`;
        const { icon: Icon, text, amount, meta } = describe(i, who, groups);
        return (
          <li key={k} className={cx('flex items-start gap-3 px-5', dense ? 'py-2.5' : 'py-3', fresh?.has(k) && 'flash')}>
            <span className={cx('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', TONE[i.cat as keyof typeof TONE] ?? TONE.auth)}><Icon size={15} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">{text}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{ago(i.at)}{meta ? ` · ${meta}` : ''}</p>
            </div>
            {amount !== null && <span className="shrink-0 text-sm font-semibold tabular-nums">{rs(amount)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
export const feedKey = (i: FeedItem) => `${i.kind}:${i.target}:${i.at}`;

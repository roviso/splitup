import { useQuery } from '@tanstack/react-query';
import { api, type Dashboard, type Expense, type Me, type Part, type Person } from './api';
import { createStore } from './ui';
import { useT } from './i18n';

// While logged out, don't re-check on tab focus/reconnect: a refetch puts the query back in "pending",
// which swaps the login screen for a spinner and wipes a half-finished sign-in (e.g. while reading the code in Gmail).
const whenLoggedIn = (q: { state: { data: unknown } }) => q.state.data !== undefined;
export const useMeQuery = () => useQuery({
  queryKey: ['me'], queryFn: () => api<Me>('/me'), refetchOnWindowFocus: whenLoggedIn, refetchOnReconnect: whenLoggedIn,
});
/** Only used inside the logged-in shell, where `me` is guaranteed. */
export const useMe = () => useMeQuery().data!;
export const useDash = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
export type Config = { googleClientId: string | null; googleRedirect: boolean; ai: boolean };
export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api<Config>('/config'), staleTime: Infinity });

/** Name lookup across everyone we know about, with "You" for me. */
export function usePeople(extra: Person[] = []) {
  const me = useMe();
  const t = useT();
  const dash = useDash().data;
  const map = new Map<string, Person>();
  for (const p of [...(dash?.people ?? []), ...extra]) map.set(p.id, p);
  const get = (id: string) => map.get(id);
  const full = (id: string) => (id === me.id ? me.name : map.get(id)?.name ?? '?');
  const name = (id: string) => (id === me.id ? t('You') : full(id));
  /** For the middle of a sentence: "Hari paid you". */
  const obj = (id: string) => (id === me.id ? t('you') : full(id));
  return { map, get, name, obj, full, me };
}

export type ExpenseCtx = { groupId?: string | null; friendId?: string; expense?: Expense };
export const [useExpenseModal, openExpense] = createStore<ExpenseCtx | null>(null);

export type SettleCtx = { groupId: string | null; from?: string; to?: string; amount?: number; parts?: Part[] };
export const [useSettleModal, openSettle] = createStore<SettleCtx | null>(null);

export const [useExpenseDetail, openDetail] = createStore<{ expense: Expense; people: Person[] } | null>(null);

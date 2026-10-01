import { QueryClient } from '@tanstack/react-query';
import type { Debt, Portion, Category, Credits } from '@splitup/shared';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
  const r = await fetch('/api' + path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'Something went wrong');
  return j as T;
}

export const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
  },
});
/** Any write can move balances everywhere, so refresh everything. */
export const refresh = () => qc.invalidateQueries();

export type Me = {
  id: string; name: string; email: string | null; phone: string | null; registered: boolean;
  locale: 'en' | 'ne'; calendar: 'ad' | 'bs'; esewaId: string | null; khaltiId: string | null; paymentQr: string | null; hasPassword: boolean;
  friendCode: string | null;
  aiCredits: Credits; canRedeem: boolean;
  role: 'user' | 'admin'; username: string | null;
  /** Set when an admin is viewing the app as this user. */
  impersonatedBy: string | null;
};
export type Person = {
  id: string; name: string; email: string | null; phone: string | null; registered: boolean;
  esewaId: string | null; khaltiId: string | null; hasQr: boolean; inviteToken: string | null;
};
export type Group = { id: string; name: string; type: string; simplify: boolean; createdBy: string; createdAt: string; memberIds: string[] };
export type Expense = {
  id: string; groupId: string | null; description: string; amount: number; category: Category; date: string;
  splitType: 'equal' | 'exact' | 'percent' | 'shares' | 'itemized'; meta: Record<string, any> | null; notes: string | null;
  createdBy: string; createdAt: string; updatedAt: string | null; deletedAt: string | null; payers: Portion[]; shares: Portion[];
};
export type Settlement = {
  id: string; groupId: string | null; fromUser: string; toUser: string; amount: number; method: string;
  note: string | null; date: string; createdBy: string; createdAt: string; confirmedAt: string | null; deletedAt: string | null;
};
export type Part = { groupId: string | null; amount: number };
export type Dashboard = {
  people: Person[]; friendIds: string[];
  balances: { userId: string; total: number; parts: Part[] }[];
  groups: (Group & { balance: number })[];
  totals: { owed: number; owe: number };
};
export type GroupDetail = { group: Group & { inviteCode: string }; expenses: Expense[]; settlements: Settlement[]; debts: Debt[]; people: Person[] };
export type FriendDetail = {
  friend: Person; isFriend: boolean; balance: number; parts: (Part & { groupName: string | null })[];
  expenses: Expense[]; settlements: Settlement[]; people: Person[]; groups: { id: string; name: string }[];
};
export type Activity = {
  items: ({ kind: 'expense'; at: string; data: Expense } | { kind: 'settlement'; at: string; data: Settlement })[];
  groups: { id: string; name: string }[]; people: Person[];
};

export type Notice = {
  id: string; kind: string; actorId: string | null; createdAt: string; readAt?: string | null;
  data: {
    groupId?: string | null; group?: string | null; name?: string; amount?: number; net?: number; description?: string;
    expenseId?: string; settlementId?: string; from?: string; to?: string; method?: string; credits?: number; message?: string;
  };
};
export type Inbox = { items: Notice[]; unread: number; people: Person[] };

/** "AB2CD3EF" → "AB2C-D3EF" */
export const prettyCode = (c: string) => c.replace(/^(.{4})(.{4})$/, '$1-$2');
export const addUrl = (code: string) => `${location.origin}/add/${code}`;

/** My net position in one expense: positive = I lent, negative = I borrowed. */
export const myNet = (e: Pick<Expense, 'payers' | 'shares'>, me: string) =>
  e.payers.filter((p) => p.userId === me).reduce((a, p) => a + p.amount, 0) - e.shares.filter((s) => s.userId === me).reduce((a, s) => a + s.amount, 0);

export const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

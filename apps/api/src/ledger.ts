import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { ledgerDebts, type Debt, type Portion } from '@splitup/shared';
import { db } from './db';
import { expenses, expensePayers, expenseShares, friendships, groupMembers, groups, settlements, users } from './schema';

export const pair = (a: string, b: string) => (a < b ? { userA: a, userB: b } : { userA: b, userB: a });

export async function friendIds(me: string) {
  const rows = await db.select().from(friendships).where(or(eq(friendships.userA, me), eq(friendships.userB, me)));
  return rows.map((r) => (r.userA === me ? r.userB : r.userA));
}

export async function myGroups(me: string) {
  return db.select({ id: groups.id, name: groups.name, type: groups.type, simplify: groups.simplify, createdBy: groups.createdBy, createdAt: groups.createdAt })
    .from(groups).innerJoin(groupMembers, and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, me)))
    .orderBy(groups.createdAt);
}

export async function memberIds(groupId: string) {
  return (await db.select({ id: groupMembers.userId }).from(groupMembers).where(eq(groupMembers.groupId, groupId))).map((r) => r.id);
}

/** Friends, or members of a shared group. */
export async function related(me: string, other: string) {
  if (me === other) return true;
  const rows = await db.execute(sql`
    select 1 from friendships where user_a = ${pair(me, other).userA} and user_b = ${pair(me, other).userB}
    union all
    select 1 from group_members a join group_members b on a.group_id = b.group_id where a.user_id = ${me} and b.user_id = ${other}
    limit 1`);
  return rows.length > 0;
}

export const involved = (me: string) => or(
  inArray(expenses.id, db.select({ id: expensePayers.expenseId }).from(expensePayers).where(eq(expensePayers.userId, me))),
  inArray(expenses.id, db.select({ id: expenseShares.expenseId }).from(expenseShares).where(eq(expenseShares.userId, me))),
);
/** Expenses `me` may see: everything in their groups, plus non-group expenses they're part of. */
export const visibleExpense = (me: string, gids: string[]) => or(inArray(expenses.groupId, gids), and(isNull(expenses.groupId), involved(me)))!;
export const visibleSettlement = (me: string, gids: string[]) => and(
  isNull(settlements.deletedAt),
  or(inArray(settlements.groupId, gids), and(isNull(settlements.groupId), or(eq(settlements.fromUser, me), eq(settlements.toUser, me)))),
)!;

// ponytail: loads every expense in the user's groups per request; add pagination/materialized balances past ~10k expenses per user.
export async function loadExpenses(where: SQL) {
  const portions = (t: typeof expensePayers | typeof expenseShares) =>
    db.select({ expenseId: t.expenseId, userId: t.userId, amount: t.amount }).from(t).innerJoin(expenses, eq(expenses.id, t.expenseId)).where(where);
  const [rows, payers, shares] = await Promise.all([
    db.select().from(expenses).where(where).orderBy(sql`${expenses.date} desc, ${expenses.createdAt} desc`),
    portions(expensePayers),
    portions(expenseShares),
  ]);
  const by = (ps: (Portion & { expenseId: string })[]) => {
    const m = new Map<string, Portion[]>();
    for (const { expenseId, ...p } of ps) m.set(expenseId, [...(m.get(expenseId) ?? []), p]);
    return m;
  };
  const P = by(payers), S = by(shares);
  return rows.map((e) => ({ ...e, payers: P.get(e.id) ?? [], shares: S.get(e.id) ?? [] }));
}
export type ExpenseRow = Awaited<ReturnType<typeof loadExpenses>>[number];

/** Every debt that touches `me`, per context ('' = non-group expenses). */
export async function loadLedger(me: string) {
  const gs = await myGroups(me);
  const gids = gs.map((g) => g.id);
  const [exps, sets] = await Promise.all([
    loadExpenses(and(isNull(expenses.deletedAt), visibleExpense(me, gids))!),
    db.select().from(settlements).where(visibleSettlement(me, gids)),
  ]);
  const debts = new Map<string, Debt[]>();
  for (const ctx of [...gids, '']) {
    const simplify = gs.find((g) => g.id === ctx)?.simplify ?? false;
    debts.set(ctx, ledgerDebts({
      expenses: exps.filter((e) => (e.groupId ?? '') === ctx),
      settlements: sets.filter((s) => (s.groupId ?? '') === ctx),
    }, simplify));
  }
  return { groups: gs, debts };
}

/** Public profile of someone else. The QR image is fetched separately to keep lists light. */
export const person = (u: typeof users.$inferSelect) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, registered: u.registered,
  esewaId: u.esewaId, khaltiId: u.khaltiId, hasQr: !!u.paymentQr,
  inviteToken: u.registered ? null : u.inviteToken,
});

export async function people(ids: string[]) {
  return ids.length ? (await db.select().from(users).where(inArray(users.id, [...new Set(ids)]))).map(person) : [];
}

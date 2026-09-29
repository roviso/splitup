import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  balancesFor, expenseInput, friendInput, groupInput, importInput, ledgerDebts, settlementInput, sum, type ExpenseInput,
} from '@splitup/shared';
import { db, type Tx } from './db';
import { expensePayers, expenseShares, expenses, friendships, groupMembers, groups, notifications, settlements, users } from './schema';
import { limit, normCode, parse, token, type Env, type User } from './auth';
import { notify, subscribe, sync, type Push } from './events';
import {
  friendIds, involved, loadExpenses, loadLedger, memberIds, myGroups, pair, people, person, related, visibleExpense, visibleSettlement,
} from './ledger';

const fail = (status: 400 | 403 | 404 | 409, message: string): never => { throw new HTTPException(status, { message }); };
const idOf = (c: Context, name = 'id') => z.uuid().safeParse(c.req.param(name)).data ?? fail(404, 'Not found');
const norm = (phone?: string | null) => phone?.replace(/\D/g, '').slice(-10) || null;

async function befriendAll(tx: Tx | typeof db, ids: string[]) {
  const u = [...new Set(ids)];
  const rows = u.flatMap((a, i) => u.slice(i + 1).map((b) => pair(a, b)));
  if (rows.length) await tx.insert(friendships).values(rows).onConflictDoNothing();
}

/** Link to an existing account by (verified) email, reuse a matching friend, or create a placeholder. Never matches by phone: phones aren't verified. */
async function addContact(tx: Tx, me: User, c: z.infer<typeof friendInput>, mine: (typeof users.$inferSelect)[]) {
  const dup = mine.find((f) => (c.email && f.email === c.email) || (norm(c.phone) && norm(f.phone) === norm(c.phone)));
  if (dup) return dup;
  if (c.email) {
    if (c.email === me.email) return null;
    const [u] = await tx.select().from(users).where(eq(users.email, c.email));
    if (u) { await befriendAll(tx, [me.id, u.id]); mine.push(u); return u; }
  }
  const [u] = await tx.insert(users).values({ name: c.name, email: c.email ?? null, phone: c.phone || null, inviteToken: token(), createdBy: me.id }).returning();
  await befriendAll(tx, [me.id, u.id]);
  mine.push(u);
  return u;
}
/** Everyone in any group `id` belongs to. */
const memberIdsOfGroupsOf = async (id: string) => (await db.execute(sql`
  select distinct b.user_id id from group_members a join group_members b on a.group_id = b.group_id where a.user_id = ${id}`)).map((r) => r.id as string);

const myFriends = async (me: string) => {
  const ids = await friendIds(me);
  return ids.length ? db.select().from(users).where(inArray(users.id, ids)) : [];
};

async function checkParticipants(me: string, e: ExpenseInput | z.infer<typeof settlementInput>, ids: string[]) {
  if (e.groupId) {
    const mids = await memberIds(e.groupId);
    if (!mids.includes(me)) fail(404, 'Group not found');
    if (ids.some((i) => !mids.includes(i))) fail(400, 'Everyone must be a member of the group');
  } else {
    if (!ids.includes(me)) fail(400, 'You must be part of it');
    const f = await friendIds(me);
    if (ids.some((i) => i !== me && !f.includes(i))) fail(400, 'You can only split with your friends');
  }
}

async function writePortions(tx: Tx, expenseId: string, e: ExpenseInput) {
  const rows = (ps: ExpenseInput['payers']) => ps.filter((p) => p.amount > 0).map((p) => ({ expenseId, ...p }));
  await tx.insert(expensePayers).values(rows(e.payers));
  await tx.insert(expenseShares).values(rows(e.shares));
}

async function getExpense(me: string, id: string) {
  const [e] = await loadExpenses(eq(expenses.id, id));
  const ok = e && (e.groupId ? (await memberIds(e.groupId)).includes(me) : [...e.payers, ...e.shares].some((p) => p.userId === me));
  return ok ? e : fail(404, 'Expense not found');
}

async function getGroup(me: string, id: string) {
  const [g] = await db.select().from(groups).where(eq(groups.id, id));
  const mids = g ? await memberIds(id) : [];
  return g && mids.includes(me) ? { ...g, memberIds: mids } : fail(404, 'Group not found');
}

const groupName = async (id: string | null) =>
  id ? (await db.select({ name: groups.name }).from(groups).where(eq(groups.id, id)))[0]?.name ?? null : null;

/** Who can see an item: the whole group, or just the people in it. */
const audience = async (groupId: string | null, ids: string[]) => (groupId ? memberIds(groupId) : ids);

/** Registered account behind a friend code, or a verified email. */
async function findAccount(q: string) {
  const where = q.includes('@') ? eq(users.email, q.trim().toLowerCase()) : eq(users.friendCode, normCode(q));
  const [u] = await db.select().from(users).where(and(where, eq(users.registered, true)));
  return u;
}

/** True if a and b already share a group, friendship, expense or payment. Merging them then would double-count someone. */
async function together(a: string, b: string) {
  if (await related(a, b)) return true;
  const rows = await db.execute(sql`
    select 1 from (select expense_id from expense_payers where user_id = ${a} union select expense_id from expense_shares where user_id = ${a}) x
      join (select expense_id from expense_payers where user_id = ${b} union select expense_id from expense_shares where user_id = ${b}) y using (expense_id)
    union all
    select 1 from settlements where (from_user = ${a} and to_user = ${b}) or (from_user = ${b} and to_user = ${a})
    limit 1`);
  return rows.length > 0;
}

/** Move everything a placeholder owned onto a real account, then drop the placeholder. Returns who can now see new things. */
async function mergeInto(tx: Tx, placeholder: string, into: string) {
  await tx.execute(sql`insert into group_members (group_id, user_id) select group_id, ${into}::uuid from group_members where user_id = ${placeholder}::uuid on conflict do nothing`);
  await tx.execute(sql`insert into friendships (user_a, user_b)
    select least(x, ${into}::uuid), greatest(x, ${into}::uuid) from (select case when user_a = ${placeholder}::uuid then user_b else user_a end x from friendships where ${placeholder}::uuid in (user_a, user_b)) f
    where x <> ${into}::uuid on conflict do nothing`);
  await tx.update(expensePayers).set({ userId: into }).where(eq(expensePayers.userId, placeholder));
  await tx.update(expenseShares).set({ userId: into }).where(eq(expenseShares.userId, placeholder));
  await tx.update(settlements).set({ fromUser: into }).where(eq(settlements.fromUser, placeholder));
  await tx.update(settlements).set({ toUser: into }).where(eq(settlements.toUser, placeholder));
  await tx.delete(users).where(eq(users.id, placeholder));
}

const netFor = (e: { payers: { userId: string; amount: number }[]; shares: { userId: string; amount: number }[] }, uid: string) =>
  sum(e.payers.filter((p) => p.userId === uid).map((p) => p.amount)) - sum(e.shares.filter((p) => p.userId === uid).map((p) => p.amount));

type ExpenseLike = Parameters<typeof netFor>[0] & { id: string; groupId: string | null; description: string; amount: number };
/** Inbox + live refresh for everyone an expense touches. `also` = people who were in it before an edit. */
async function expenseNews(me: string, kind: string, e: ExpenseLike, also: string[] = []) {
  const ids = [...idsOf([e]), ...also];
  const group = await groupName(e.groupId);
  await notify(ids, me, kind, (uid) => ({ expenseId: e.id, groupId: e.groupId, group, description: e.description, amount: e.amount, net: netFor(e, uid) }));
  await sync([me, ...(await audience(e.groupId, ids))]);
}

async function settlementNews(me: string, kind: string, s: typeof settlements.$inferSelect) {
  const group = await groupName(s.groupId);
  await notify([s.fromUser, s.toUser, s.createdBy], me, kind,
    { settlementId: s.id, groupId: s.groupId, group, amount: s.amount, from: s.fromUser, to: s.toUser, method: s.method });
  await sync([me, ...(await audience(s.groupId, [s.fromUser, s.toUser]))]);
}

const idsOf = (exps: { payers: { userId: string }[]; shares: { userId: string }[] }[]) => exps.flatMap((e) => [...e.payers, ...e.shares].map((p) => p.userId));

export const publicRoutes = new Hono<Env>()
  .get('/invites/:token', async (c) => {
    const [p] = await db.select().from(users).where(and(eq(users.inviteToken, c.req.param('token')), eq(users.registered, false)));
    if (!p) fail(404, 'This invite link is no longer valid');
    const [by] = p.createdBy ? await db.select({ name: users.name }).from(users).where(eq(users.id, p.createdBy)) : [];
    return c.json({ name: p.name, invitedBy: by?.name ?? null });
  })
  /** Landing for a scanned QR / shared add-me link, also shown before login. */
  .get('/codes/:code', async (c) => {
    limit(c, 60, 15 * 60e3);
    const [u] = await db.select({ id: users.id, name: users.name }).from(users)
      .where(and(eq(users.friendCode, normCode(c.req.param('code'))), eq(users.registered, true)));
    return u ? c.json(u) : fail(404, 'This friend code is not valid');
  });

export const routes = new Hono<Env>()
  // ---------- live updates ----------
  .get('/events', (c) => {
    const me = c.get('user').id;
    c.header('X-Accel-Buffering', 'no'); // nginx: don't buffer the stream
    c.header('Cache-Control', 'no-cache, no-transform');
    return streamSSE(c, async (stream) => {
      const queue: Push[] = [];
      let wake = () => {};
      const off = subscribe(me, (p) => { queue.push(p); wake(); });
      stream.onAbort(() => { off(); wake(); });
      await stream.writeSSE({ event: 'hello', data: '{}' });
      while (!stream.aborted) {
        // Wait for an event, or 25s for a heartbeat (keeps proxies from closing an idle stream).
        await new Promise<void>((r) => {
          const t = setTimeout(r, 25_000);
          wake = () => { clearTimeout(t); r(); };
          if (queue.length) wake();
        });
        if (stream.aborted) break;
        if (!queue.length) await stream.writeSSE({ event: 'ping', data: '' });
        while (queue.length) await stream.writeSSE({ data: JSON.stringify(queue.shift()) });
      }
      off();
    });
  })
  .get('/notifications', async (c) => {
    const me = c.get('user').id;
    const items = await db.select().from(notifications).where(eq(notifications.userId, me)).orderBy(desc(notifications.createdAt)).limit(60);
    const ids = items.flatMap((n) => [n.actorId, ...['from', 'to'].map((k) => (n.data as Record<string, unknown>)[k])]).filter((x): x is string => typeof x === 'string');
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, me), isNull(notifications.readAt)));
    return c.json({ items, unread: n, people: await people(ids) });
  })
  .post('/notifications/read', async (c) => {
    const me = c.get('user').id;
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me), isNull(notifications.readAt)));
    await sync([me]); // clears the badge on my other devices
    return c.json({ ok: true });
  })

  // ---------- overview ----------
  .get('/dashboard', async (c) => {
    const me = c.get('user').id;
    const [{ groups: gs, debts }, fids] = await Promise.all([loadLedger(me), friendIds(me)]);
    const byPerson = new Map<string, { total: number; parts: { groupId: string | null; amount: number }[] }>();
    const groupBal = new Map<string, number>();
    for (const [ctx, ds] of debts) {
      for (const [uid, amount] of balancesFor(me, ds)) {
        if (!amount) continue;
        const p = byPerson.get(uid) ?? { total: 0, parts: [] };
        p.total += amount;
        p.parts.push({ groupId: ctx || null, amount });
        byPerson.set(uid, p);
        if (ctx) groupBal.set(ctx, (groupBal.get(ctx) ?? 0) + amount);
      }
    }
    const members = gs.length ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, gs.map((g) => g.id))) : [];
    const balances = [...byPerson].map(([userId, b]) => ({ userId, ...b })).filter((b) => b.total);
    return c.json({
      people: await people([...fids, ...byPerson.keys(), ...members.map((m) => m.userId)]),
      friendIds: fids,
      balances,
      groups: gs.map((g) => ({ ...g, memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.userId), balance: groupBal.get(g.id) ?? 0 })),
      totals: {
        owed: sum(balances.filter((b) => b.total > 0).map((b) => b.total)),
        owe: -sum(balances.filter((b) => b.total < 0).map((b) => b.total)),
      },
    });
  })
  .get('/activity', async (c) => {
    const me = c.get('user').id;
    const gids = (await myGroups(me)).map((g) => g.id);
    const at = sql`coalesce(${expenses.deletedAt}, ${expenses.updatedAt}, ${expenses.createdAt})`;
    const recent = await db.select({ id: expenses.id }).from(expenses).where(visibleExpense(me, gids)).orderBy(desc(at)).limit(50);
    const [exps, sets, gs] = await Promise.all([
      recent.length ? loadExpenses(inArray(expenses.id, recent.map((r) => r.id))) : [],
      db.select().from(settlements).where(or(inArray(settlements.groupId, gids), and(isNull(settlements.groupId), or(eq(settlements.fromUser, me), eq(settlements.toUser, me)))))
        .orderBy(desc(sql`coalesce(${settlements.deletedAt}, ${settlements.createdAt})`)).limit(50),
      myGroups(me),
    ]);
    const when = (x: { createdAt: Date; updatedAt?: Date | null; deletedAt: Date | null }) => x.deletedAt ?? x.updatedAt ?? x.createdAt;
    const items = [
      ...exps.map((e) => ({ kind: 'expense' as const, at: when(e), data: e })),
      ...sets.map((s) => ({ kind: 'settlement' as const, at: when(s), data: s })),
    ].sort((a, b) => +b.at - +a.at).slice(0, 50);
    return c.json({
      items,
      groups: gs.map((g) => ({ id: g.id, name: g.name })),
      people: await people([...idsOf(exps), ...exps.map((e) => e.createdBy), ...sets.flatMap((s) => [s.fromUser, s.toUser, s.createdBy])]),
    });
  })

  // ---------- friends ----------
  .post('/friends', async (c) => {
    const input = await parse(c, friendInput);
    const me = c.get('user');
    const mine = await myFriends(me.id);
    const known = new Set(mine.map((f) => f.id));
    const u = await db.transaction((tx) => addContact(tx, me, input, mine));
    if (!u) return fail(400, "That's your own email");
    if (u.registered && !known.has(u.id)) { await notify([u.id], me.id, 'friend_added', {}); await sync([me.id, u.id]); }
    return c.json(person(u));
  })
  /** Look someone up by friend code or exact email before adding them. Only exact matches, never a directory. */
  .get('/people/lookup', async (c) => {
    limit(c, 60, 15 * 60e3);
    const me = c.get('user').id;
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 4) fail(400, 'Enter a friend code or an email');
    const u = await findAccount(q);
    if (!u) fail(404, q.includes('@') ? 'Nobody on Split-Up uses that email yet' : 'No one has that friend code');
    return c.json({ person: { id: u.id, name: u.name, email: u.email }, isMe: u.id === me, isFriend: (await friendIds(me)).includes(u.id) });
  })
  /** Add a Split-Up user as a friend by code or email. Friendship is mutual and instant; they get a notification. */
  .post('/friends/connect', async (c) => {
    limit(c, 60, 15 * 60e3);
    const me = c.get('user').id;
    const { q } = await parse(c, z.object({ q: z.string().trim().min(4).max(200) }));
    const u = await findAccount(q) ?? fail(404, 'No one has that friend code');
    if (u.id === me) fail(400, "That's you! Share your code with a friend instead.");
    const already = (await friendIds(me)).includes(u.id);
    if (!already) {
      await befriendAll(db, [me, u.id]);
      await notify([u.id], me, 'friend_added', {});
      await sync([me, u.id]);
    }
    return c.json({ person: person(u), already });
  })
  .post('/friends/import', async (c) => {
    const { contacts } = await parse(c, importInput);
    const me = c.get('user');
    const mine = await myFriends(me.id);
    const before = mine.length;
    const known = new Set(mine.map((f) => f.id));
    await db.transaction(async (tx) => { for (const ct of contacts) await addContact(tx, me, ct, mine); });
    const linked = mine.filter((u) => u.registered && !known.has(u.id)).map((u) => u.id);
    await notify(linked, me.id, 'friend_added', {});
    await sync([me.id, ...linked]);
    return c.json({ added: mine.length - before, linked: linked.length, skipped: contacts.length - (mine.length - before) });
  })
  .get('/friends/:id', async (c) => {
    const me = c.get('user').id;
    const fid = idOf(c);
    if (!(await related(me, fid))) fail(404, 'Friend not found');
    const [{ groups: gs, debts }, fids, [u]] = await Promise.all([loadLedger(me), friendIds(me), db.select().from(users).where(eq(users.id, fid))]);
    const parts = [...debts].map(([ctx, ds]) => ({ groupId: ctx || null, groupName: gs.find((g) => g.id === ctx)?.name ?? null, amount: balancesFor(me, ds).get(fid) ?? 0 }))
      .filter((p) => p.amount);
    const gids = gs.map((g) => g.id);
    const [exps, sets] = await Promise.all([
      loadExpenses(and(isNull(expenses.deletedAt), visibleExpense(me, gids), involved(me), involved(fid))!),
      db.select().from(settlements).where(and(visibleSettlement(me, gids),
        or(and(eq(settlements.fromUser, me), eq(settlements.toUser, fid)), and(eq(settlements.fromUser, fid), eq(settlements.toUser, me)))))
        .orderBy(desc(settlements.date)),
    ]);
    return c.json({
      friend: person(u), isFriend: fids.includes(fid), balance: sum(parts.map((p) => p.amount)), parts,
      expenses: exps, settlements: sets, people: await people([me, fid, ...idsOf(exps)]),
      groups: gs.map((g) => ({ id: g.id, name: g.name })),
    });
  })
  .delete('/friends/:id', async (c) => {
    const me = c.get('user').id;
    const fid = idOf(c);
    const { debts } = await loadLedger(me);
    if ([...debts.values()].some((ds) => balancesFor(me, ds).get(fid))) fail(409, 'Settle up before removing this friend');
    await db.delete(friendships).where(and(eq(friendships.userA, pair(me, fid).userA), eq(friendships.userB, pair(me, fid).userB)));
    await sync([me, fid]);
    return c.json({ ok: true });
  })
  /** In-app nudge to someone who owes me. At most one every 6 hours per person. */
  .post('/friends/:id/remind', async (c) => {
    const me = c.get('user').id;
    const fid = idOf(c);
    if (!(await related(me, fid))) fail(404, 'Friend not found');
    const { debts } = await loadLedger(me);
    const owed = sum([...debts.values()].map((ds) => balancesFor(me, ds).get(fid) ?? 0));
    if (owed <= 0) fail(400, "They don't owe you anything");
    const [recent] = await db.select({ id: notifications.id }).from(notifications).where(and(
      eq(notifications.userId, fid), eq(notifications.actorId, me), eq(notifications.kind, 'reminder'),
      sql`${notifications.createdAt} > now() - interval '6 hours'`,
    )).limit(1);
    if (recent) fail(409, 'You already nudged them recently');
    const [u] = await db.select({ registered: users.registered }).from(users).where(eq(users.id, fid));
    if (!u?.registered) fail(400, "They haven't joined Split-Up yet. Send the invite link instead.");
    await notify([fid], me, 'reminder', { amount: owed });
    return c.json({ ok: true });
  })
  /** I added "Sachin" by name before he joined; he's on Split-Up now. Move that placeholder's history onto his account. */
  .post('/friends/:id/link', async (c) => {
    const me = c.get('user').id;
    const pid = idOf(c);
    const { userId } = await parse(c, z.object({ userId: z.uuid() }));
    const [p] = await db.select().from(users).where(eq(users.id, pid));
    if (!p || p.registered || p.createdBy !== me) fail(404, 'Only people you added who are not on Split-Up yet can be linked');
    const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.registered, true)));
    if (!u || !(await friendIds(me)).includes(u.id)) fail(400, 'Add them as a friend first');
    if (await together(p.id, u.id)) fail(409, '{name} already shares a group or expense with this person, so they can’t be merged'.replace('{name}', u.name));
    const before = await memberIdsOfGroupsOf(p.id);
    await db.transaction((tx) => mergeInto(tx, p.id, u.id));
    await notify([u.id], me, 'account_linked', { name: p.name });
    await sync([me, u.id, ...before]);
    return c.json({ id: u.id });
  })
  .get('/users/:id/payment', async (c) => {
    const uid = idOf(c);
    if (!(await related(c.get('user').id, uid))) fail(404, 'Not found');
    const [u] = await db.select({ name: users.name, phone: users.phone, esewaId: users.esewaId, khaltiId: users.khaltiId, paymentQr: users.paymentQr })
      .from(users).where(eq(users.id, uid));
    return c.json(u);
  })
  .post('/invites/:token/claim', async (c) => {
    const me = c.get('user').id;
    const [p] = await db.select().from(users).where(and(eq(users.inviteToken, c.req.param('token')), eq(users.registered, false)));
    if (!p) fail(404, 'This invite link is no longer valid');
    if (p.id === me || (await together(me, p.id))) fail(409, 'This invite is meant for someone else');
    const before = [...await memberIdsOfGroupsOf(p.id), ...await friendIds(p.id)];
    await db.transaction((tx) => mergeInto(tx, p.id, me));
    await notify([p.createdBy], me, 'invite_claimed', { name: p.name });
    await sync([me, ...before]);
    return c.json({ ok: true });
  })

  // ---------- groups ----------
  .post('/groups', async (c) => {
    const me = c.get('user').id;
    const { memberIds: mids, ...g } = await parse(c, groupInput);
    const f = await friendIds(me);
    if (mids.some((m) => !f.includes(m))) fail(400, 'You can only add your friends');
    const all = [...new Set([me, ...mids])];
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(groups).values({ ...g, createdBy: me, inviteCode: token(9) }).returning();
      await tx.insert(groupMembers).values(all.map((userId) => ({ groupId: row.id, userId })));
      await befriendAll(tx, all);
      return row.id;
    });
    await notify(all, me, 'group_added', { groupId: id, group: g.name });
    await sync(all);
    return c.json({ id });
  })
  .get('/groups/:id', async (c) => {
    const me = c.get('user').id;
    const g = await getGroup(me, idOf(c));
    const [exps, sets] = await Promise.all([
      loadExpenses(and(eq(expenses.groupId, g.id), isNull(expenses.deletedAt))!),
      db.select().from(settlements).where(and(eq(settlements.groupId, g.id), isNull(settlements.deletedAt))).orderBy(desc(settlements.date), desc(settlements.createdAt)),
    ]);
    return c.json({
      group: g,
      expenses: exps,
      settlements: sets,
      debts: ledgerDebts({ expenses: exps, settlements: sets }, g.simplify),
      people: await people([...g.memberIds, ...idsOf(exps), ...sets.flatMap((s) => [s.fromUser, s.toUser])]),
    });
  })
  .patch('/groups/:id', async (c) => {
    const g = await getGroup(c.get('user').id, idOf(c));
    const patch = await parse(c, groupInput.pick({ name: true, type: true, simplify: true }).partial());
    await db.update(groups).set(patch).where(eq(groups.id, g.id));
    await sync(g.memberIds);
    return c.json({ ok: true });
  })
  .delete('/groups/:id', async (c) => {
    const me = c.get('user').id;
    const g = await getGroup(me, idOf(c));
    if (g.createdBy !== me) fail(403, 'Only the group creator can delete it');
    await db.delete(groups).where(eq(groups.id, g.id));
    await notify(g.memberIds, me, 'group_deleted', { group: g.name });
    await sync(g.memberIds);
    return c.json({ ok: true });
  })
  .post('/groups/:id/members', async (c) => {
    const me = c.get('user').id;
    const g = await getGroup(me, idOf(c));
    const { userIds } = await parse(c, z.object({ userIds: z.array(z.uuid()).min(1).max(100) }));
    const f = await friendIds(me);
    if (userIds.some((u) => !f.includes(u))) fail(400, 'You can only add your friends');
    await db.transaction(async (tx) => {
      await tx.insert(groupMembers).values(userIds.map((userId) => ({ groupId: g.id, userId }))).onConflictDoNothing();
      await befriendAll(tx, [...g.memberIds, ...userIds]);
    });
    await notify(userIds.filter((u) => !g.memberIds.includes(u)), me, 'group_added', { groupId: g.id, group: g.name });
    await sync([...g.memberIds, ...userIds]);
    return c.json({ ok: true });
  })
  .delete('/groups/:id/members/:userId', async (c) => {
    const me = c.get('user').id;
    const g = await getGroup(me, idOf(c));
    const uid = idOf(c, 'userId');
    if (uid !== me && g.createdBy !== me) fail(403, 'Only the group creator can remove others');
    const { debts } = await loadLedger(me);
    if ((debts.get(g.id) ?? []).some((d) => d.from === uid || d.to === uid)) fail(409, 'They must settle up before leaving');
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, g.id), eq(groupMembers.userId, uid)));
    if (uid !== me) await notify([uid], me, 'group_removed', { group: g.name });
    await sync(g.memberIds);
    return c.json({ ok: true });
  })
  .get('/join/:code', async (c) => {
    const [g] = await db.select().from(groups).where(eq(groups.inviteCode, c.req.param('code')));
    if (!g) fail(404, 'This group link is not valid');
    const mids = await memberIds(g.id);
    return c.json({ id: g.id, name: g.name, type: g.type, members: mids.length, isMember: mids.includes(c.get('user').id) });
  })
  .post('/join/:code', async (c) => {
    const me = c.get('user').id;
    const [g] = await db.select().from(groups).where(eq(groups.inviteCode, c.req.param('code')));
    if (!g) fail(404, 'This group link is not valid');
    const mids = await memberIds(g.id);
    await db.transaction(async (tx) => {
      await tx.insert(groupMembers).values({ groupId: g.id, userId: me }).onConflictDoNothing();
      await befriendAll(tx, [me, ...mids]);
    });
    if (!mids.includes(me)) {
      await notify(mids, me, 'group_joined', { groupId: g.id, group: g.name });
      await sync([me, ...mids]);
    }
    return c.json({ id: g.id });
  })

  // ---------- expenses ----------
  .post('/expenses', async (c) => {
    const me = c.get('user').id;
    const e = await parse(c, expenseInput);
    await checkParticipants(me, e, idsOf([e]));
    const id = await db.transaction(async (tx) => {
      const [row] = await tx.insert(expenses).values({ ...e, createdBy: me }).returning({ id: expenses.id });
      await writePortions(tx, row.id, e);
      return row.id;
    });
    await expenseNews(me, 'expense_added', { ...e, id });
    return c.json({ id });
  })
  .get('/expenses/:id', async (c) => {
    const e = await getExpense(c.get('user').id, idOf(c));
    return c.json({ expense: e, people: await people([...idsOf([e]), e.createdBy]) });
  })
  .put('/expenses/:id', async (c) => {
    const me = c.get('user').id;
    const old = await getExpense(me, idOf(c));
    if (old.deletedAt) fail(409, 'Restore this expense before editing it');
    const e = await parse(c, expenseInput);
    if (e.groupId !== old.groupId) fail(400, 'An expense cannot be moved to another group');
    await checkParticipants(me, e, idsOf([e]));
    await db.transaction(async (tx) => {
      await tx.update(expenses).set({ ...e, updatedAt: new Date() }).where(eq(expenses.id, old.id));
      await tx.delete(expensePayers).where(eq(expensePayers.expenseId, old.id));
      await tx.delete(expenseShares).where(eq(expenseShares.expenseId, old.id));
      await writePortions(tx, old.id, e);
    });
    await expenseNews(me, 'expense_updated', { ...e, id: old.id }, idsOf([old]));
    return c.json({ id: old.id });
  })
  .delete('/expenses/:id', async (c) => {
    const me = c.get('user').id;
    const e = await getExpense(me, idOf(c));
    await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, e.id));
    await expenseNews(me, 'expense_deleted', e);
    return c.json({ ok: true });
  })
  .post('/expenses/:id/restore', async (c) => {
    const me = c.get('user').id;
    const e = await getExpense(me, idOf(c));
    await db.update(expenses).set({ deletedAt: null }).where(eq(expenses.id, e.id));
    await expenseNews(me, 'expense_restored', e);
    return c.json({ ok: true });
  })

  // ---------- settle up ----------
  .post('/settlements', async (c) => {
    const me = c.get('user').id;
    const s = await parse(c, settlementInput);
    await checkParticipants(me, s, [s.fromUser, s.toUser]);
    // The receiver recording it is proof enough that it arrived.
    const [row] = await db.insert(settlements).values({ ...s, createdBy: me, confirmedAt: s.toUser === me ? new Date() : null }).returning();
    await settlementNews(me, 'settlement', row);
    return c.json(row);
  })
  /** Receiver says "got it". Doesn't move balances, but both sides see the tick. */
  .post('/settlements/:id/confirm', async (c) => {
    const me = c.get('user').id;
    const [s] = await db.select().from(settlements).where(and(eq(settlements.id, idOf(c)), isNull(settlements.deletedAt)));
    if (!s || s.toUser !== me) fail(404, 'Payment not found');
    if (!s.confirmedAt) {
      const [row] = await db.update(settlements).set({ confirmedAt: new Date() }).where(eq(settlements.id, s.id)).returning();
      await settlementNews(me, 'settlement_confirmed', row);
    }
    return c.json({ ok: true });
  })
  .delete('/settlements/:id', async (c) => {
    const me = c.get('user').id;
    const gids = (await myGroups(me)).map((g) => g.id);
    const [s] = await db.select().from(settlements).where(and(eq(settlements.id, idOf(c)), visibleSettlement(me, gids)));
    if (!s) fail(404, 'Payment not found');
    await db.update(settlements).set({ deletedAt: new Date() }).where(eq(settlements.id, s.id));
    await settlementNews(me, 'settlement_deleted', s);
    return c.json({ ok: true });
  });

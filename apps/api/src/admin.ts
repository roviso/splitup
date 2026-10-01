import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie } from 'hono/cookie';
import { and, desc, eq, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { AI_FREE_MONTHLY, CATEGORIES, GROUP_TYPES, balancesFor, creditPeriod, creditsOf, ledgerDebts, sum } from '@splitup/shared';
import { db } from './db';
import {
  aiSessions, auditLog, expenses, friendships, groupMembers, groups, sessions, settlements, users,
} from './schema';
import { SID, hashPassword, normCode, parse, requireAdmin, sessionMeta, sha, token, type Env, type User } from './auth';
import { liveStats, notify, sync } from './events';
import { friendIds, involved, loadExpenses, loadLedger, memberIds, pair } from './ledger';
import { DEFAULT_SETTINGS, audit, saveSettings, settings, type Settings } from './platform';

const fail = (status: 400 | 403 | 404 | 409, message: string): never => { throw new HTTPException(status, { message }); };
const idOf = (c: Context, name = 'id') => z.uuid().safeParse(c.req.param(name)).data ?? fail(404, 'Not found');
const rows = async <T,>(q: SQL) => (await db.execute(q)) as unknown as T[];
const TZ = 'Asia/Kathmandu';
const nepalToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const pageOf = (c: Context) => Math.max(0, Number(c.req.query('page') ?? 0) || 0);
const PAGE = 50;

/** What an admin sees of an account. Never the password hash or session tokens. */
export function adminUser(u: User) {
  const { passwordHash, googleSub, paymentQr, ...rest } = u;
  return { ...rest, hasPassword: !!passwordHash, google: !!googleSub, hasQr: !!paymentQr, credits: creditsOf(u) };
}

async function names(ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter((x): x is string => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)))];
  if (!u.length) return {} as Record<string, { name: string; email: string | null; registered: boolean; role: string }>;
  const list = await db.select({ id: users.id, name: users.name, email: users.email, registered: users.registered, role: users.role }).from(users).where(inArray(users.id, u));
  return Object.fromEntries(list.map(({ id, ...p }) => [id, p]));
}
async function groupNames(ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter((x): x is string => !!x))];
  if (!u.length) return {} as Record<string, string>;
  return Object.fromEntries((await db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, u))).map((g) => [g.id, g.name]));
}

/** Everyone who should refetch when this user changes: themselves, friends and group mates. */
async function circleOf(uid: string) {
  const mates = await rows<{ id: string }>(sql`select distinct b.user_id id from group_members a join group_members b on a.group_id = b.group_id where a.user_id = ${uid}`);
  return [uid, ...(await friendIds(uid)), ...mates.map((m) => m.id)];
}

async function getUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ?? fail(404, 'User not found');
}

/** Days the user did anything: logged-in days, plus what they created (so history from before tracking began counts too). */
const ACTIVITY = sql.raw(`(
  select user_id, day from user_days
  union select created_by, (created_at at time zone '${TZ}')::date from expenses
  union select created_by, (created_at at time zone '${TZ}')::date from settlements
  union select user_id, (created_at at time zone '${TZ}')::date from ai_sessions
  union select id, (joined_at at time zone '${TZ}')::date from users where joined_at is not null
)`);

/** Resolve ?days=7|30|90|365|0 (0 = since launch) into a Nepal-time date range plus the period before it. */
async function period(c: Context) {
  const end = nepalToday();
  let days = Number(c.req.query('days') ?? 30);
  if (!days) {
    const [{ first }] = await rows<{ first: string | null }>(sql.raw(`select to_char(min(created_at at time zone '${TZ}'), 'YYYY-MM-DD') first from users`));
    days = first ? Math.max(1, Math.round((Date.parse(end) - Date.parse(first)) / 864e5) + 1) : 1;
  }
  days = Math.min(Math.max(1, days), 3650);
  const start = addDays(end, -(days - 1));
  return { start, end, days, prevStart: addDays(start, -days), prevEnd: addDays(start, -1) };
}

/** Net balances across the whole platform. Group debts per group; non-group per user (a close, cheap approximation). */
const OUTSTANDING = sql`
  with net as (
    select coalesce(e.group_id::text, '') ctx, p.user_id, p.amount v from expense_payers p join expenses e on e.id = p.expense_id where e.deleted_at is null
    union all select coalesce(e.group_id::text, ''), s.user_id, -s.amount from expense_shares s join expenses e on e.id = s.expense_id where e.deleted_at is null
    union all select coalesce(group_id::text, ''), from_user, amount from settlements where deleted_at is null
    union all select coalesce(group_id::text, ''), to_user, -amount from settlements where deleted_at is null
  )
  select coalesce(sum(t), 0)::float8 total, count(*)::int people from (select sum(v) t from net group by ctx, user_id having sum(v) > 0) x`;

// ---------- the feed: one timeline built from every table, newest first ----------
const FEED_CATS = ['users', 'money', 'groups', 'ai', 'auth', 'admin'] as const;
// ponytail: a UNION over full tables sorted by time; fine to ~1M rows, then add (created_at) indexes or a real events table.
const FEED = (before: Date, cats: string[], limit: number, who?: string) => sql`
  select * from (
    select 'users' cat, 'signup' kind, joined_at at, id actor, id::text target, jsonb_build_object('name', name, 'email', email) data from users where joined_at is not null
    union all select 'users', 'placeholder', created_at, created_by, id::text, jsonb_build_object('name', name) from users where not registered and created_by is not null
    union all select 'groups', 'group_created', created_at, created_by, id::text, jsonb_build_object('name', name, 'type', type) from groups
    union all select 'money', 'expense_added', created_at, created_by, id::text, jsonb_build_object('description', description, 'amount', amount, 'groupId', group_id, 'category', category, 'splitType', split_type) from expenses
    union all select 'money', 'expense_updated', updated_at, null, id::text, jsonb_build_object('description', description, 'amount', amount, 'groupId', group_id, 'category', category, 'by', created_by) from expenses where updated_at is not null
    union all select 'money', 'expense_deleted', deleted_at, null, id::text, jsonb_build_object('description', description, 'amount', amount, 'groupId', group_id, 'category', category, 'by', created_by) from expenses where deleted_at is not null
    union all select 'money', 'settlement', created_at, created_by, id::text, jsonb_build_object('amount', amount, 'from', from_user, 'to', to_user, 'method', method, 'groupId', group_id) from settlements
    union all select 'money', 'settlement_deleted', deleted_at, null, id::text, jsonb_build_object('amount', amount, 'from', from_user, 'to', to_user, 'method', method, 'groupId', group_id) from settlements where deleted_at is not null
    union all select 'ai', 'ai_bill', created_at, user_id, id::text, jsonb_build_object('bucket', bucket, 'turns', turns) from ai_sessions
    union all select case when action like 'admin.%' then 'admin' else 'auth' end, action, at, actor_id, target_id, data || jsonb_build_object('targetType', target_type, 'ip', ip) from audit_log
  ) f
  where at < ${before.toISOString()}::timestamptz and cat = any(${`{${cats.join(',')}}`}::text[])
    ${who ? sql`and (actor = ${who}::uuid or target = ${who} or data->>'from' = ${who} or data->>'to' = ${who} or data->>'by' = ${who})` : sql``}
  order by at desc limit ${limit}`;

type FeedRow = { cat: string; kind: string; at: Date; actor: string | null; target: string | null; data: Record<string, unknown> };
async function feed(before: Date, cats: string[], limit: number, who?: string) {
  const items = await rows<FeedRow>(FEED(before, cats, limit, who));
  const ppl = items.flatMap((i) => [i.actor, i.data.from as string, i.data.to as string, i.data.by as string, i.data.targetType === 'user' ? i.target : null]);
  const [people, gnames] = await Promise.all([names(ppl), groupNames(items.map((i) => i.data.groupId as string | null))]);
  return { items: items.map((i) => ({ ...i, at: new Date(i.at) })), people, groups: gnames };
}

// ---------- CSV ----------
const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Leading =+-@ would run as a formula in Excel/Sheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (list: Record<string, unknown>[]) =>
  list.length ? [Object.keys(list[0]).join(','), ...list.map((r) => Object.values(r).map(csvCell).join(','))].join('\n') : '';

// ---------- inputs ----------
const userPatch = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email().trim().toLowerCase().nullable(),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,32}$/, 'Username: 3–32 letters, digits, . _ -').nullable(),
  phone: z.string().trim().max(20).nullable(),
  role: z.enum(['user', 'admin']),
  esewaId: z.string().trim().max(40).nullable(),
  khaltiId: z.string().trim().max(40).nullable(),
  locale: z.enum(['en', 'ne']),
  calendar: z.enum(['ad', 'bs']),
}).partial();
const settingsInput = z.object({
  announcement: z.object({ active: z.boolean(), text: z.string().trim().max(280), tone: z.enum(['info', 'warn', 'good']) }),
  aiEnabled: z.boolean(),
  signupsEnabled: z.boolean(),
  maintenance: z.object({ active: z.boolean(), message: z.string().trim().min(1).max(280) }),
}).partial();
const message = z.object({ message: z.string().trim().min(1).max(500) });

const isUnique = (e: unknown) => (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505';

export const adminRoutes = new Hono<Env>()
  .use(requireAdmin)

  // ================= analytics =================
  .get('/overview', async (c) => {
    const p = await period(c);
    const inRange = (col: string, a = p.start, b = p.end) => sql.raw(`((${col}) at time zone '${TZ}')::date between '${a}' and '${b}'`);
    const both = async (f: (a: string, b: string) => SQL) => {
      const [[cur], [prev]] = await Promise.all([rows<Record<string, number>>(f(p.start, p.end)), rows<Record<string, number>>(f(p.prevStart, p.prevEnd))]);
      return { cur, prev };
    };
    const today = p.end;
    const [kpi, act, money, pays, ai, grp, [totals], [outstanding], [stick]] = await Promise.all([
      both((a, b) => sql`select count(*)::int n from users where registered and ${inRange('joined_at', a, b)}`),
      both((a, b) => sql`select count(distinct user_id)::int n from ${ACTIVITY} x where day between ${a}::date and ${b}::date`),
      both((a, b) => sql`select count(*)::int n, coalesce(sum(amount), 0)::float8 v from expenses where deleted_at is null and ${inRange('created_at', a, b)}`),
      both((a, b) => sql`select count(*)::int n, coalesce(sum(amount), 0)::float8 v from settlements where deleted_at is null and ${inRange('created_at', a, b)}`),
      both((a, b) => sql`select count(*)::int n from ai_sessions where ${inRange('created_at', a, b)}`),
      both((a, b) => sql`select count(*)::int n from groups where ${inRange('created_at', a, b)}`),
      rows<Record<string, number>>(sql`select
        (select count(*)::int from users where registered) users,
        (select count(*)::int from users where not registered) placeholders,
        (select count(*)::int from users where role = 'admin') admins,
        (select count(*)::int from users where suspended_at is not null) suspended,
        (select count(*)::int from groups) groups,
        (select count(*)::int from expenses where deleted_at is null) expenses,
        (select coalesce(sum(amount), 0)::float8 from expenses where deleted_at is null) volume,
        (select count(*)::int from settlements where deleted_at is null) settlements,
        (select coalesce(sum(amount), 0)::float8 from settlements where deleted_at is null) settled,
        (select count(*)::int from friendships) friendships,
        (select count(*)::int from sessions where expires_at > now()) sessions`),
      rows<{ total: number; people: number }>(OUTSTANDING),
      rows<{ dau: number; wau: number; mau: number }>(sql`select
        count(distinct user_id) filter (where day = ${today}::date)::int dau,
        count(distinct user_id) filter (where day > ${today}::date - 7)::int wau,
        count(distinct user_id) filter (where day > ${today}::date - 30)::int mau
        from ${ACTIVITY} x where day > ${today}::date - 30`),
    ]);
    const live = liveStats();
    return c.json({
      period: p,
      kpis: {
        newUsers: { cur: kpi.cur.n, prev: kpi.prev.n },
        activeUsers: { cur: act.cur.n, prev: act.prev.n },
        expenses: { cur: money.cur.n, prev: money.prev.n },
        volume: { cur: money.cur.v, prev: money.prev.v },
        settlements: { cur: pays.cur.n, prev: pays.prev.n },
        settled: { cur: pays.cur.v, prev: pays.prev.v },
        aiBills: { cur: ai.cur.n, prev: ai.prev.n },
        groups: { cur: grp.cur.n, prev: grp.prev.n },
      },
      totals, outstanding, stickiness: stick,
      live: { users: live.users.length, streams: live.streams },
    });
  })
  .get('/series', async (c) => {
    const p = await period(c);
    const local = (col: string) => sql.raw(`(${col} at time zone '${TZ}')::date`);
    const series = await rows<Record<string, number | string>>(sql`
      with d as (select generate_series(${p.start}::date, ${p.end}::date, interval '1 day')::date as day),
      su as (select ${local('joined_at')} as day, count(*) n from users where registered and joined_at is not null group by 1),
      ac as (select day, count(distinct user_id) n from ${ACTIVITY} x group by 1),
      ex as (select ${local('created_at')} as day, count(*) n, sum(amount) v from expenses where deleted_at is null group by 1),
      st as (select ${local('created_at')} as day, count(*) n, sum(amount) v from settlements where deleted_at is null group by 1),
      ai as (select ${local('created_at')} as day, count(*) n from ai_sessions group by 1),
      gr as (select ${local('created_at')} as day, count(*) n from groups group by 1)
      select to_char(d.day, 'YYYY-MM-DD') as day,
        coalesce(su.n, 0)::int signups, coalesce(ac.n, 0)::int active,
        coalesce(ex.n, 0)::int expenses, coalesce(ex.v, 0)::float8 volume,
        coalesce(st.n, 0)::int settlements, coalesce(st.v, 0)::float8 settled,
        coalesce(ai.n, 0)::int ai, coalesce(gr.n, 0)::int groups
      from d left join su using (day) left join ac using (day) left join ex using (day) left join st using (day) left join ai using (day) left join gr using (day)
      order by d.day`);
    const [{ base }] = await rows<{ base: number }>(sql`select count(*)::int base from users where registered and (joined_at is null or ${sql.raw(`(joined_at at time zone '${TZ}')::date`)} < ${p.start}::date)`);
    return c.json({ period: p, series, usersBefore: base });
  })
  .get('/breakdowns', async (c) => {
    const p = await period(c);
    const r = sql.raw(`(created_at at time zone '${TZ}')::date between '${p.start}' and '${p.end}'`);
    const [categories, splitTypes, methods, groupTypes, topGroups, topUsers, heat, ai] = await Promise.all([
      rows(sql`select category k, count(*)::int n, sum(amount)::float8 v from expenses where deleted_at is null and ${r} group by 1 order by v desc`),
      rows(sql`select split_type k, count(*)::int n, sum(amount)::float8 v from expenses where deleted_at is null and ${r} group by 1 order by n desc`),
      rows(sql`select method k, count(*)::int n, sum(amount)::float8 v from settlements where deleted_at is null and ${r} group by 1 order by v desc`),
      rows(sql`select type k, count(*)::int n from groups where ${r} group by 1 order by n desc`),
      rows(sql`select g.id, g.name, g.type, count(e.id)::int n, coalesce(sum(e.amount), 0)::float8 v,
          (select count(*)::int from group_members m where m.group_id = g.id) members
        from groups g join expenses e on e.group_id = g.id and e.deleted_at is null and ${sql.raw(`(e.created_at at time zone '${TZ}')::date between '${p.start}' and '${p.end}'`)}
        group by g.id order by v desc limit 8`),
      rows(sql`select u.id, u.name, u.email, count(distinct e.id)::int n, coalesce(sum(p.amount), 0)::float8 v
        from expense_payers p join expenses e on e.id = p.expense_id and e.deleted_at is null and ${sql.raw(`(e.created_at at time zone '${TZ}')::date between '${p.start}' and '${p.end}'`)}
        join users u on u.id = p.user_id group by u.id order by v desc limit 8`),
      rows(sql`select extract(isodow from created_at at time zone ${TZ})::int as dow, extract(hour from created_at at time zone ${TZ})::int as hour, count(*)::int n
        from expenses where ${r} group by 1, 2`),
      rows(sql`select bucket k, count(*)::int n from ai_sessions where ${r} group by 1`),
    ]);
    return c.json({ period: p, categories, splitTypes, methods, groupTypes, topGroups, topUsers, heat, ai });
  })
  /** All-time shape of the user base: activation funnel, sign-in methods, language, calendar. */
  .get('/audience', async (c) => {
    const [[funnel], accounts, locales, calendars] = await Promise.all([
      rows<Record<string, number>>(sql`select
        count(*)::int registered,
        count(*) filter (where exists (select 1 from friendships f where u.id in (f.user_a, f.user_b)))::int friended,
        count(*) filter (where exists (select 1 from group_members m where m.user_id = u.id))::int grouped,
        count(*) filter (where exists (select 1 from expenses e where e.created_by = u.id))::int expensed,
        count(*) filter (where exists (select 1 from settlements s where s.created_by = u.id or s.from_user = u.id or s.to_user = u.id))::int settled,
        count(*) filter (where exists (select 1 from ai_sessions a where a.user_id = u.id))::int ai
        from users u where registered`),
      rows(sql`select k, count(*)::int n from (select case when google_sub is not null and password_hash is not null then 'google+password'
        when google_sub is not null then 'google' when password_hash is not null then 'password' when username is not null then 'staff' else 'email code' end k
        from users where registered) x group by 1 order by n desc`),
      rows(sql`select locale k, count(*)::int n from users where registered group by 1 order by n desc`),
      rows(sql`select calendar k, count(*)::int n from users where registered group by 1 order by n desc`),
    ]);
    return c.json({ funnel, accounts, locales, calendars });
  })
  /** Weekly sign-up cohorts: share of each cohort active N weeks later. */
  .get('/retention', async (c) => {
    const weeks = Math.min(Math.max(Number(c.req.query('weeks') ?? 8), 2), 16);
    const data = await rows<{ cohort: string; size: number; w: number; n: number }>(sql`
      with u as (select id, date_trunc('week', joined_at at time zone ${TZ})::date cohort from users where registered and joined_at is not null
                 and joined_at > now() - (${weeks} * interval '1 week')),
      a as (select distinct x.user_id, ((x.day - u.cohort) / 7)::int w from ${ACTIVITY} x join u on u.id = x.user_id where x.day >= u.cohort)
      select to_char(u.cohort, 'YYYY-MM-DD') cohort, count(distinct u.id)::int size, a.w, count(distinct a.user_id)::int n
      from u left join a on a.user_id = u.id group by u.cohort, a.w order by u.cohort, a.w`);
    const cohorts = new Map<string, { cohort: string; size: number; weeks: number[] }>();
    for (const r of data) {
      const k = cohorts.get(r.cohort) ?? { cohort: r.cohort, size: 0, weeks: [] };
      k.size = Math.max(k.size, r.size);
      if (r.w != null) k.weeks[r.w] = r.n;
      cohorts.set(r.cohort, k);
    }
    // Size is the cohort's member count, same on every row of that cohort.
    const sizes = await rows<{ cohort: string; size: number }>(sql`select to_char(date_trunc('week', joined_at at time zone ${TZ})::date, 'YYYY-MM-DD') cohort, count(*)::int size
      from users where registered and joined_at > now() - (${weeks} * interval '1 week') group by 1`);
    for (const s of sizes) { const k = cohorts.get(s.cohort); if (k) k.size = s.size; }
    return c.json({ cohorts: [...cohorts.values()].map((k) => ({ ...k, weeks: Array.from(k.weeks, (n) => n ?? 0) })) });
  })

  // ================= live feed =================
  .get('/feed', async (c) => {
    const before = c.req.query('before') ? new Date(c.req.query('before')!) : new Date(Date.now() + 60e3);
    const cats = (c.req.query('cats') ?? FEED_CATS.join(',')).split(',').filter((x) => (FEED_CATS as readonly string[]).includes(x));
    const limit = Math.min(Number(c.req.query('limit') ?? 60) || 60, 200);
    const out = await feed(isNaN(+before) ? new Date() : before, cats.length ? cats : [...FEED_CATS], limit);
    const live = liveStats();
    return c.json({ ...out, online: Object.entries(await names(live.users)).map(([id, p]) => ({ id, name: p.name })), streams: live.streams });
  })
  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    if (q.length < 2) return c.json({ users: [], groups: [], expenses: [] });
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const isId = z.uuid().safeParse(q).success;
    const [us, gs, es] = await Promise.all([
      db.select({ id: users.id, name: users.name, email: users.email, username: users.username, registered: users.registered, role: users.role }).from(users)
        .where(or(ilike(users.name, like), ilike(users.email, like), ilike(users.username, like), ilike(users.phone, like),
          eq(users.friendCode, normCode(q)), isId ? eq(users.id, q) : undefined)).orderBy(desc(users.registered), users.name).limit(6),
      db.select({ id: groups.id, name: groups.name, type: groups.type }).from(groups).where(or(ilike(groups.name, like), isId ? eq(groups.id, q) : undefined)).limit(5),
      db.select({ id: expenses.id, description: expenses.description, amount: expenses.amount, groupId: expenses.groupId, deletedAt: expenses.deletedAt })
        .from(expenses).where(or(ilike(expenses.description, like), isId ? eq(expenses.id, q) : undefined)).orderBy(desc(expenses.createdAt)).limit(5),
    ]);
    return c.json({ users: us, groups: gs, expenses: es });
  })

  // ================= users =================
  .get('/users', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const filter = c.req.query('filter') ?? 'registered';
    const sort = c.req.query('sort') ?? 'joined';
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const where = and(
      q ? or(ilike(users.name, like), ilike(users.email, like), ilike(users.username, like), ilike(users.phone, like), eq(users.friendCode, normCode(q))) : undefined,
      filter === 'registered' ? eq(users.registered, true) : filter === 'placeholders' ? eq(users.registered, false)
        : filter === 'admins' ? eq(users.role, 'admin') : filter === 'suspended' ? isNotNull(users.suspendedAt) : undefined,
    );
    const paid = sql<number>`(select coalesce(sum(p.amount), 0)::float8 from expense_payers p join expenses e on e.id = p.expense_id where p.user_id = ${users.id} and e.deleted_at is null)`;
    const stats = {
      groups: sql<number>`(select count(*)::int from group_members m where m.user_id = ${users.id})`,
      friends: sql<number>`(select count(*)::int from friendships f where ${users.id} in (f.user_a, f.user_b))`,
      expenses: sql<number>`(select count(*)::int from expenses e where e.created_by = ${users.id} and e.deleted_at is null)`,
      paid,
    };
    const order = {
      joined: sql`coalesce(${users.joinedAt}, ${users.createdAt}) desc`, seen: sql`${users.lastSeenAt} desc nulls last`,
      name: sql`lower(${users.name})`, paid: sql`${paid} desc`, groups: sql`${stats.groups} desc`,
    }[sort] ?? sql`coalesce(${users.joinedAt}, ${users.createdAt}) desc`;
    const page = pageOf(c);
    const [list, [{ n }]] = await Promise.all([
      db.select({ u: users, ...stats }).from(users).where(where).orderBy(order).limit(PAGE).offset(page * PAGE),
      db.select({ n: sql<number>`count(*)::int` }).from(users).where(where),
    ]);
    const live = new Set(liveStats().users);
    return c.json({
      total: n, page, pageSize: PAGE,
      users: list.map(({ u, ...s }) => ({ ...adminUser(u), ...s, online: live.has(u.id) })),
    });
  })
  .get('/users/:id', async (c) => {
    const id = idOf(c);
    const u = await getUser(id);
    const [gs, fids, exps, sets, ai, sess, refs, ledger, days, [counts]] = await Promise.all([
      db.select({ id: groups.id, name: groups.name, type: groups.type, createdBy: groups.createdBy,
        members: sql<number>`(select count(*)::int from group_members m where m.group_id = ${groups.id})` })
        .from(groups).innerJoin(groupMembers, and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, id))),
      friendIds(id),
      db.select({ id: expenses.id }).from(expenses).where(involved(id)).orderBy(desc(expenses.createdAt)).limit(25)
        .then((r) => (r.length ? loadExpenses(inArray(expenses.id, r.map((x) => x.id))) : [])),
      db.select().from(settlements).where(or(eq(settlements.fromUser, id), eq(settlements.toUser, id))).orderBy(desc(settlements.createdAt)).limit(25),
      db.select().from(aiSessions).where(eq(aiSessions.userId, id)).orderBy(desc(aiSessions.createdAt)).limit(15),
      db.select({ tokenHash: sessions.tokenHash, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt, method: sessions.method, ip: sessions.ip,
        userAgent: sessions.userAgent, impersonatorId: sessions.impersonatorId }).from(sessions)
        .where(and(eq(sessions.userId, id), sql`${sessions.expiresAt} > now()`)).orderBy(desc(sessions.createdAt)),
      db.select({ id: users.id, name: users.name, joinedAt: users.joinedAt }).from(users).where(eq(users.referredBy, id)),
      u.registered ? loadLedger(id) : Promise.resolve(null),
      rows<{ day: string }>(sql`select to_char(day, 'YYYY-MM-DD') as day from ${ACTIVITY} x where user_id = ${id} and day > current_date - 180 group by day`),
      rows<Record<string, number>>(sql`select
        (select count(*)::int from notifications where user_id = ${id}) notifications,
        (select count(*)::int from expenses where created_by = ${id}) created,
        (select coalesce(sum(p.amount), 0)::float8 from expense_payers p join expenses e on e.id = p.expense_id where p.user_id = ${id} and e.deleted_at is null) paid,
        (select coalesce(sum(s.amount), 0)::float8 from expense_shares s join expenses e on e.id = s.expense_id where s.user_id = ${id} and e.deleted_at is null) share`),
    ]);
    // Balance as the user sees it: what others owe them, and what they owe.
    let owed = 0, owe = 0;
    if (ledger) for (const ds of ledger.debts.values()) for (const [, a] of balancesFor(id, ds)) a > 0 ? (owed += a) : (owe -= a);
    const { items: history, people: historyPeople } = await feed(new Date(Date.now() + 60e3), [...FEED_CATS], 40, id);
    const people = await names([u.createdBy, u.referredBy, ...fids, ...idsOfExps(exps), ...sets.flatMap((s) => [s.fromUser, s.toUser, s.createdBy]), ...sess.map((s) => s.impersonatorId)]);
    return c.json({
      user: { ...adminUser(u), online: liveStats().users.includes(id) },
      counts, balance: { owed, owe }, groups: gs, friendIds: fids, expenses: exps, settlements: sets, aiSessions: ai,
      sessions: sess.map(({ tokenHash, ...s }) => ({ ...s, id: tokenHash.slice(0, 16) })),
      referrals: refs, activeDays: days.map((d) => d.day), history, people: { ...historyPeople, ...people },
      groupNames: await groupNames([...exps.map((e) => e.groupId), ...history.map((h) => h.data.groupId as string | null)]),
    });
  })
  .patch('/users/:id', async (c) => {
    const me = c.get('user');
    const u = await getUser(idOf(c));
    const patch = await parse(c, userPatch);
    if (patch.role && patch.role !== u.role && u.id === me.id) fail(400, "You can't change your own role");
    if (patch.role === 'user' && u.role === 'admin') {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'admin'));
      if (n <= 1) fail(409, 'There must be at least one admin');
    }
    const [row] = await db.update(users).set(patch).where(eq(users.id, u.id)).returning()
      .catch((e) => (isUnique(e) ? fail(409, 'That email or username is already taken') : Promise.reject(e)));
    const changed = Object.fromEntries(Object.keys(patch).map((k) => [k, { from: u[k as keyof User], to: row[k as keyof User] }]));
    await audit(c, me.id, patch.role && patch.role !== u.role ? `admin.user.role.${patch.role}` : 'admin.user.edit', { type: 'user', id: u.id }, { changed });
    await sync(await circleOf(u.id));
    return c.json(adminUser(row));
  })
  .post('/users/:id/credits', async (c) => {
    const u = await getUser(idOf(c));
    const { bonus = 0, resetMonthly = false } = await parse(c, z.object({ bonus: z.number().int().min(-10_000).max(10_000).optional(), resetMonthly: z.boolean().optional() }));
    const [row] = await db.update(users).set({
      aiBonus: sql`greatest(${users.aiBonus} + ${bonus}, 0)`,
      ...(resetMonthly && { aiUsed: 0, aiPeriod: creditPeriod() }),
    }).where(eq(users.id, u.id)).returning();
    await audit(c, c.get('user').id, 'admin.user.credits', { type: 'user', id: u.id }, { bonus, resetMonthly, before: creditsOf(u).left, after: creditsOf(row).left });
    if (bonus > 0) await notify([u.id], c.get('user').id, 'admin_message', { message: `You got ${bonus} bonus AI credits 🎁` });
    await sync([u.id]);
    return c.json(adminUser(row));
  })
  .post('/users/:id/suspend', async (c) => {
    const me = c.get('user');
    const u = await getUser(idOf(c));
    if (u.id === me.id) fail(400, "You can't suspend yourself");
    const { reason } = await parse(c, z.object({ reason: z.string().trim().max(200).default('') }));
    const [row] = await db.update(users).set({ suspendedAt: new Date(), suspendReason: reason || null }).where(eq(users.id, u.id)).returning();
    const killed = await db.delete(sessions).where(eq(sessions.userId, u.id)).returning({ t: sessions.tokenHash });
    await audit(c, me.id, 'admin.user.suspend', { type: 'user', id: u.id }, { reason, sessionsEnded: killed.length });
    await sync([u.id]); // their open tabs refetch, get 401 and land on the login screen
    return c.json(adminUser(row));
  })
  .post('/users/:id/unsuspend', async (c) => {
    const u = await getUser(idOf(c));
    const [row] = await db.update(users).set({ suspendedAt: null, suspendReason: null }).where(eq(users.id, u.id)).returning();
    await audit(c, c.get('user').id, 'admin.user.unsuspend', { type: 'user', id: u.id });
    return c.json(adminUser(row));
  })
  .post('/users/:id/logout', async (c) => {
    const u = await getUser(idOf(c));
    const { session } = await parse(c, z.object({ session: z.string().regex(/^[0-9a-f]{16}$/).optional() }));
    const killed = await db.delete(sessions)
      .where(and(eq(sessions.userId, u.id), session ? sql`left(${sessions.tokenHash}, 16) = ${session}` : undefined)).returning({ t: sessions.tokenHash });
    await audit(c, c.get('user').id, 'admin.user.logout', { type: 'user', id: u.id }, { sessionsEnded: killed.length, one: !!session });
    await sync([u.id]);
    return c.json({ ended: killed.length });
  })
  .post('/users/:id/password', async (c) => {
    const u = await getUser(idOf(c));
    const { password, logoutOthers } = await parse(c, z.object({ password: z.string().min(8, 'Password needs at least 8 characters').max(200), logoutOthers: z.boolean().default(true) }));
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, u.id));
    if (logoutOthers && u.id !== c.get('user').id) await db.delete(sessions).where(eq(sessions.userId, u.id));
    await audit(c, c.get('user').id, 'admin.user.password', { type: 'user', id: u.id }, { logoutOthers });
    return c.json({ ok: true });
  })
  .post('/users/:id/message', async (c) => {
    const u = await getUser(idOf(c));
    if (!u.registered) fail(400, "They haven't joined Split-Up yet");
    const { message: m } = await parse(c, message);
    await notify([u.id], c.get('user').id, 'admin_message', { message: m });
    await audit(c, c.get('user').id, 'admin.user.message', { type: 'user', id: u.id }, { message: m });
    return c.json({ ok: true });
  })
  /** "View as": a short session as this user, with the admin's own session kept aside for the way back. Web only. */
  .post('/users/:id/impersonate', async (c) => {
    const me = c.get('user');
    const u = await getUser(idOf(c));
    if (u.id === me.id) fail(400, "That's you");
    const mine = getCookie(c, 'sid');
    if (!mine) fail(400, 'View as only works in the browser');
    const t = token(32);
    await db.insert(sessions).values({ tokenHash: sha(t), userId: u.id, expiresAt: new Date(Date.now() + 2 * 3600e3), method: 'impersonate', impersonatorId: me.id, ...sessionMeta(c) });
    setCookie(c, 'sid_admin', mine!, { ...SID, maxAge: 2 * 3600 });
    setCookie(c, 'sid', t, { ...SID, maxAge: 2 * 3600 });
    await audit(c, me.id, 'admin.impersonate.start', { type: 'user', id: u.id }, { name: u.name });
    return c.json({ ok: true });
  })
  /** Scrub personal data but keep the ledger intact, so friends' balances still add up. */
  .post('/users/:id/anonymize', async (c) => {
    const me = c.get('user');
    const u = await getUser(idOf(c));
    if (u.id === me.id) fail(400, "You can't anonymize yourself");
    const [row] = await db.update(users).set({
      name: 'Deleted user', email: null, phone: null, username: null, googleSub: null, passwordHash: null, paymentQr: null,
      esewaId: null, khaltiId: null, friendCode: null, inviteToken: null, role: 'user', suspendedAt: new Date(), suspendReason: 'Account deleted',
    }).where(eq(users.id, u.id)).returning();
    await db.delete(sessions).where(eq(sessions.userId, u.id));
    await audit(c, me.id, 'admin.user.anonymize', { type: 'user', id: u.id }, { name: u.name, email: u.email });
    await sync(await circleOf(u.id));
    return c.json(adminUser(row));
  })
  /** Hard delete, only when it can't leave a hole in anyone's expenses or payments. */
  .delete('/users/:id', async (c) => {
    const me = c.get('user');
    const u = await getUser(idOf(c));
    if (u.id === me.id) fail(400, "You can't delete yourself");
    const [{ n }] = await rows<{ n: number }>(sql`select (
      (select count(*) from expense_payers where user_id = ${u.id}) + (select count(*) from expense_shares where user_id = ${u.id}) +
      (select count(*) from settlements where ${u.id} in (from_user, to_user, created_by)) + (select count(*) from expenses where created_by = ${u.id}) +
      (select count(*) from groups where created_by = ${u.id}))::int n`);
    if (n) fail(409, `${u.name} is part of ${n} expense, payment or group record${n === 1 ? '' : 's'}. Deleting would break other people's balances, so anonymize instead.`);
    const circle = await circleOf(u.id);
    await db.delete(users).where(eq(users.id, u.id));
    await audit(c, me.id, 'admin.user.delete', { type: 'user', id: u.id }, { name: u.name, email: u.email });
    await sync(circle);
    return c.json({ ok: true });
  })
  .post('/credits/gift-all', async (c) => {
    const { amount, note } = await parse(c, z.object({ amount: z.number().int().min(1).max(100), note: z.string().trim().max(200).optional() }));
    const r = await db.update(users).set({ aiBonus: sql`${users.aiBonus} + ${amount}` }).where(and(eq(users.registered, true), isNull(users.suspendedAt))).returning({ id: users.id });
    if (note) await notify(r.map((x) => x.id), c.get('user').id, 'admin_message', { message: note });
    await audit(c, c.get('user').id, 'admin.credits.gift_all', null, { amount, users: r.length, note });
    await sync(r.map((x) => x.id));
    return c.json({ users: r.length });
  })

  // ================= groups =================
  .get('/groups', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const where = q ? ilike(groups.name, like) : undefined;
    const stats = {
      members: sql<number>`(select count(*)::int from group_members m where m.group_id = ${groups.id})`,
      expenses: sql<number>`(select count(*)::int from expenses e where e.group_id = ${groups.id} and e.deleted_at is null)`,
      volume: sql<number>`(select coalesce(sum(amount), 0)::float8 from expenses e where e.group_id = ${groups.id} and e.deleted_at is null)`,
      lastAt: sql<string>`(select max(coalesce(e.updated_at, e.created_at)) from expenses e where e.group_id = ${groups.id})`,
    };
    const sort = c.req.query('sort') ?? 'recent';
    const order = { recent: desc(groups.createdAt), volume: sql`${stats.volume} desc`, members: sql`${stats.members} desc`, active: sql`${stats.lastAt} desc nulls last` }[sort] ?? desc(groups.createdAt);
    const page = pageOf(c);
    const [list, [{ n }]] = await Promise.all([
      db.select({ g: groups, ...stats }).from(groups).where(where).orderBy(order).limit(PAGE).offset(page * PAGE),
      db.select({ n: sql<number>`count(*)::int` }).from(groups).where(where),
    ]);
    const people = await names(list.map((r) => r.g.createdBy));
    return c.json({ total: n, page, pageSize: PAGE, groups: list.map(({ g, ...s }) => ({ ...g, ...s })), people });
  })
  .get('/groups/:id', async (c) => {
    const [g] = await db.select().from(groups).where(eq(groups.id, idOf(c)));
    if (!g) fail(404, 'Group not found');
    const mids = await memberIds(g.id);
    const [exps, sets] = await Promise.all([
      loadExpenses(eq(expenses.groupId, g.id)),
      db.select().from(settlements).where(eq(settlements.groupId, g.id)).orderBy(desc(settlements.createdAt)),
    ]);
    const live = { expenses: exps.filter((e) => !e.deletedAt), settlements: sets.filter((s) => !s.deletedAt) };
    return c.json({
      group: { ...g, memberIds: mids }, expenses: exps, settlements: sets,
      debts: ledgerDebts(live, g.simplify),
      people: await names([...mids, g.createdBy, ...idsOfExps(exps), ...sets.flatMap((s) => [s.fromUser, s.toUser])]),
      volume: sum(live.expenses.map((e) => e.amount)),
    });
  })
  .patch('/groups/:id', async (c) => {
    const id = idOf(c);
    const patch = await parse(c, z.object({ name: z.string().trim().min(1).max(60), type: z.enum(GROUP_TYPES), simplify: z.boolean() }).partial());
    const [g] = await db.update(groups).set(patch).where(eq(groups.id, id)).returning();
    if (!g) fail(404, 'Group not found');
    await audit(c, c.get('user').id, 'admin.group.edit', { type: 'group', id }, patch);
    await sync(await memberIds(id));
    return c.json(g);
  })
  .delete('/groups/:id', async (c) => {
    const [g] = await db.select().from(groups).where(eq(groups.id, idOf(c)));
    if (!g) fail(404, 'Group not found');
    const mids = await memberIds(g.id);
    await db.delete(groups).where(eq(groups.id, g.id));
    await notify(mids, c.get('user').id, 'group_deleted', { group: g.name });
    await audit(c, c.get('user').id, 'admin.group.delete', { type: 'group', id: g.id }, { name: g.name, members: mids.length });
    await sync(mids);
    return c.json({ ok: true });
  })
  .post('/groups/:id/members', async (c) => {
    const id = idOf(c);
    const { userId } = await parse(c, z.object({ userId: z.uuid() }));
    const [g] = await db.select().from(groups).where(eq(groups.id, id));
    if (!g) fail(404, 'Group not found');
    await getUser(userId);
    const mids = await memberIds(id);
    await db.transaction(async (tx) => {
      await tx.insert(groupMembers).values({ groupId: id, userId }).onConflictDoNothing();
      const rowsF = mids.filter((m) => m !== userId).map((m) => pair(m, userId));
      if (rowsF.length) await tx.insert(friendships).values(rowsF).onConflictDoNothing();
    });
    await notify([userId], c.get('user').id, 'group_added', { groupId: id, group: g.name });
    await audit(c, c.get('user').id, 'admin.group.member.add', { type: 'group', id }, { userId });
    await sync([...mids, userId]);
    return c.json({ ok: true });
  })
  .delete('/groups/:id/members/:userId', async (c) => {
    const id = idOf(c), uid = idOf(c, 'userId');
    const [g] = await db.select().from(groups).where(eq(groups.id, id));
    if (!g) fail(404, 'Group not found');
    const force = c.req.query('force') === '1';
    if (!force) {
      const [exps, sets] = await Promise.all([
        loadExpenses(and(eq(expenses.groupId, id), isNull(expenses.deletedAt))!),
        db.select().from(settlements).where(and(eq(settlements.groupId, id), isNull(settlements.deletedAt))),
      ]);
      if (ledgerDebts({ expenses: exps, settlements: sets }, g.simplify).some((d) => d.from === uid || d.to === uid)) fail(409, 'They still have a balance in this group');
    }
    const mids = await memberIds(id);
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, id), eq(groupMembers.userId, uid)));
    await notify([uid], c.get('user').id, 'group_removed', { group: g.name });
    await audit(c, c.get('user').id, 'admin.group.member.remove', { type: 'group', id }, { userId: uid, force });
    await sync(mids);
    return c.json({ ok: true });
  })

  // ================= money =================
  .get('/expenses', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const status = c.req.query('status') ?? 'active';
    const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const uid = z.uuid().safeParse(c.req.query('userId')).data, gid = z.uuid().safeParse(c.req.query('groupId')).data;
    const cat = c.req.query('category');
    const where = and(
      q ? ilike(expenses.description, like) : undefined,
      status === 'active' ? isNull(expenses.deletedAt) : status === 'deleted' ? isNotNull(expenses.deletedAt) : undefined,
      uid ? involved(uid) : undefined, gid ? eq(expenses.groupId, gid) : undefined,
      cat && cat in CATEGORIES ? eq(expenses.category, cat) : undefined,
    );
    const page = pageOf(c);
    const [ids, [{ n, v }]] = await Promise.all([
      db.select({ id: expenses.id }).from(expenses).where(where).orderBy(desc(expenses.createdAt)).limit(PAGE).offset(page * PAGE),
      db.select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(${expenses.amount}), 0)::float8` }).from(expenses).where(where),
    ]);
    const list = ids.length ? await loadExpenses(inArray(expenses.id, ids.map((r) => r.id))) : [];
    list.sort((a, b) => +b.createdAt - +a.createdAt);
    return c.json({
      total: n, volume: v, page, pageSize: PAGE, expenses: list,
      people: await names([...idsOfExps(list), ...list.map((e) => e.createdBy)]), groups: await groupNames(list.map((e) => e.groupId)),
    });
  })
  .get('/expenses/:id', async (c) => {
    const [e] = await loadExpenses(eq(expenses.id, idOf(c)));
    if (!e) fail(404, 'Expense not found');
    return c.json({ expense: e, people: await names([...idsOfExps([e]), e.createdBy]), groups: await groupNames([e.groupId]) });
  })
  .delete('/expenses/:id', async (c) => {
    const [e] = await loadExpenses(eq(expenses.id, idOf(c)));
    if (!e) fail(404, 'Expense not found');
    const hard = c.req.query('hard') === '1';
    if (hard) await db.delete(expenses).where(eq(expenses.id, e.id));
    else await db.update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, e.id));
    await audit(c, c.get('user').id, hard ? 'admin.expense.purge' : 'admin.expense.delete', { type: 'expense', id: e.id }, { description: e.description, amount: e.amount, groupId: e.groupId });
    await sync([...idsOfExps([e]), ...(e.groupId ? await memberIds(e.groupId) : [])]);
    return c.json({ ok: true });
  })
  .post('/expenses/:id/restore', async (c) => {
    const [e] = await loadExpenses(eq(expenses.id, idOf(c)));
    if (!e) fail(404, 'Expense not found');
    await db.update(expenses).set({ deletedAt: null }).where(eq(expenses.id, e.id));
    await audit(c, c.get('user').id, 'admin.expense.restore', { type: 'expense', id: e.id }, { description: e.description, amount: e.amount });
    await sync([...idsOfExps([e]), ...(e.groupId ? await memberIds(e.groupId) : [])]);
    return c.json({ ok: true });
  })
  .get('/settlements', async (c) => {
    const status = c.req.query('status') ?? 'active';
    const method = c.req.query('method');
    const uid = z.uuid().safeParse(c.req.query('userId')).data;
    const where = and(
      status === 'active' ? isNull(settlements.deletedAt) : status === 'deleted' ? isNotNull(settlements.deletedAt) : undefined,
      method ? eq(settlements.method, method) : undefined,
      uid ? or(eq(settlements.fromUser, uid), eq(settlements.toUser, uid)) : undefined,
    );
    const page = pageOf(c);
    const [list, [{ n, v }]] = await Promise.all([
      db.select().from(settlements).where(where).orderBy(desc(settlements.createdAt)).limit(PAGE).offset(page * PAGE),
      db.select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(${settlements.amount}), 0)::float8` }).from(settlements).where(where),
    ]);
    return c.json({
      total: n, volume: v, page, pageSize: PAGE, settlements: list,
      people: await names(list.flatMap((s) => [s.fromUser, s.toUser, s.createdBy])), groups: await groupNames(list.map((s) => s.groupId)),
    });
  })
  .delete('/settlements/:id', async (c) => {
    const [s] = await db.select().from(settlements).where(eq(settlements.id, idOf(c)));
    if (!s) fail(404, 'Payment not found');
    await db.update(settlements).set({ deletedAt: new Date() }).where(eq(settlements.id, s.id));
    await audit(c, c.get('user').id, 'admin.settlement.delete', { type: 'settlement', id: s.id }, { amount: s.amount, from: s.fromUser, to: s.toUser });
    await sync([s.fromUser, s.toUser, ...(s.groupId ? await memberIds(s.groupId) : [])]);
    return c.json({ ok: true });
  })
  .post('/settlements/:id/restore', async (c) => {
    const [s] = await db.select().from(settlements).where(eq(settlements.id, idOf(c)));
    if (!s) fail(404, 'Payment not found');
    await db.update(settlements).set({ deletedAt: null }).where(eq(settlements.id, s.id));
    await audit(c, c.get('user').id, 'admin.settlement.restore', { type: 'settlement', id: s.id }, { amount: s.amount });
    await sync([s.fromUser, s.toUser, ...(s.groupId ? await memberIds(s.groupId) : [])]);
    return c.json({ ok: true });
  })

  // ================= AI =================
  .get('/ai', async (c) => {
    const p = await period(c);
    const local = sql.raw(`(created_at at time zone '${TZ}')::date`);
    const cur = creditPeriod();
    const [series, top, [pool], recent, turns] = await Promise.all([
      rows(sql`with d as (select generate_series(${p.start}::date, ${p.end}::date, interval '1 day')::date as day)
        select to_char(d.day, 'YYYY-MM-DD') as day, count(a.id) filter (where a.bucket = 'monthly')::int monthly, count(a.id) filter (where a.bucket = 'bonus')::int bonus
        from d left join ai_sessions a on ${sql.raw(`(a.created_at at time zone '${TZ}')::date`)} = d.day group by d.day order by d.day`),
      rows(sql`select u.id, u.name, u.email, count(*)::int n, sum(a.turns)::int turns, u.ai_bonus bonus,
          case when u.ai_period = ${cur} then u.ai_used else 0 end used
        from ai_sessions a join users u on u.id = a.user_id where ${sql.raw(`(a.created_at at time zone '${TZ}')::date`)} between ${p.start}::date and ${p.end}::date
        group by u.id order by n desc limit 10`),
      rows<Record<string, number>>(sql`select
        coalesce(sum(ai_bonus), 0)::int bonus,
        coalesce(sum(case when ai_period = ${cur} then ai_used else 0 end), 0)::int used,
        count(*) filter (where (case when ai_period = ${cur} then ai_used else 0 end) >= ${AI_FREE_MONTHLY} and ai_bonus = 0)::int empty,
        count(*) filter (where referred_by is not null)::int referred,
        count(*)::int users
        from users where registered`),
      db.select({ s: aiSessions, name: users.name }).from(aiSessions).innerJoin(users, eq(users.id, aiSessions.userId)).orderBy(desc(aiSessions.createdAt)).limit(25),
      rows(sql`select least(turns, 10) k, count(*)::int n from ai_sessions where ${local} between ${p.start}::date and ${p.end}::date group by 1 order by 1`),
    ]);
    const s = await settings();
    return c.json({
      period: p, series, top, pool, turns,
      recent: recent.map((r) => ({ ...r.s, name: r.name })),
      config: { configured: !!process.env.OPENAI_API_KEY, enabled: s.aiEnabled, model: process.env.OPENAI_MODEL || 'gpt-5.5', freeMonthly: AI_FREE_MONTHLY, period: cur },
    });
  })

  // ================= platform =================
  .get('/settings', async (c) => c.json(await settings()))
  .put('/settings', async (c) => {
    const patch = await parse(c, settingsInput);
    const before = await settings();
    const after = await saveSettings(patch as Partial<Settings>, c.get('user').id);
    for (const k of Object.keys(patch) as (keyof Settings)[]) {
      await audit(c, c.get('user').id, `admin.settings.${k}`, { type: 'settings', id: k }, { from: before[k], to: after[k] });
    }
    // Everyone online refetches /config (banner, AI button) and /me (maintenance).
    await sync(liveStats().users);
    return c.json(after);
  })
  .post('/broadcast', async (c) => {
    const { message: m } = await parse(c, message);
    const all = await db.select({ id: users.id }).from(users).where(and(eq(users.registered, true), isNull(users.suspendedAt)));
    await notify(all.map((u) => u.id), c.get('user').id, 'broadcast', { message: m });
    await audit(c, c.get('user').id, 'admin.broadcast', null, { message: m, users: all.length });
    return c.json({ sent: all.length - 1 });
  })
  .get('/audit', async (c) => {
    const page = pageOf(c);
    const action = c.req.query('action');
    const where = and(
      action === 'admin' ? sql`${auditLog.action} like 'admin.%'` : action === 'login' ? eq(auditLog.action, 'login') : undefined,
      z.uuid().safeParse(c.req.query('actorId')).success ? eq(auditLog.actorId, c.req.query('actorId')!) : undefined,
    );
    const [list, [{ n }]] = await Promise.all([
      db.select().from(auditLog).where(where).orderBy(desc(auditLog.at)).limit(PAGE).offset(page * PAGE),
      db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(where),
    ]);
    return c.json({ total: n, page, pageSize: PAGE, items: list, people: await names(list.flatMap((r) => [r.actorId, r.targetType === 'user' ? r.targetId : null])) });
  })
  .get('/system', async (c) => {
    const [[db_], tables, [mig], [conns]] = await Promise.all([
      rows<{ version: string; size: number; now: string }>(sql`select version() version, pg_database_size(current_database())::float8 size, now()::text now`),
      rows(sql`select relname t, n_live_tup::float8 n, pg_total_relation_size(relid)::float8 size from pg_stat_user_tables order by size desc`),
      rows<{ n: number; last: string | null }>(sql`select count(*)::int n, max(created_at)::text last from drizzle.__drizzle_migrations`).catch(() => [{ n: 0, last: null }]),
      rows<{ n: number }>(sql`select count(*)::int n from pg_stat_activity where datname = current_database()`),
    ]);
    const mem = process.memoryUsage();
    const live = liveStats();
    return c.json({
      server: {
        node: process.version, uptime: process.uptime(), pid: process.pid, platform: `${process.platform} ${process.arch}`,
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal }, env: process.env.NODE_ENV ?? 'development',
        socket: !!process.env.SOCKET_PATH,
      },
      db: { version: db_.version.split(' on ')[0], size: db_.size, connections: conns.n, migrations: mig.n, now: db_.now },
      tables,
      live: { users: live.users.length, streams: live.streams },
      integrations: {
        email: !!process.env.SMTP_HOST, google: !!process.env.GOOGLE_CLIENT_ID, googleRedirect: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        openai: !!process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-5.5', adminEmails: (process.env.ADMIN_EMAILS ?? '').split(',').filter(Boolean).length,
      },
      defaults: DEFAULT_SETTINGS,
    });
  })
  .get('/export/:kind', async (c) => {
    const kind = c.req.param('kind');
    let data: Record<string, unknown>[];
    if (kind === 'users') {
      data = (await db.select().from(users).orderBy(users.createdAt)).map((u) => ({
        id: u.id, name: u.name, email: u.email, username: u.username, phone: u.phone, registered: u.registered, role: u.role,
        locale: u.locale, calendar: u.calendar, createdAt: u.createdAt, joinedAt: u.joinedAt, lastSeenAt: u.lastSeenAt,
        suspendedAt: u.suspendedAt, aiBonus: u.aiBonus, referredBy: u.referredBy, google: !!u.googleSub, password: !!u.passwordHash,
      }));
    } else if (kind === 'expenses') {
      data = (await db.select().from(expenses).orderBy(expenses.createdAt)).map(({ meta, ...e }) => ({ ...e, amount: e.amount / 100 }));
    } else if (kind === 'settlements') {
      data = (await db.select().from(settlements).orderBy(settlements.createdAt)).map((s) => ({ ...s, amount: s.amount / 100 }));
    } else if (kind === 'groups') {
      data = await db.select({ g: groups, members: sql<number>`(select count(*)::int from group_members m where m.group_id = ${groups.id})` })
        .from(groups).orderBy(groups.createdAt).then((r) => r.map(({ g: { inviteCode, ...g }, members }) => ({ ...g, members })));
    } else if (kind === 'audit') {
      data = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(50_000);
    } else return fail(404, 'Unknown export');
    await audit(c, c.get('user').id, 'admin.export', null, { kind, rows: data.length });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="splitup-${kind}-${nepalToday()}.csv"`);
    return c.body('﻿' + csv(data)); // BOM so Excel reads नेपाली names right
  });

const idsOfExps = (exps: { payers: { userId: string }[]; shares: { userId: string }[] }[]) => exps.flatMap((e) => [...e.payers, ...e.shares].map((p) => p.userId));

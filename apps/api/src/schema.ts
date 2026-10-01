import { pgTable, uuid, text, timestamp, integer, bigint, boolean, jsonb, date, primaryKey, index } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const money = (name: string) => bigint(name, { mode: 'number' }).notNull(); // paisa

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').unique(),
  phone: text('phone'),
  googleSub: text('google_sub').unique(),
  passwordHash: text('password_hash'), // optional: code/Google users may never set one
  registered: boolean('registered').notNull().default(false), // false = placeholder added by a friend
  inviteToken: text('invite_token').unique(), // lets a placeholder be claimed on signup
  friendCode: text('friend_code').unique(), // personal add-me code behind the QR / splitup…/add/<code> link
  locale: text('locale').notNull().default('en'),
  calendar: text('calendar').notNull().default('ad'),
  esewaId: text('esewa_id'),
  khaltiId: text('khalti_id'),
  paymentQr: text('payment_qr'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  joinedAt: ts('joined_at'), // became a real account (sign-up, or a placeholder claimed); starts the invite-code window
  // AI credits: free ones used in `aiPeriod` ("2026-09", Nepal time), plus bonus ones that never expire
  aiUsed: integer('ai_used').notNull().default(0),
  aiPeriod: text('ai_period'),
  aiBonus: integer('ai_bonus').notNull().default(0),
  referredBy: uuid('referred_by'), // whose invite code they signed up with
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  username: text('username').unique(), // optional login name instead of an email (lowercase); used by staff accounts
  suspendedAt: ts('suspended_at'), // can't sign in or use the API while set
  suspendReason: text('suspend_reason'),
  lastSeenAt: ts('last_seen_at'), // updated at most every few minutes
}, (t) => [index().on(t.referredBy)]);

/** One AI bill. Its first request costs a credit; follow-ups on the same bill are free, within limits. */
export const aiSessions = pgTable('ai_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bucket: text('bucket').notNull(), // 'monthly' | 'bonus': where the credit came from, for refunds
  period: text('period').notNull(),
  turns: integer('turns').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index().on(t.userId)]);

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  method: text('method'), // password | code | google | impersonate
  ip: text('ip'),
  userAgent: text('user_agent'),
  impersonatorId: uuid('impersonator_id').references(() => users.id, { onDelete: 'cascade' }), // an admin "viewing as" this user
}, (t) => [index().on(t.userId)]);

/** One row per user per day they used the app (Nepal time). Drives DAU/WAU/MAU and retention. */
export const userDays = pgTable('user_days', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  day: date('day', { mode: 'string' }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.day] }), index().on(t.day)]);

/** Things that leave no other trace: sign-ins and every admin action. */
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  at: ts('at').notNull().defaultNow(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(), // 'login', 'admin.user.suspend', …
  targetType: text('target_type'), // 'user' | 'group' | 'expense' | 'settlement' | 'settings'
  targetId: text('target_id'),
  data: jsonb('data').notNull().default({}),
  ip: text('ip'),
}, (t) => [index().on(t.at), index().on(t.actorId), index().on(t.targetId)]);

/** Platform switches admins can flip at runtime (announcement, AI on/off, sign-ups, maintenance). */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export const otps = pgTable('otps', {
  email: text('email').primaryKey(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  sentAt: ts('sent_at').notNull().defaultNow(),
});

export const friendships = pgTable('friendships', {
  userA: uuid('user_a').notNull().references(() => users.id, { onDelete: 'cascade' }), // userA < userB
  userB: uuid('user_b').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.userA, t.userB] }), index().on(t.userB)]);

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: text('type').notNull().default('other'),
  simplify: boolean('simplify').notNull().default(true),
  inviteCode: text('invite_code').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const groupMembers = pgTable('group_members', {
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index().on(t.userId)]);

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  amount: money('amount'),
  category: text('category').notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  splitType: text('split_type').notNull(),
  meta: jsonb('meta'),
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at'),
  deletedAt: ts('deleted_at'),
}, (t) => [index().on(t.groupId)]);

const portion = (name: string) => pgTable(name, {
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: money('amount'),
}, (t) => [index().on(t.expenseId), index().on(t.userId)]);
export const expensePayers = portion('expense_payers');
export const expenseShares = portion('expense_shares');

export const settlements = pgTable('settlements', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
  fromUser: uuid('from_user').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUser: uuid('to_user').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: money('amount'),
  method: text('method').notNull(),
  note: text('note'),
  date: date('date', { mode: 'string' }).notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: ts('created_at').notNull().defaultNow(),
  confirmedAt: ts('confirmed_at'), // receiver said "got it"; doesn't change balances
  deletedAt: ts('deleted_at'),
}, (t) => [index().on(t.groupId), index().on(t.fromUser), index().on(t.toUser)]);

/** In-app inbox. `data` holds what the text needs (names, amounts) so it still reads right after deletes. */
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  data: jsonb('data').notNull().default({}),
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index().on(t.userId, t.createdAt)]);

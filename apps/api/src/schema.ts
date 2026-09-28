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
  locale: text('locale').notNull().default('en'),
  calendar: text('calendar').notNull().default('ad'),
  esewaId: text('esewa_id'),
  khaltiId: text('khalti_id'),
  paymentQr: text('payment_qr'),
  createdBy: uuid('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
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
  deletedAt: ts('deleted_at'),
}, (t) => [index().on(t.groupId), index().on(t.fromUser), index().on(t.toUser)]);

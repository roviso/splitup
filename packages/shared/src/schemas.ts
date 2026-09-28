import { z } from 'zod';
import { sum } from './split';
import { CATEGORIES, SPLIT_TYPES, PAY_METHODS, GROUP_TYPES, type Category } from './constants';

const id = z.uuid();
const paisa = z.number().int().positive().max(100_000_000_00); // up to रु 10 crore
const portion = z.object({ userId: id, amount: z.number().int().nonnegative() });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const expenseInput = z
  .object({
    groupId: id.nullable(),
    description: z.string().trim().min(1).max(100),
    amount: paisa,
    category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
    date: day,
    splitType: z.enum(SPLIT_TYPES),
    payers: z.array(portion).min(1).max(100),
    shares: z.array(portion).min(1).max(100),
    meta: z.record(z.string(), z.unknown()).optional(), // raw split inputs, so the form can be re-opened for editing
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((e) => sum(e.payers.map((p) => p.amount)) === e.amount, { message: 'Paid amounts must add up to the total', path: ['payers'] })
  .refine((e) => sum(e.shares.map((p) => p.amount)) === e.amount, { message: 'Split amounts must add up to the total', path: ['shares'] })
  .refine((e) => JSON.stringify(e.meta ?? {}).length < 20_000, { message: 'Too many items', path: ['meta'] });
export type ExpenseInput = z.infer<typeof expenseInput>;

export const settlementInput = z
  .object({
    groupId: id.nullable(),
    fromUser: id,
    toUser: id,
    amount: paisa,
    method: z.enum(PAY_METHODS),
    date: day,
    note: z.string().trim().max(200).optional(),
  })
  .refine((s) => s.fromUser !== s.toUser, { message: 'Payer and receiver must differ' });
export type SettlementInput = z.infer<typeof settlementInput>;

const contact = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email().toLowerCase().optional().or(z.literal('').transform(() => undefined)),
  phone: z.string().trim().max(20).optional(),
});
export const friendInput = contact;
export const importInput = z.object({ contacts: z.array(contact).min(1).max(500) });

export const groupInput = z.object({
  name: z.string().trim().min(1).max(60),
  type: z.enum(GROUP_TYPES).default('other'),
  memberIds: z.array(id).max(100).default([]),
  simplify: z.boolean().default(true),
});

export const profileInput = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().max(20).nullable(),
  locale: z.enum(['en', 'ne']),
  calendar: z.enum(['ad', 'bs']),
  esewaId: z.string().trim().max(40).nullable(),
  khaltiId: z.string().trim().max(40).nullable(),
  // ponytail: QR image stored inline as a data URL (<300KB); move to object storage if images grow.
  paymentQr: z.string().max(400_000).regex(/^data:image\/(png|jpeg|webp);base64,/).nullable(),
}).partial();

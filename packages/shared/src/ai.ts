import { z } from 'zod';
import { AI_FREE_MONTHLY, CATEGORIES, type Category } from './constants';
import { splitItemized, sum, type Portion } from './split';

/**
 * A bill that AI (a scanned photo or a chat message) and the user are shaping together, before it's saved.
 * Money is paisa. Every split is itemized under the hood: "2400 split between 4" is one item everyone had.
 */
export type DraftItem = { name: string; price: number; qty: number; userIds: string[] };
export type Draft = {
  description: string;
  category: Category;
  date: string;
  groupId: string | null;
  /** Who's in: the group's members, or me + the friends on this bill. */
  peopleIds: string[];
  items: DraftItem[];
  serviceCharge: number; // %
  vat: number; // %
  extra: number;
  discount: number;
  /** One payer with amount null = they paid the whole bill. */
  payers: { userId: string; amount: number | null }[];
  /** Grand total printed on a scanned bill, so we can show whether our maths matches it. */
  billTotal: number | null;
  /** Names the user mentioned who aren't in the group or their friends. */
  unknownNames: string[];
};

const id = z.uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const paisa = z.number().int().nonnegative().max(100_000_000_00);

export const draftSchema = z.object({
  description: z.string().max(100),
  category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
  date: day,
  groupId: id.nullable(),
  peopleIds: z.array(id).max(300),
  items: z.array(z.object({ name: z.string().max(100), price: paisa, qty: z.number().positive().max(1000), userIds: z.array(id).max(300) })).max(150),
  serviceCharge: z.number().min(0).max(100),
  vat: z.number().min(0).max(100),
  extra: paisa,
  discount: paisa,
  payers: z.array(z.object({ userId: id, amount: paisa.nullable() })).max(50),
  billTotal: paisa.nullable(),
  unknownNames: z.array(z.string().max(60)).max(20),
});

export const aiChatInput = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) })).min(1).max(40),
  draft: draftSchema.nullable(),
  /** Where it was opened from. Neither = the AI works out the group or friends from what the user says. */
  groupId: id.nullable(),
  friendId: id.nullable(),
  today: day,
  lang: z.enum(['en', 'ne']),
  /** The bill's AI session: follow-ups on the same bill don't cost another credit. */
  session: id.optional(),
});
export type AiChatInput = z.infer<typeof aiChatInput>;

// ~1.5 MB of JPEG after the browser shrinks it; the cap leaves room for an odd PNG.
export const aiScanInput = z.object({
  image: z.string().max(4_000_000).regex(/^data:image\/(png|jpeg|webp);base64,/, 'Send a photo (JPEG, PNG or WebP)'),
  session: id.optional(),
});

/** What the photo reader returns. Rupee amounts converted to paisa; nothing is assigned yet. */
export type ScannedBill = {
  readable: boolean;
  merchant: string | null;
  /** YYYY-MM-DD as printed. Nepali bills often print B.S. dates; `calendar` says which. */
  date: string | null;
  calendar: 'ad' | 'bs' | null;
  category: Category;
  items: { name: string; qty: number; price: number }[];
  serviceCharge: number; // %
  vat: number; // %
  extra: number;
  discount: number;
  total: number | null;
  note: string;
};

// ---------- AI credits ----------
const nepalMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit' });
/** The credit month, "2026-09", in Nepal time: free credits renew at midnight on the 1st in Kathmandu. */
export const creditPeriod = (now = new Date()) => nepalMonth.format(now).slice(0, 7);
/** First day of the next credit month, YYYY-MM-DD. */
export function creditRenewal(now = new Date()) {
  const [y, m] = creditPeriod(now).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
export type Credits = { left: number; monthly: number; bonus: number; perMonth: number; renewsOn: string };
/** What a user can still spend. `used` only counts if it's from this month. */
export function creditsOf(u: { aiUsed: number; aiPeriod: string | null; aiBonus: number }, now = new Date()): Credits {
  const used = u.aiPeriod === creditPeriod(now) ? u.aiUsed : 0;
  const monthly = Math.max(0, AI_FREE_MONTHLY - used);
  return { left: monthly + u.aiBonus, monthly, bonus: u.aiBonus, perMonth: AI_FREE_MONTHLY, renewsOn: creditRenewal(now) };
}

export const unassigned =(d: Pick<Draft, 'items'>) => d.items.filter((i) => i.price > 0 && !i.userIds.length);

/** The whole bill, assigned or not, with the same rounding as splitItemized. */
export function draftTotal(d: Draft) {
  const subtotal = sum(d.items.map((i) => i.price));
  const serviceCharge = Math.round((subtotal * d.serviceCharge) / 100);
  const vat = Math.round(((subtotal + serviceCharge) * d.vat) / 100);
  return { subtotal, serviceCharge, vat, total: subtotal + serviceCharge + vat + d.extra - d.discount };
}

/** The split for a draft, or null while no item has both a price and someone who had it. Throws if discounts wipe out the bill. */
export function priceDraft(d: Draft) {
  const items = d.items.filter((i) => i.price > 0 && i.userIds.length);
  if (!items.length) return null;
  const bill = splitItemized(items, { serviceCharge: d.serviceCharge, vat: d.vat, extra: d.extra, discount: d.discount });
  const single = d.payers.length <= 1 || d.payers.some((p) => p.amount === null);
  const payers: Portion[] = single
    ? d.payers.slice(0, 1).map((p) => ({ userId: p.userId, amount: bill.total }))
    : d.payers.map((p) => ({ userId: p.userId, amount: p.amount ?? 0 }));
  return { ...bill, payers, paidGap: bill.total - sum(payers.map((p) => p.amount)) };
}

/**
 * The POST /expenses body for a finished draft. `meta` matches what ExpenseForm writes, so the saved
 * expense opens in the normal editor. One shared item with no charges is saved as a plain equal split.
 */
export function draftToExpense(d: Draft) {
  const p = priceDraft(d);
  if (!p) throw new Error('Nothing to split yet');
  const plain = d.items.length === 1 && !d.serviceCharge && !d.vat && !d.extra && !d.discount;
  const everyone = [...new Set([...d.peopleIds, ...p.payers.map((x) => x.userId), ...p.shares.map((x) => x.userId)])];
  const rupees = (x: number) => (x ? String(x / 100) : '');
  return {
    groupId: d.groupId,
    description: d.description.trim() || d.items[0]?.name || 'Bill',
    amount: p.total,
    category: d.category,
    date: d.date,
    splitType: plain ? ('equal' as const) : ('itemized' as const),
    payers: p.payers.filter((x) => x.amount > 0),
    shares: p.shares.filter((x) => x.amount > 0),
    meta: {
      ai: true,
      excluded: plain ? everyone.filter((i) => !d.items[0].userIds.includes(i)) : [],
      exact: {}, pct: {}, weights: {},
      items: plain ? undefined : d.items.filter((i) => i.price > 0).map((i) => ({ name: i.qty > 1 ? `${i.name} ×${i.qty}` : i.name, price: String(i.price / 100), userIds: i.userIds })),
      sc: String(d.serviceCharge), vat: String(d.vat), extra: rupees(d.extra), discount: rupees(d.discount),
    },
  };
}

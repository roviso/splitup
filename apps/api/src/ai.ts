import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { inArray } from 'drizzle-orm';
import { aiChatInput, aiScanInput, CATEGORIES, sum, type Category, type Draft, type ScannedBill } from '@splitup/shared';
import { db } from './db';
import { groupMembers, users } from './schema';
import { parse, type Env, type User } from './auth';
import { friendIds, myGroups } from './ledger';
import { charge, creditsFor, refund } from './credits';

// Bill photos and chat go to OpenAI. The model must read images and support structured outputs.
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
export const aiEnabled = !!KEY;

const fail = (status: 404 | 422 | 429 | 502, message: string): never => { throw new HTTPException(status, { message }); };
const BUSY = 'The AI is busy right now. Try again in a moment.';

// ponytail: in-memory per-user hourly cap, like auth's limiter; move to the DB if you run several servers.
const uses = new Map<string, number[]>();
function quota(key: string, max: number) {
  const now = Date.now();
  const recent = (uses.get(key) ?? []).filter((t) => now - t < 3600e3);
  if (recent.length >= max) fail(429, "You've used the AI a lot this hour. Try again a bit later.");
  uses.set(key, [...recent, now]);
}

type Json = Record<string, unknown>;
async function ask<T>(name: string, schema: Json, messages: Json[]): Promise<T> {
  if (!KEY) return fail(404, 'AI is not set up on this server');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(/^(gpt-5|o\d)/.test(MODEL) && { reasoning_effort: 'low' }),
      response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch((e: Error) => { console.error('OpenAI request failed:', e.message); return null; });
  if (!r?.ok) {
    if (r) console.error(`OpenAI ${r.status}:`, (await r.text()).slice(0, 500));
    return fail(502, BUSY);
  }
  const msg = (await r.json())?.choices?.[0]?.message;
  if (!msg?.content) return fail(502, msg?.refusal ? "The AI couldn't help with that one." : BUSY);
  return JSON.parse(msg.content) as T;
}

// ---------- JSON schema shorthand (strict mode: every key required, nothing extra) ----------
const str = { type: 'string' }, num = { type: 'number' };
const orNull = (type: string) => ({ type: [type, 'null'] });
const obj = (properties: Json) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items: Json) => ({ type: 'array', items });
const category = { type: 'string', enum: Object.keys(CATEGORIES) };

const rupees = (x: number | null | undefined) => (x && x > 0 && Number.isFinite(x) ? Math.round(x * 100) : 0);
const pct = (x: number) => Math.min(100, Math.max(0, Math.round(x * 100) / 100));
const cat = (c: string): Category => (c in CATEGORIES ? (c as Category) : 'other');

// ---------- reading a bill photo ----------
type RawBill = {
  readable: boolean; merchant: string | null; date: string | null; category: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number | null; serviceChargePercent: number | null; serviceCharge: number | null;
  vatPercent: number | null; vat: number | null; discount: number | null; extra: number | null; total: number | null; note: string;
};
const billSchema = obj({
  readable: { type: 'boolean' }, merchant: orNull('string'), date: orNull('string'), category,
  items: arr(obj({ name: str, quantity: num, price: num })),
  subtotal: orNull('number'), serviceChargePercent: orNull('number'), serviceCharge: orNull('number'),
  vatPercent: orNull('number'), vat: orNull('number'), discount: orNull('number'), extra: orNull('number'), total: orNull('number'),
  note: str,
});
const SCAN_PROMPT = `You read photos of bills and receipts for Split-Up, a bill-splitting app used mostly in Nepal. Amounts are rupees.
- items: every purchased line, in printed order. name: the dish/product, tidied (fix obvious OCR slips, keep the language). quantity: as printed, else 1. price: the line amount (quantity × rate) BEFORE service charge and VAT. If a line has its own discount, subtract it from that line.
- Never list subtotal, service charge, VAT/tax, grand total, rounding, tender, cash, card, change or loyalty lines as items.
- serviceCharge / vat: only when printed as separate lines; fill the percent and/or amount that is printed. If prices are VAT-inclusive with no separate VAT line, use null.
- discount: bill-level discount amount. extra: tip, delivery or packing charges that aren't items.
- merchant: the shop or restaurant name in Title Case ("THAKALI KITCHEN" → "Thakali Kitchen").
- total: the grand total printed on the bill.
- date: as printed, rewritten as YYYY-MM-DD, with no calendar conversion (Nepali bills often print B.S. dates like 2083/06/14).
- readable: false if this isn't a bill or you can't read the amounts; say why in note. Otherwise note is a short friendly one-liner about the bill (no amounts).`;

/** "2083/06/14", "2026-9-30" or "30.09.2026" → YYYY-MM-DD plus which calendar it's in. */
export function billDate(s: string | null): Pick<ScannedBill, 'date' | 'calendar'> {
  const ymd = s?.trim().match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})$/);
  const dmy = s?.trim().match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/);
  const [y, mo, d] = ymd ? [ymd[1], ymd[2], ymd[3]].map(Number) : dmy ? [dmy[3], dmy[2], dmy[1]].map(Number) : [];
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 32)) return { date: null, calendar: null };
  // A.D. is around 2026, B.S. around 2083.
  return { date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`, calendar: y > 2050 ? 'bs' : 'ad' };
}

export function normalizeBill(r: RawBill): ScannedBill {
  const items = r.items
    .filter((i) => i.name.trim() && i.price > 0)
    .slice(0, 150)
    .map((i) => ({ name: i.name.trim().slice(0, 80), qty: i.quantity > 0 ? Math.round(i.quantity * 1000) / 1000 : 1, price: rupees(i.price) }));
  const sub = sum(items.map((i) => i.price)) / 100;
  // Bills print the percent, the amount, or both. Work out the percent the split maths needs.
  const sc = pct(r.serviceChargePercent ?? (r.serviceCharge && sub ? (r.serviceCharge / sub) * 100 : 0));
  const scAmount = r.serviceCharge ?? (sub * sc) / 100;
  const vat = pct(r.vatPercent ?? (r.vat && sub ? (r.vat / (sub + scAmount)) * 100 : 0));
  return {
    readable: r.readable && items.length > 0,
    merchant: r.merchant?.trim().slice(0, 80) || null,
    ...billDate(r.date),
    category: cat(r.category),
    items,
    serviceCharge: sc,
    vat,
    extra: rupees(r.extra),
    discount: rupees(r.discount),
    total: rupees(r.total) || null,
    note: r.note.slice(0, 300),
  };
}

// ---------- chatting a bill into shape ----------
type Ref = string; // "P3" / "G2": short handles the model can't mangle the way it mangles UUIDs
type RawDraft = {
  description: string; category: string; date: string; group: Ref | null; people: Ref[];
  items: { name: string; quantity: number; price: number; had: Ref[] }[];
  serviceChargePercent: number; vatPercent: number; extra: number; discount: number;
  paidBy: { person: Ref; amount: number | null }[];
  unknownNames: string[];
};
const draftSchema = obj({
  description: str, category, date: str, group: orNull('string'), people: arr(str),
  items: arr(obj({ name: str, quantity: num, price: num, had: arr(str) })),
  serviceChargePercent: num, vatPercent: num, extra: num, discount: num,
  paidBy: arr(obj({ person: str, amount: orNull('number') })),
  unknownNames: arr(str),
});
const chatSchema = obj({ reply: str, draft: draftSchema });

type Ctx = {
  me: string;
  fixedGroup: string | null;
  friendId: string | null;
  people: { id: string; name: string; ref: Ref }[];
  groups: { id: string; name: string; ref: Ref; memberIds: string[] }[];
  friends: Set<string>;
};

/** Everyone and every group this user may put on a bill, from the database (never trusted from the client). */
async function chatContext(me: User, groupId: string | null, friendId: string | null): Promise<Ctx> {
  const [fids, mine] = await Promise.all([friendIds(me.id), myGroups(me.id)]);
  if (groupId && !mine.some((g) => g.id === groupId)) fail(404, 'Group not found');
  if (friendId && !fids.includes(friendId)) fail(404, 'Friend not found');
  // Opened from a group or a friend: stay there. Otherwise the model may pick one of the user's recent groups.
  const gs = groupId ? mine.filter((g) => g.id === groupId) : friendId ? [] : mine.slice(-40);
  const members = gs.length ? await db.select().from(groupMembers).where(inArray(groupMembers.groupId, gs.map((g) => g.id))) : [];
  const ids = [...new Set([me.id, ...(groupId ? [] : fids), ...members.map((m) => m.userId)])].slice(0, 300);
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
  const names = new Map(rows.map((r) => [r.id, r.name]));
  return {
    me: me.id,
    fixedGroup: groupId,
    friendId,
    people: ids.filter((i) => names.has(i)).map((id, k) => ({ id, name: names.get(id)!, ref: `P${k + 1}` })),
    groups: gs.map((g, k) => ({ id: g.id, name: g.name, ref: `G${k + 1}`, memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.userId) })),
    friends: new Set(fids),
  };
}

function toModel(d: Draft, ctx: Ctx) {
  const ref = new Map(ctx.people.map((p) => [p.id, p.ref]));
  const refs = (ids: string[]) => ids.map((i) => ref.get(i)).filter((r): r is Ref => !!r);
  return {
    description: d.description, category: d.category, date: d.date,
    group: ctx.groups.find((g) => g.id === d.groupId)?.ref ?? null,
    people: refs(d.peopleIds),
    items: d.items.map((i) => ({ name: i.name, quantity: i.qty, price: i.price / 100, had: refs(i.userIds) })),
    serviceChargePercent: d.serviceCharge, vatPercent: d.vat, extra: d.extra / 100, discount: d.discount / 100,
    paidBy: d.payers.flatMap((p) => (ref.has(p.userId) ? [{ person: ref.get(p.userId)!, amount: p.amount === null ? null : p.amount / 100 }] : [])),
    unknownNames: d.unknownNames,
  };
}

/** Map the model's refs back to real ids, dropping anyone who isn't allowed on this bill. */
export function fromModel(raw: RawDraft, ctx: Ctx, prev: Draft | null, today: string): Draft {
  const byRef = new Map(ctx.people.map((p) => [p.ref, p.id]));
  const groupId = ctx.fixedGroup ?? ctx.groups.find((g) => g.ref === raw.group)?.id ?? null;
  const members = ctx.groups.find((g) => g.id === groupId)?.memberIds;
  const allowed = (id: string) => (members ? members.includes(id) : id === ctx.me || ctx.friends.has(id));
  const ids = (refs: Ref[]) => [...new Set(refs.map((r) => byRef.get(r)).filter((i): i is string => !!i && allowed(i)))];

  const items = raw.items
    .filter((i) => i.name.trim() && i.price > 0)
    .slice(0, 150)
    .map((i) => ({ name: i.name.trim().slice(0, 80), qty: i.quantity > 0 ? i.quantity : 1, price: rupees(i.price), userIds: ids(i.had) }));
  let payers = raw.paidBy.flatMap((p) => ids([p.person]).map((userId) => ({ userId, amount: p.amount === null ? null : rupees(p.amount) })));
  if (!payers.length) payers = [{ userId: ctx.me, amount: null }]; // the user is in every group they can pick
  const peopleIds = members ?? [...new Set([
    ctx.me, ...(ctx.friendId ? [ctx.friendId] : []), ...ids(raw.people), ...items.flatMap((i) => i.userIds), ...payers.map((p) => p.userId),
  ])];
  return {
    description: raw.description.trim().slice(0, 100),
    category: cat(raw.category),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && raw.date <= today ? raw.date : prev?.date ?? today,
    groupId,
    peopleIds,
    items,
    serviceCharge: pct(raw.serviceChargePercent),
    vat: pct(raw.vatPercent),
    extra: rupees(raw.extra),
    discount: rupees(raw.discount),
    payers,
    billTotal: prev?.billTotal ?? null,
    unknownNames: [...new Set(raw.unknownNames.map((n) => n.trim().slice(0, 60)).filter(Boolean))].slice(0, 20),
  };
}

function chatPrompt(ctx: Ctx, draft: Draft | null, today: string, lang: 'en' | 'ne') {
  const who = (ids: string[]) => ids.map((i) => ctx.people.find((p) => p.id === i)?.ref).filter(Boolean).join(', ');
  const people = ctx.people.map((p) => `${p.ref}: ${p.name}${p.id === ctx.me ? ' (the user: "I", "me", "ma", "maile")' : ''}`).join('\n');
  const where = ctx.fixedGroup
    ? `This bill is in the group ${ctx.groups[0].ref} "${ctx.groups[0].name}". Only its members can be on it, and people = all of them.`
    : ctx.friendId
      ? `This bill is between the user and ${who([ctx.friendId])}, unless the user adds more friends.`
      : `No group is chosen yet. Set group only if the user names one of these groups (or clearly means it); then people = its members. Otherwise group = null and people = the user plus the friends on the bill.\n${ctx.groups.map((g) => `${g.ref}: "${g.name}" (members: ${who(g.memberIds)})`).join('\n') || '(the user has no groups)'}`;
  return `You are the bill-splitting assistant inside Split-Up, a Nepali app for splitting expenses with friends. The user tells you, in English, Nepali or Romanized Nepali, what they spent and who had what. You keep ONE expense draft up to date and reply briefly.

People (refs you must use):
${people}

${where}

Today is ${today}.

Current draft (amounts in rupees):
${draft ? JSON.stringify(toModel(draft, ctx)) : 'none yet'}

Rules:
- Always return the complete updated draft. Keep existing items exactly (same order, name, quantity, price) unless the user changes them; usually you only change who had what.
- Amounts are Nepali rupees (रु, Rs, NPR). "2.5k" = 2500, "1 lakh" = 100000.
- items[].price is always the line total. Per-person or per-unit prices get multiplied: "8500 each for the 4 of us" = quantity 4, price 34000; "3 beers at 600" = quantity 3, price 1800.
- items[].had = the people who shared that item; they split it equally. Two people sharing an item of quantity 2 = one each.
- No itemised detail ("I paid 3000 for dinner for the 4 of us")? Use one item named after the expense with everyone who shared it in had.
- "everyone", "all of us", "sabai" = everyone on the bill. "the rest" / "baki" = items nobody has yet.
- paidBy: who paid. If nobody says, the user (P1) paid with amount null. amount null means they paid the whole bill; give amounts only when several people paid.
- serviceChargePercent / vatPercent: keep the draft's values. For a new draft from chat use 0 unless the user mentions them (Nepali restaurants usually add 10% service charge, then 13% VAT on top).
- Someone mentioned who isn't in the People list: never invent a ref. Put their name in unknownNames and say so in the reply. Match names loosely (nicknames, spelling, "dai", "didi", "bhai"). If a name fits several people, ask which one.
- description: short, e.g. "Dinner at Thakali Kitchen". category: best fit. date: YYYY-MM-DD ("yesterday" is relative to today), else keep the draft's date or use today.
- reply: 1–2 short, warm sentences in ${lang === 'ne' ? 'Nepali (Devanagari)' : 'English, unless the user writes in Nepali: then answer in Nepali, in the same script they used'}. Say what you changed, or ask ONE question if something important is missing (an amount, or who had what). Don't repeat every number; the app shows them.
- If the message isn't about a bill, answer briefly and return the draft unchanged.`;
}

/** Run one AI request against the user's credits: a new bill costs one, follow-ups don't, failures are refunded. */
async function metered<T>(userId: string, session: string | undefined, work: () => Promise<T>) {
  const bill = await charge(userId, session);
  try {
    return { ...(await work()), session: bill.session, credits: await creditsFor(userId) };
  } catch (e) {
    await refund(userId, bill);
    throw e;
  }
}

export const aiRoutes = new Hono<Env>()
  .get('/ai/credits', async (c) => c.json(await creditsFor(c.get('user').id)))
  .post('/ai/scan', async (c) => {
    const me = c.get('user').id;
    quota(`scan:${me}`, 20);
    const { image, session } = await parse(c, aiScanInput);
    return c.json(await metered(me, session, async () => {
      const raw = await ask<RawBill>('bill', billSchema, [
        { role: 'system', content: SCAN_PROMPT },
        { role: 'user', content: [{ type: 'image_url', image_url: { url: image, detail: 'high' } }] },
      ]);
      const bill = normalizeBill(raw);
      if (!bill.readable) fail(422, raw.note.trim() || "Couldn't read that bill. Try a sharper photo in good light, with the whole bill in view.");
      return { bill };
    }));
  })
  .post('/ai/chat', async (c) => {
    const me = c.get('user');
    quota(`chat:${me.id}`, 200);
    const input = await parse(c, aiChatInput);
    const ctx = await chatContext(me, input.groupId, input.friendId);
    return c.json(await metered(me.id, input.session, async () => {
      const out = await ask<{ reply: string; draft: RawDraft }>('split', chatSchema, [
        { role: 'system', content: chatPrompt(ctx, input.draft, input.today, input.lang) },
        ...input.messages.slice(-16).map((m) => ({ role: m.role, content: m.content })),
      ]);
      return { reply: out.reply.slice(0, 600), draft: fromModel(out.draft, ctx, input.draft, input.today) };
    }));
  });

// All money is integer paisa (रु 1 = 100 paisa). Never floats.

export type Portion = { userId: string; amount: number };
/** `from` owes `to` `amount` paisa. */
export type Debt = { from: string; to: string; amount: number };

export const toPaisa = (v: string | number): number => Math.round(Number(v) * 100);
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Split `total` by `weights` so parts sum exactly to total (largest remainder method). */
export function allocate(total: number, weights: number[]): number[] {
  const w = sum(weights);
  if (!(w > 0)) throw new Error('Weights must add up to more than zero');
  const raw = weights.map((x) => (total * x) / w);
  const out = raw.map(Math.floor);
  const order = raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0, rem = total - sum(out); rem > 0; k++, rem--) out[order[k][1]]++;
  return out;
}

const zip = (ids: string[], amounts: number[]): Portion[] => ids.map((userId, i) => ({ userId, amount: amounts[i] }));

export const splitEqual = (total: number, ids: string[]) => zip(ids, allocate(total, ids.map(() => 1)));
/** percents may be fractional (33.33); they must add to 100. */
export const splitPercent = (total: number, ids: string[], pcts: number[]) => zip(ids, allocate(total, pcts));
export const splitShares = (total: number, ids: string[], shares: number[]) => zip(ids, allocate(total, shares));

export type Item = { name: string; price: number; userIds: string[] };
export type ItemizedOpts = { serviceCharge?: number; vat?: number; extra?: number; discount?: number };

/**
 * Restaurant bill split, Nepal style: service charge on the subtotal, then VAT on
 * (subtotal + service charge). Extras/discounts and taxes are shared in proportion to what each person ate.
 */
export function splitItemized(items: Item[], o: ItemizedOpts = {}) {
  const eaten = new Map<string, number>();
  for (const it of items) {
    if (!it.userIds.length) throw new Error(`Nobody is assigned to "${it.name || 'an item'}"`);
    splitEqual(it.price, it.userIds).forEach((p) => eaten.set(p.userId, (eaten.get(p.userId) ?? 0) + p.amount));
  }
  const subtotal = sum(items.map((i) => i.price));
  const serviceCharge = Math.round((subtotal * (o.serviceCharge ?? 0)) / 100);
  const vat = Math.round(((subtotal + serviceCharge) * (o.vat ?? 0)) / 100);
  const total = subtotal + serviceCharge + vat + (o.extra ?? 0) - (o.discount ?? 0);
  if (total <= 0) throw new Error('Bill total must be more than zero');
  const ids = [...eaten.keys()];
  return { subtotal, serviceCharge, vat, total, shares: zip(ids, allocate(total, ids.map((id) => eaten.get(id)!))) };
}

/** Net position per user: positive = is owed, negative = owes. */
export function netOf(payers: Portion[], shares: Portion[], into = new Map<string, number>()) {
  for (const p of payers) into.set(p.userId, (into.get(p.userId) ?? 0) + p.amount);
  for (const s of shares) into.set(s.userId, (into.get(s.userId) ?? 0) - s.amount);
  return into;
}

/** Fewest-ish payments that settle a set of net balances (greedy; exact to the paisa). */
export function settle(net: Map<string, number>): Debt[] {
  const cred = [...net].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const debt = [...net].filter(([, v]) => v < 0).map(([k, v]) => [k, -v] as [string, number]).sort((a, b) => b[1] - a[1]);
  const out: Debt[] = [];
  for (let i = 0, j = 0; i < debt.length && j < cred.length; ) {
    const amount = Math.min(debt[i][1], cred[j][1]);
    out.push({ from: debt[i][0], to: cred[j][0], amount });
    if (!(debt[i][1] -= amount)) i++;
    if (!(cred[j][1] -= amount)) j++;
  }
  return out;
}

export type Ledger = {
  expenses: { payers: Portion[]; shares: Portion[] }[];
  settlements: { fromUser: string; toUser: string; amount: number }[];
};

/**
 * Who owes whom in one group (or among non-group expenses).
 * simplify=true: minimise payments across the group. false: only net each pair (no debts between strangers).
 */
export function ledgerDebts({ expenses, settlements }: Ledger, simplify: boolean): Debt[] {
  if (simplify) {
    const net = new Map<string, number>();
    for (const e of expenses) netOf(e.payers, e.shares, net);
    for (const s of settlements) netOf([{ userId: s.fromUser, amount: s.amount }], [{ userId: s.toUser, amount: s.amount }], net);
    return settle(net);
  }
  const pair = new Map<string, number>(); // "a|b" with a<b: positive means a owes b
  const add = (from: string, to: string, amt: number) => {
    const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1];
    pair.set(`${a}|${b}`, (pair.get(`${a}|${b}`) ?? 0) + sign * amt);
  };
  for (const e of expenses) for (const d of settle(netOf(e.payers, e.shares))) add(d.from, d.to, d.amount);
  for (const s of settlements) add(s.toUser, s.fromUser, s.amount);
  return [...pair].filter(([, v]) => v).map(([k, v]) => {
    const [a, b] = k.split('|');
    return v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v };
  });
}

/** Sum debts touching `me` into per-person balances: positive = they owe me. */
export function balancesFor(me: string, debts: Debt[], into = new Map<string, number>()) {
  for (const d of debts) {
    if (d.to === me) into.set(d.from, (into.get(d.from) ?? 0) + d.amount);
    if (d.from === me) into.set(d.to, (into.get(d.to) ?? 0) - d.amount);
  }
  return into;
}

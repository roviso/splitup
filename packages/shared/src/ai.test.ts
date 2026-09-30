import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditPeriod, creditRenewal, creditsOf, draftToExpense, draftTotal, expenseInput, priceDraft, sum, unassigned, type Draft } from './index';

test('credits: 5 a month in Nepal time, bonus on top, old months forgotten', () => {
  const sept = new Date('2026-09-30T12:00:00Z');
  const octInNepal = new Date('2026-09-30T18:30:00Z'); // 00:15 on 1 Oct in Kathmandu
  assert.equal(creditPeriod(sept), '2026-09');
  assert.equal(creditPeriod(octInNepal), '2026-10');
  assert.equal(creditRenewal(sept), '2026-10-01');
  assert.equal(creditRenewal(new Date('2026-12-15T00:00:00Z')), '2027-01-01');
  assert.deepEqual(creditsOf({ aiUsed: 2, aiPeriod: '2026-09', aiBonus: 5 }, sept), { left: 8, monthly: 3, bonus: 5, perMonth: 5, renewsOn: '2026-10-01' });
  assert.equal(creditsOf({ aiUsed: 5, aiPeriod: '2026-09', aiBonus: 0 }, sept).left, 0);
  assert.equal(creditsOf({ aiUsed: 5, aiPeriod: '2026-09', aiBonus: 0 }, octInNepal).left, 5); // renewed
  assert.equal(creditsOf({ aiUsed: 0, aiPeriod: null, aiBonus: 0 }, sept).left, 5); // new user
});

const [me, ram, sita] = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
const base: Draft = {
  description: 'Thakali', category: 'food', date: '2026-09-30', groupId: null, peopleIds: [me, ram, sita],
  items: [], serviceCharge: 0, vat: 0, extra: 0, discount: 0, payers: [{ userId: me, amount: null }], billTotal: null, unknownNames: [],
};

test('scanned bill: items shared by who had them, SC then VAT, matches the printed total', () => {
  const d: Draft = {
    ...base, serviceCharge: 10, vat: 13, billTotal: 534490,
    items: [
      { name: 'Chicken Thakali Set', qty: 2, price: 130000, userIds: [me, ram] },
      { name: 'Veg Thakali Set', qty: 1, price: 48000, userIds: [sita] },
      { name: 'Buff Momo', qty: 2, price: 44000, userIds: [me, ram, sita] },
      { name: 'Chicken Sekuwa', qty: 1, price: 55000, userIds: [me, ram, sita] },
      { name: 'Gorkha Beer', qty: 2, price: 120000, userIds: [me, ram] },
      { name: 'Coke', qty: 1, price: 12000, userIds: [sita] },
      { name: 'Masala Tea', qty: 3, price: 21000, userIds: [me, ram, sita] },
    ],
  };
  const p = priceDraft(d)!;
  assert.equal(p.total, 534490);
  assert.equal(draftTotal(d).total, 534490);
  assert.equal(draftTotal({ ...d, items: d.items.map((i) => ({ ...i, userIds: [] })) }).total, 534490); // counts unassigned items too
  assert.equal(sum(p.shares.map((s) => s.amount)), p.total);
  assert.deepEqual(p.payers, [{ userId: me, amount: 534490 }]);
  assert.equal(p.paidGap, 0);
  const body = draftToExpense(d);
  assert.equal(body.splitType, 'itemized');
  assert.equal(body.meta.items![0].name, 'Chicken Thakali Set ×2');
  assert.equal(body.meta.items![0].price, '1300');
  assert.ok(expenseInput.safeParse(body).success);
});

test('one shared item with no charges saves as an equal split', () => {
  const d: Draft = { ...base, items: [{ name: 'Taxi', qty: 1, price: 90000, userIds: [ram, sita] }] };
  const body = draftToExpense(d);
  assert.equal(body.splitType, 'equal');
  assert.deepEqual(body.meta.excluded, [me]); // I paid but didn't ride
  assert.deepEqual(body.shares.map((s) => s.amount), [45000, 45000]);
  assert.ok(expenseInput.safeParse(body).success);
});

test('unassigned items are not priced, and flagged', () => {
  const d: Draft = { ...base, items: [{ name: 'Momo', qty: 1, price: 50000, userIds: [] }, { name: 'Coke', qty: 1, price: 10000, userIds: [me] }] };
  assert.equal(unassigned(d).length, 1);
  assert.equal(priceDraft(d)!.total, 10000);
  assert.equal(priceDraft({ ...d, items: [d.items[0]] }), null);
});

test('several payers with amounts must cover the bill', () => {
  const d: Draft = { ...base, items: [{ name: 'Hotel', qty: 1, price: 600000, userIds: [me, ram, sita] }], payers: [{ userId: me, amount: 400000 }, { userId: ram, amount: 100000 }] };
  assert.equal(priceDraft(d)!.paidGap, 100000);
  assert.ok(!expenseInput.safeParse(draftToExpense(d)).success);
  const ok = { ...d, payers: [{ userId: me, amount: 400000 }, { userId: ram, amount: 200000 }] };
  assert.equal(priceDraft(ok)!.paidGap, 0);
  assert.ok(expenseInput.safeParse(draftToExpense(ok)).success);
});

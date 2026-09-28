import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, splitEqual, splitItemized, ledgerDebts, balancesFor, settle, sum, expenseInput } from './index';

test('allocate always sums exactly to total', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [33.33, 33.33, 33.34]), [33, 33, 34]);
  assert.deepEqual(allocate(10, [0, 1]), [0, 10]);
  for (let t = 1; t < 500; t += 7) assert.equal(sum(allocate(t, [3, 7, 1, 0.5])), t);
});

test('equal split distributes leftover paisa', () => {
  assert.deepEqual(splitEqual(100, ['a', 'b', 'c']).map((p) => p.amount), [34, 33, 33]);
});

test('itemized: 10% service charge then 13% VAT, shared by consumption', () => {
  const r = splitItemized(
    [
      { name: 'Momo', price: 50000, userIds: ['a', 'b'] }, // रु500 shared
      { name: 'Thakali set', price: 60000, userIds: ['a'] },
      { name: 'Coke', price: 10000, userIds: ['b'] },
    ],
    { serviceCharge: 10, vat: 13 },
  );
  assert.equal(r.subtotal, 120000);
  assert.equal(r.serviceCharge, 12000);
  assert.equal(r.vat, 17160); // 13% of 1320
  assert.equal(r.total, 149160);
  assert.equal(sum(r.shares.map((s) => s.amount)), r.total);
  // a ate 850 of 1200 → 70.83%
  assert.equal(r.shares.find((s) => s.userId === 'a')!.amount, 105655);
  assert.throws(() => splitItemized([{ name: 'x', price: 100, userIds: [] }]));
});

test('settle is exact and minimal for simple chains', () => {
  const d = settle(new Map([['a', 300], ['b', -100], ['c', -200]]));
  assert.deepEqual(d, [{ from: 'c', to: 'a', amount: 200 }, { from: 'b', to: 'a', amount: 100 }]);
});

test('ledger: simplified vs pairwise, settlements cancel debts', () => {
  // a and b each paid 300 split 3 ways → net: a +100, b +100, c -200
  const ledger = {
    expenses: [
      { payers: [{ userId: 'a', amount: 300 }], shares: ['a', 'b', 'c'].map((userId) => ({ userId, amount: 100 })) },
      { payers: [{ userId: 'b', amount: 300 }], shares: ['a', 'b', 'c'].map((userId) => ({ userId, amount: 100 })) },
    ],
    settlements: [] as { fromUser: string; toUser: string; amount: number }[],
  };
  const simple = ledgerDebts(ledger, true);
  assert.equal(sum(simple.map((d) => d.amount)), 200);
  const pairs = ledgerDebts(ledger, false); // a↔b cancel out; c owes each 100
  assert.deepEqual(balancesFor('c', pairs), new Map([['a', -100], ['b', -100]]));
  ledger.settlements.push({ fromUser: 'c', toUser: 'a', amount: 100 });
  assert.deepEqual(balancesFor('a', ledgerDebts(ledger, false)), new Map());
  assert.deepEqual(balancesFor('c', ledgerDebts(ledger, true)), new Map([['b', -100]]));
});

test('expense schema rejects totals that do not add up', () => {
  const base = {
    groupId: null, description: 'Momo', amount: 300, category: 'food', date: '2026-09-28', splitType: 'equal',
    payers: [{ userId: crypto.randomUUID(), amount: 300 }],
    shares: [{ userId: crypto.randomUUID(), amount: 300 }],
  };
  assert.ok(expenseInput.safeParse(base).success);
  assert.ok(!expenseInput.safeParse({ ...base, shares: [{ ...base.shares[0], amount: 299 }] }).success);
});

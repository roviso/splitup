// Dev only: creates demo@splitup.test / Namaste123 with a sample Pokhara trip.
// Run: npm run seed -w apps/api  (API must be running on :3000)
import { eq } from 'drizzle-orm';
import { db, sql } from './db';
import { users } from './schema';
import { hashPassword } from './auth';

const EMAIL = 'demo@splitup.test', PASSWORD = 'Namaste123', API = 'http://localhost:3000/api';

const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
if (existing) {
  await db.update(users).set({ passwordHash: await hashPassword(PASSWORD) }).where(eq(users.id, existing.id));
  console.log(`Demo account already exists — password reset. Log in with ${EMAIL} / ${PASSWORD}`);
} else {
  await db.insert(users).values({ email: EMAIL, name: 'Demo User', registered: true, passwordHash: await hashPassword(PASSWORD), esewaId: '9800000000' });
  const login = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
  const { token, user: me } = await login.json();
  const call = async (path: string, body: unknown) => {
    const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path}: ${(await r.json()).error}`);
    return r.json();
  };
  const f = [];
  for (const [name, phone] of [['Bibek Shrestha', '9841111111'], ['Sita Rai', '9851222222'], ['Hari Tamang', '9803333333']]) f.push(await call('/friends', { name, phone }));
  const g = await call('/groups', { name: 'Pokhara trip', type: 'trip', memberIds: f.map((x) => x.id) });
  const all = [me.id, ...f.map((x) => x.id)];
  const equal = (amt: number, ids: string[]) => ids.map((userId, i) => ({ userId, amount: Math.floor(amt / ids.length) + (i < amt % ids.length ? 1 : 0) }));
  const exp = (description: string, amount: number, category: string, date: string, payer: string, ids: string[], groupId: string | null = g.id) =>
    call('/expenses', { groupId, description, amount, category, date, splitType: 'equal', payers: [{ userId: payer, amount }], shares: equal(amount, ids) });
  await exp('Hotel Barahi', 1200000, 'travel', '2026-09-20', me.id, all);
  await exp('Thakali khana set', 348000, 'food', '2026-09-21', f[0].id, all);
  await exp('Taxi to Sarangkot', 150000, 'transport', '2026-09-22', f[1].id, all.slice(0, 3));
  await call('/settlements', { groupId: g.id, fromUser: f[2].id, toUser: me.id, amount: 200000, method: 'esewa', date: '2026-09-23' });
  await exp('Momo at Bhojan Griha', 90000, 'food', '2026-09-27', f[1].id, [me.id, f[1].id], null);
  console.log(`Demo account created. Log in with ${EMAIL} / ${PASSWORD}`);
}
await sql.end();
process.exit(0);

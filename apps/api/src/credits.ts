import { HTTPException } from 'hono/http-exception';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { AI_FREE_MONTHLY, creditPeriod, creditsOf, type Credits } from '@splitup/shared';
import { db } from './db';
import { aiSessions, users } from './schema';

type Bucket = 'monthly' | 'bonus';
/** An AI bill in progress. `fresh` = this request opened it and spent a credit (refunded if the AI fails). */
export type Charge = { session: string; fresh: { bucket: Bucket; period: string } | null };

// One bill: up to 25 AI requests (re-scans, corrections) within 6 hours for a single credit.
const SESSION_TURNS = 25, SESSION_MS = 6 * 3600e3;

/** Take one credit: this month's free ones first, then bonus. 402 when there's none left. */
async function spend(userId: string): Promise<{ bucket: Bucket; period: string }> {
  const period = creditPeriod();
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    const used = u.aiPeriod === period ? u.aiUsed : 0;
    if (used < AI_FREE_MONTHLY) {
      await tx.update(users).set({ aiUsed: used + 1, aiPeriod: period }).where(eq(users.id, userId));
      return { bucket: 'monthly' as const, period };
    }
    if (u.aiBonus > 0) {
      await tx.update(users).set({ aiBonus: u.aiBonus - 1, aiUsed: used, aiPeriod: period }).where(eq(users.id, userId));
      return { bucket: 'bonus' as const, period };
    }
    throw new HTTPException(402, { message: "You've used all your AI credits. Invite a friend for 5 more, or wait for next month's." });
  });
}

/** Continue this bill's session for free, or open a new one for a credit. */
export async function charge(userId: string, session?: string): Promise<Charge> {
  if (session) {
    const [s] = await db.update(aiSessions).set({ turns: sql`${aiSessions.turns} + 1` })
      .where(and(eq(aiSessions.id, session), eq(aiSessions.userId, userId), lt(aiSessions.turns, SESSION_TURNS),
        gt(aiSessions.createdAt, new Date(Date.now() - SESSION_MS))))
      .returning({ id: aiSessions.id });
    if (s) return { session: s.id, fresh: null };
  }
  const fresh = await spend(userId);
  const [s] = await db.insert(aiSessions).values({ userId, ...fresh }).returning({ id: aiSessions.id });
  await db.delete(aiSessions).where(and(eq(aiSessions.userId, userId), lt(aiSessions.createdAt, new Date(Date.now() - 7 * 864e5))));
  return { session: s.id, fresh };
}

/** The AI failed: give back the credit this request spent, if it spent one. */
export async function refund(userId: string, c: Charge) {
  if (!c.fresh) return;
  await db.delete(aiSessions).where(eq(aiSessions.id, c.session));
  if (c.fresh.bucket === 'bonus') await db.update(users).set({ aiBonus: sql`${users.aiBonus} + 1` }).where(eq(users.id, userId));
  else await db.update(users).set({ aiUsed: sql`greatest(${users.aiUsed} - 1, 0)` }).where(and(eq(users.id, userId), eq(users.aiPeriod, c.fresh.period)));
}

export const creditsFor = async (userId: string): Promise<Credits> => {
  const [u] = await db.select({ aiUsed: users.aiUsed, aiPeriod: users.aiPeriod, aiBonus: users.aiBonus }).from(users).where(eq(users.id, userId));
  return creditsOf(u);
};

import type { Context } from 'hono';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from './db';
import { appSettings, auditLog, userDays, users } from './schema';

// ---------- runtime settings ----------
export type Settings = {
  /** Banner on every page. tone: info (marigold) | warn (sindoor) | good (leaf). */
  announcement: { active: boolean; text: string; tone: 'info' | 'warn' | 'good' };
  aiEnabled: boolean;
  signupsEnabled: boolean;
  /** Everyone but admins gets a "back soon" screen. */
  maintenance: { active: boolean; message: string };
};
export const DEFAULT_SETTINGS: Settings = {
  announcement: { active: false, text: '', tone: 'info' },
  aiEnabled: true,
  signupsEnabled: true,
  maintenance: { active: false, message: 'Split-Up is getting an upgrade. Back in a few minutes 🙏' },
};

// ponytail: cached per process for a few seconds; with several API processes a change takes up to CACHE_MS to reach all of them.
const CACHE_MS = 5_000;
let cache: { at: number; value: Settings } | null = null;
export async function settings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await db.select().from(appSettings);
  const value = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) } as Settings;
  cache = { at: Date.now(), value };
  return value;
}
export async function saveSettings(patch: Partial<Settings>, by: string) {
  for (const [key, value] of Object.entries(patch)) {
    await db.insert(appSettings).values({ key, value, updatedBy: by })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: by, updatedAt: new Date() } });
  }
  cache = null;
  return settings();
}

// ---------- who's calling ----------
/** Last hop = what our own proxy (nginx) saw; earlier entries are client-controlled. */
export const clientIp = (c: Context) =>
  c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() || c.req.header('x-real-ip') || null;

// ---------- audit ----------
export async function audit(c: Context | null, actorId: string | null, action: string, target?: { type: string; id: string } | null, data: Record<string, unknown> = {}) {
  await db.insert(auditLog).values({
    actorId, action, targetType: target?.type ?? null, targetId: target?.id ?? null, data, ip: c ? clientIp(c) : null,
  }).catch((e) => console.error('audit failed:', e));
}

// ---------- activity ----------
const nepalDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' });
// ponytail: in-memory throttle, so each user costs at most one write per day for user_days and one per 5 min for lastSeenAt.
const seenDay = new Map<string, string>(), seenAt = new Map<string, number>();
/** Record that a user is active. Never fails or slows the request. */
export function touch(userId: string) {
  const day = nepalDay.format(new Date()), now = Date.now();
  if (seenDay.get(userId) !== day) {
    seenDay.set(userId, day);
    db.insert(userDays).values({ userId, day }).onConflictDoNothing().catch(() => seenDay.delete(userId));
  }
  if (now - (seenAt.get(userId) ?? 0) > 5 * 60e3) {
    seenAt.set(userId, now);
    db.update(users).set({ lastSeenAt: new Date(now) }).where(eq(users.id, userId)).catch(() => {});
  }
}

// ---------- admins ----------
/** ADMIN_EMAILS=a@x.com,b@y.com: these verified accounts are always admins, including ones that sign up later. */
export const adminEmails = new Set((process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
export async function promoteAdminEmails() {
  if (!adminEmails.size) return;
  const rows = await db.update(users).set({ role: 'admin' })
    .where(and(inArray(users.email, [...adminEmails]), eq(users.registered, true), sql`${users.role} <> 'admin'`, isNotNull(users.email)))
    .returning({ email: users.email });
  for (const r of rows) console.log(`Admin: promoted ${r.email} (ADMIN_EMAILS)`);
}

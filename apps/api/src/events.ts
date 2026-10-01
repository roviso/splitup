import { and, eq, inArray } from 'drizzle-orm';
import { db, sql } from './db';
import { notifications, users } from './schema';

/** What a connected client receives. `sync` = "something you can see changed, refetch". */
export type Push =
  | { type: 'sync' }
  | { type: 'notification'; id: string; kind: string; actorId: string | null; actorName: string; data: unknown; createdAt: Date };

const CHANNEL = 'splitup_events';
const listeners = new Map<string, Set<(p: Push) => void>>();
/** Who has the app open right now on this process: people, and open streams (tabs/devices). */
export const liveStats = () => ({ users: [...listeners.keys()], streams: [...listeners.values()].reduce((a, s) => a + s.size, 0) });

export function subscribe(userId: string, fn: (p: Push) => void) {
  const set = listeners.get(userId) ?? new Set();
  set.add(fn);
  listeners.set(userId, set);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(userId);
  };
}

/** Postgres LISTEN/NOTIFY carries events to every API process, so this keeps working past one server. */
export const startEvents = () =>
  sql.listen(CHANNEL, (raw) => {
    const { to, push } = JSON.parse(raw) as { to: string[]; push: Push };
    for (const id of to) listeners.get(id)?.forEach((f) => f(push));
  });

async function send(to: string[], push: Push) {
  // NOTIFY payloads cap at 8000 bytes; 100 ids ≈ 4KB.
  for (let i = 0; i < to.length; i += 100) await sql.notify(CHANNEL, JSON.stringify({ to: to.slice(i, i + 100), push }));
}

const log = (what: string) => (e: unknown) => console.error(`${what} failed:`, e);

/** Tell everyone in `to` (the actor's other devices too) to refetch. Never fails the request. */
export const sync = (to: (string | null | undefined)[]) =>
  send([...new Set(to.filter((x): x is string => !!x))], { type: 'sync' }).catch(log('sync'));

type Data = Record<string, unknown>;
/** Inbox entry + live push for each registered person in `to` except the actor. Never fails the request. */
export async function notify(to: (string | null | undefined)[], actorId: string, kind: string, data: Data | ((userId: string) => Data)) {
  const ids = [...new Set(to.filter((x): x is string => !!x && x !== actorId))];
  if (!ids.length) return;
  try {
    const real = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, ids), eq(users.registered, true)));
    if (!real.length) return;
    const [actor] = await db.select({ name: users.name }).from(users).where(eq(users.id, actorId));
    const rows = await db.insert(notifications)
      .values(real.map(({ id }) => ({ userId: id, actorId, kind, data: typeof data === 'function' ? data(id) : data })))
      .returning();
    for (const r of rows) await send([r.userId], { type: 'notification', id: r.id, kind, actorId, actorName: actor?.name ?? '', data: r.data, createdAt: r.createdAt });
  } catch (e) { log('notify')(e); }
}

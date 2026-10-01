// Manage admin accounts from the server shell. Uses DATABASE_URL (the dev script loads ../../.env).
//   npm run admin -w apps/api -- create <username> [display name]   password from ADMIN_PASSWORD or a prompt
//   npm run admin -w apps/api -- promote <email|username>
//   npm run admin -w apps/api -- demote <email|username>
//   npm run admin -w apps/api -- password <email|username>
//   npm run admin -w apps/api -- list
import { createInterface } from 'node:readline/promises';
import { eq } from 'drizzle-orm';
import { db, runMigrations, sql } from './db';
import { users } from './schema';
import { hashPassword } from './password';

const [cmd, who, ...rest] = process.argv.slice(2);
const by = (s: string) => (s.includes('@') ? eq(users.email, s.toLowerCase()) : eq(users.username, s.toLowerCase()));

async function askPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question('Password (8+ characters): ');
  rl.close();
  return pw;
}

async function main() {
  await runMigrations(process.env.MIGRATIONS_DIR ?? 'drizzle');
  switch (cmd) {
    case 'create': {
      if (!who || !/^[a-z0-9._-]{3,32}$/.test(who)) throw new Error('Username: 3–32 lowercase letters, digits, . _ -');
      const pw = await askPassword();
      if (pw.length < 8) throw new Error('Password needs at least 8 characters');
      const values = { name: rest.join(' ') || 'Admin', username: who, passwordHash: await hashPassword(pw), role: 'admin', registered: true };
      const [u] = await db.insert(users).values({ ...values, joinedAt: new Date() })
        .onConflictDoUpdate({ target: users.username, set: { passwordHash: values.passwordHash, role: 'admin', suspendedAt: null } }).returning();
      console.log(`✓ admin "${u.username}" ready (${u.id}). Sign in with username + password.`);
      break;
    }
    case 'promote':
    case 'demote': {
      if (!who) throw new Error(`Usage: ${cmd} <email|username>`);
      const [u] = await db.update(users).set({ role: cmd === 'promote' ? 'admin' : 'user' }).where(by(who)).returning();
      if (!u) throw new Error(`No account with ${who}${who.includes('@') ? '. They need to sign up first, or add it to ADMIN_EMAILS so it is promoted when they do.' : ''}`);
      console.log(`✓ ${u.name} <${u.email ?? u.username}> is now ${u.role}${u.registered ? '' : ' (note: not signed up yet)'}`);
      break;
    }
    case 'password': {
      if (!who) throw new Error('Usage: password <email|username>');
      const pw = await askPassword();
      if (pw.length < 8) throw new Error('Password needs at least 8 characters');
      const [u] = await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(by(who)).returning();
      if (!u) throw new Error(`No account with ${who}`);
      console.log(`✓ password set for ${u.name}`);
      break;
    }
    case 'list': {
      const list = await db.select().from(users).where(eq(users.role, 'admin'));
      for (const u of list) console.log(`${u.id}  ${u.name}  ${u.email ?? ''}  ${u.username ? '@' + u.username : ''}${u.suspendedAt ? '  (suspended)' : ''}`);
      if (!list.length) console.log('No admins yet.');
      break;
    }
    default:
      console.log('Commands: create <username> [name] | promote <email|username> | demote <email|username> | password <email|username> | list');
  }
}

main().then(() => sql.end(), async (e) => { console.error('✗', e.message); await sql.end(); process.exit(1); });

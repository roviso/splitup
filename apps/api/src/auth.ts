import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { REFERRAL_DAYS, creditsOf, profileInput } from '@splitup/shared';
import { db } from './db';
import { users, sessions, otps } from './schema';
import { adminEmails, audit, clientIp, settings, touch } from './platform';
import { checkPassword, hashPassword } from './password';
export { hashPassword };

export type User = typeof users.$inferSelect;
/** `impersonator`: the admin behind a "view as" session, if this is one. */
export type Env = { Variables: { user: User; impersonator: { id: string; name: string } | null } };

export const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const token = (bytes = 24) => randomBytes(bytes).toString('base64url');
const SESSION_DAYS = 90;
const prod = process.env.NODE_ENV === 'production';

export async function parse<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const r = schema.safeParse(await c.req.json().catch(() => undefined));
  if (!r.success) throw new HTTPException(400, { message: r.error.issues[0]?.message ?? 'Invalid input' });
  return r.data;
}

/** A new account can still enter a friend's invite code. */
export const canRedeem = (u: User) => !u.referredBy && +(u.joinedAt ?? u.createdAt) > Date.now() - REFERRAL_DAYS * 864e5;

/** The logged-in user as they see themselves. */
export function self(user: User, impersonator: { id: string; name: string } | null = null) {
  const { googleSub, inviteToken, passwordHash, aiUsed, aiPeriod, aiBonus, suspendedAt, suspendReason, lastSeenAt, ...u } = user;
  return { ...u, hasPassword: !!passwordHash, aiCredits: creditsOf(user), canRedeem: canRedeem(user), impersonatedBy: impersonator?.name ?? null };
}

const password = z.string().min(8, 'Password needs at least 8 characters').max(200);

// ponytail: in-memory per-IP limiter, fine for one server; move to Redis/DB if you run several.
const hits = new Map<string, number[]>();
export function limit(c: Context, max: number, windowMs: number) {
  if (!prod) return;
  // Last hop = what our own proxy (Caddy) saw; earlier entries are client-controlled.
  const ip = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'local';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HTTPException(429, { message: 'Too many attempts, try again later' });
  hits.set(ip, [...recent, now]);
}

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465, // 465 = TLS; 587 = STARTTLS (e.g. Gmail)
      requireTLS: Number(process.env.SMTP_PORT ?? 465) !== 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;
if (mailer) mailer.verify().then(() => console.log(`Email: sending via ${process.env.SMTP_HOST}`), (e) => console.error(`Email: SMTP login failed — ${e.message}`));
else console.log('Email: no SMTP_HOST set — login codes are printed here and shown on screen (dev only)');

async function sendCode(email: string, code: string) {
  if (!mailer) return console.log(`[dev] login code for ${email}: ${code}`);
  await mailer.sendMail({
    from: process.env.MAIL_FROM ?? `Split-Up <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your Split-Up code`,
    text: `Your Split-Up login code is ${code}. It expires in 10 minutes.\n\nतपाईंको Split-Up कोड ${code} हो।`,
    html: `<div style="font-family:system-ui;padding:24px"><h2 style="margin:0 0 8px">Split-Up</h2><p>Your login code:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p>
      <p style="color:#666">Expires in 10 minutes. तपाईंको लगइन कोड।</p></div>`,
  });
}

const SUSPENDED = 'This account has been suspended. Contact support if you think this is a mistake.';
export const SID = { httpOnly: true, secure: prod, sameSite: 'Lax' as const, path: '/' };
export const sessionMeta = (c: Context) => ({ ip: clientIp(c), userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null });

async function startSession(c: Context, user: User, method: 'password' | 'code' | 'google') {
  if (user.suspendedAt) throw new HTTPException(403, { message: SUSPENDED });
  const t = token(32);
  await db.insert(sessions).values({ tokenHash: sha(t), userId: user.id, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5), method, ...sessionMeta(c) });
  setCookie(c, 'sid', t, { ...SID, maxAge: SESSION_DAYS * 86400 });
  await audit(c, user.id, 'login', { type: 'user', id: user.id }, { method });
  return t;
}

/** New accounts can be paused from the admin console; ADMIN_EMAILS can always get in. */
async function canSignUp(email: string) {
  if (!(await settings()).signupsEnabled && !adminEmails.has(email)) throw new HTTPException(403, { message: 'New sign-ups are paused right now. Please try again later.' });
}
const roleFor = (email: string) => (adminEmails.has(email) ? { role: 'admin' } : {});

/** Account for a verified email. A placeholder a friend created with this email becomes theirs. */
async function userForEmail(email: string, name?: string, googleSub?: string) {
  const [found] = await db.select().from(users).where(googleSub ? eq(users.googleSub, googleSub) : eq(users.email, email));
  const existing = found ?? (googleSub ? (await db.select().from(users).where(eq(users.email, email)))[0] : undefined);
  if (existing) {
    const isNew = !existing.registered;
    if (isNew) await canSignUp(email);
    if (isNew || (googleSub && !existing.googleSub)) {
      const [u] = await db.update(users)
        .set({
          registered: true, googleSub: existing.googleSub ?? googleSub, name: isNew && name ? name : existing.name,
          ...(isNew && { joinedAt: new Date(), ...roleFor(email) }),
        })
        .where(eq(users.id, existing.id)).returning();
      return { user: u, isNew };
    }
    return { user: existing, isNew };
  }
  await canSignUp(email);
  const [u] = await db.insert(users).values({ email, name: name || email.split('@')[0], googleSub, registered: true, joinedAt: new Date(), ...roleFor(email) }).returning();
  return { user: u, isNew: true };
}

// No 0/O, 1/I/L: people read these codes aloud and type them in.
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newFriendCode = () => Array.from(randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
/** "ab2c-d3ef" / "AB2C D3EF" → "AB2CD3EF". */
export const normCode = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Give the user a (new) personal friend code. `replace` revokes the old one. */
export async function assignFriendCode(u: User, replace = false): Promise<User> {
  if (u.friendCode && !replace) return u;
  for (let i = 0; ; i++) {
    try {
      const [row] = await db.update(users).set({ friendCode: newFriendCode() }).where(eq(users.id, u.id)).returning();
      return row;
    } catch (e) {
      if (i >= 3) throw e; // unique clash is ~impossible; don't loop forever on a real error
    }
  }
}

const email = z.email().trim().toLowerCase();
const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const googleId = process.env.GOOGLE_CLIENT_ID, googleSecret = process.env.GOOGLE_CLIENT_SECRET;
const verifyGoogle = (idToken: string) =>
  jwtVerify(idToken, jwks, { audience: googleId, issuer: ['https://accounts.google.com', 'accounts.google.com'] }).then((r) => r.payload);

/** Where Google sends people back. APP_URL wins; otherwise the host they came in on (nginx and Vite pass it through). */
const googleRedirect = (c: Context) =>
  `${process.env.APP_URL?.replace(/\/$/, '') ?? `${c.req.header('x-forwarded-proto')?.split(',')[0].trim() ?? new URL(c.req.url).protocol.slice(0, -1)}://${c.req.header('host')}`}/api/auth/google/callback`;
/** Only same-site paths, so the login can't bounce people to another site. */
const safeNext = (s?: string) => (s && /^\/(?!\/)/.test(s) && !s.startsWith('/api/') ? s : '/');
const G_COOKIE = { path: '/api/auth/google', httpOnly: true, secure: prod, sameSite: 'Lax' as const };

export const authRoutes = new Hono<Env>()
  .post('/auth/otp/request', async (c) => {
    limit(c, 10, 15 * 60e3);
    const { email: e } = await parse(c, z.object({ email }));
    const [prev] = await db.select().from(otps).where(eq(otps.email, e));
    if (prev && Date.now() - prev.sentAt.getTime() < 30e3) throw new HTTPException(429, { message: 'Wait 30 seconds before asking for a new code' });
    const code = String(randomInt(100000, 1000000));
    const row = { codeHash: sha(e + code), attempts: 0, expiresAt: new Date(Date.now() + 10 * 60e3), sentAt: new Date() };
    await db.insert(otps).values({ email: e, ...row }).onConflictDoUpdate({ target: otps.email, set: row });
    await sendCode(e, code).catch((err) => {
      console.error('Email send failed:', err.message);
      throw new HTTPException(502, { message: "Couldn't send the email. Check the SMTP settings." });
    });
    // No mail server in dev: hand the code to the screen so nobody gets stuck.
    return c.json({ ok: true, ...(!mailer && !prod && { devCode: code }) });
  })
  /** Verifies the email. With name + password it's a sign-up; without, a passwordless login. */
  .post('/auth/otp/verify', async (c) => {
    limit(c, 30, 15 * 60e3);
    const { email: e, code, name, password: pw } = await parse(c, z.object({
      email, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
      name: z.string().trim().min(1).max(60).optional(), password: password.optional(),
    }));
    const [otp] = await db.select().from(otps).where(eq(otps.email, e));
    if (!otp || otp.expiresAt < new Date()) throw new HTTPException(400, { message: 'Code expired, request a new one' });
    if (otp.attempts >= 5) throw new HTTPException(429, { message: 'Too many wrong codes, request a new one' });
    if (otp.codeHash !== sha(e + code)) {
      await db.update(otps).set({ attempts: otp.attempts + 1 }).where(eq(otps.email, e));
      throw new HTTPException(400, { message: 'Wrong code' });
    }
    await db.delete(otps).where(eq(otps.email, e));
    let { user, isNew } = await userForEmail(e, name);
    if (pw) [user] = await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, user.id)).returning();
    return c.json({ user: self(user), isNew: isNew && !name, token: await startSession(c, user, 'code') });
  })
  .post('/auth/login', async (c) => {
    limit(c, 20, 15 * 60e3);
    // `email` may also be a username (staff accounts like "admin" have no email).
    const { email: id, password: pw } = await parse(c, z.object({ email: z.string().trim().toLowerCase().min(1).max(200), password: z.string().min(1).max(200) }));
    const [u] = await db.select().from(users).where(id.includes('@') ? eq(users.email, id) : eq(users.username, id));
    if (!u || !(await checkPassword(pw, u.passwordHash))) throw new HTTPException(401, { message: 'Wrong email or password' });
    return c.json({ user: self(u), isNew: false, token: await startSession(c, u, 'password') });
  })
  /** Google Identity Services credential (the in-page button, or a mobile app's ID token). */
  .post('/auth/google', async (c) => {
    limit(c, 30, 15 * 60e3);
    if (!googleId) throw new HTTPException(404, { message: 'Google login is not configured' });
    const { credential } = await parse(c, z.object({ credential: z.string().min(10) }));
    const payload = await verifyGoogle(credential).catch(() => { throw new HTTPException(401, { message: 'Google sign-in failed' }); });
    if (!payload.email || !payload.email_verified) throw new HTTPException(401, { message: 'Google email not verified' });
    const { user, isNew } = await userForEmail(String(payload.email).toLowerCase(), payload.name as string | undefined, payload.sub);
    return c.json({ user: self(user), isNew, token: await startSession(c, user, 'google') });
  })
  /** "Continue with Google", web redirect flow: authorization code + PKCE, state checked against a short-lived cookie. */
  .get('/auth/google/start', (c) => {
    limit(c, 30, 15 * 60e3);
    if (!googleId || !googleSecret) throw new HTTPException(404, { message: 'Google login is not configured' });
    const state = token(16), verifier = token(32);
    setCookie(c, 'g_oauth', `${state}.${verifier}.${safeNext(c.req.query('next'))}`, { ...G_COOKIE, maxAge: 600 });
    const q = new URLSearchParams({
      client_id: googleId, redirect_uri: googleRedirect(c), response_type: 'code', scope: 'openid email profile', state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
    });
    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  })
  .get('/auth/google/callback', async (c) => {
    const [state, verifier, ...rest] = getCookie(c, 'g_oauth')?.split('.') ?? [];
    deleteCookie(c, 'g_oauth', G_COOKIE);
    const next = safeNext(rest.join('.'));
    const { code, error, state: got } = c.req.query();
    if (error) return c.redirect('/?google=cancelled');
    if (!googleId || !googleSecret || !state || !verifier || got !== state || !code) return c.redirect('/?google=failed');
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ code, client_id: googleId, client_secret: googleSecret, redirect_uri: googleRedirect(c), grant_type: 'authorization_code', code_verifier: verifier }),
      });
      const tok = (await r.json()) as { id_token?: string; error?: string; error_description?: string };
      if (!tok.id_token) throw new Error(tok.error_description ?? tok.error ?? `token endpoint ${r.status}`);
      const payload = await verifyGoogle(tok.id_token);
      if (!payload.email || !payload.email_verified) return c.redirect('/?google=unverified');
      const { user } = await userForEmail(String(payload.email).toLowerCase(), payload.name as string | undefined, payload.sub);
      if (user.suspendedAt) return c.redirect('/?google=suspended');
      await startSession(c, user, 'google');
      return c.redirect(next);
    } catch (e) {
      if (e instanceof HTTPException && e.status === 403) return c.redirect('/?google=paused');
      console.error('Google sign-in failed:', (e as Error).message);
      return c.redirect('/?google=failed');
    }
  })
  .get('/config', async (c) => {
    const s = await settings();
    return c.json({
      googleClientId: googleId || null,
      googleRedirect: !!(googleId && googleSecret), // prefer the redirect button over the GIS iframe
      ai: !!process.env.OPENAI_API_KEY && s.aiEnabled,
      announcement: s.announcement.active && s.announcement.text ? s.announcement : null,
      signups: s.signupsEnabled,
    });
  });

const bearer = (c: Context) => c.req.header('authorization')?.replace(/^Bearer /i, '') || getCookie(c, 'sid');

/** Accepts the httpOnly cookie (web) or `Authorization: Bearer` (mobile). */
export const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  const t = bearer(c);
  if (t) {
    const [row] = await db.select({ user: users, impersonatorId: sessions.impersonatorId }).from(sessions).innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha(t)), gt(sessions.expiresAt, new Date())));
    if (row) {
      const imp = row.impersonatorId ? (await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, row.impersonatorId)))[0] ?? null : null;
      // An admin viewing as a suspended user still gets in; the user themselves doesn't.
      if (row.user.suspendedAt && !imp) throw new HTTPException(403, { message: SUSPENDED });
      if (!imp && row.user.role !== 'admin') {
        const { maintenance } = await settings();
        if (maintenance.active) throw new HTTPException(503, { message: maintenance.message });
      }
      c.set('user', row.user);
      c.set('impersonator', imp);
      if (!imp) touch(row.user.id); // "view as" shouldn't count as the user being active
      else if (c.req.method !== 'GET') await audit(c, imp.id, 'admin.impersonate.write', { type: 'user', id: row.user.id }, { method: c.req.method, path: c.req.path });
      return next();
    }
  }
  throw new HTTPException(401, { message: 'Please log in' });
};

/** Admin-only routes. A "view as" session is the other user's, so it never passes. */
export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (c.get('user').role !== 'admin' || c.get('impersonator')) throw new HTTPException(404, { message: 'Not found' });
  return next();
};

export const meRoutes = new Hono<Env>()
  .get('/me', async (c) => c.json(self(await assignFriendCode(c.get('user')), c.get('impersonator'))))
  .post('/me/code/reset', async (c) => c.json(self(await assignFriendCode(c.get('user'), true))))
  .patch('/me', async (c) => {
    const [u] = await db.update(users).set(await parse(c, profileInput)).where(eq(users.id, c.get('user').id)).returning();
    return c.json(self(u));
  })
  // Being logged in (by code, Google or password) is proof enough; this doubles as "forgot password".
  .post('/me/password', async (c) => {
    const { password: pw } = await parse(c, z.object({ password }));
    const [u] = await db.update(users).set({ passwordHash: await hashPassword(pw) }).where(eq(users.id, c.get('user').id)).returning();
    return c.json(self(u));
  })
  .post('/auth/logout', async (c) => {
    const t = bearer(c);
    if (t) await db.delete(sessions).where(eq(sessions.tokenHash, sha(t)));
    deleteCookie(c, 'sid', { path: '/' });
    return c.json({ ok: true });
  })
  /** End a "view as" session and put the admin's own session back. */
  .post('/auth/unimpersonate', async (c) => {
    const imp = c.get('impersonator');
    if (!imp) throw new HTTPException(400, { message: 'You are not viewing as someone else' });
    const t = bearer(c), back = getCookie(c, 'sid_admin');
    if (t) await db.delete(sessions).where(eq(sessions.tokenHash, sha(t)));
    deleteCookie(c, 'sid_admin', { path: '/' });
    const [own] = back ? await db.select().from(sessions).where(and(eq(sessions.tokenHash, sha(back)), eq(sessions.userId, imp.id), gt(sessions.expiresAt, new Date()))) : [];
    if (own) setCookie(c, 'sid', back!, { ...SID, maxAge: Math.floor((+own.expiresAt - Date.now()) / 1000) });
    else deleteCookie(c, 'sid', { path: '/' });
    await audit(c, imp.id, 'admin.impersonate.stop', { type: 'user', id: c.get('user').id });
    return c.json({ ok: !!own });
  });

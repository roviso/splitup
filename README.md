# Split-Up

Split bills with friends, the Nepali way. Web app live at **splitup.thimitech.com**. Android and iOS apps come next (see [Mobile](#mobile-next)).

- **Free and unlimited.** No daily expense cap.
- **Five ways to split:** equal, exact amounts, percentages, shares, and **itemized bills** where each person pays for what they ate, with **10% service charge and 13% VAT** shared out proportionally.
- **Multiple payers** on one expense, and **debt simplification** so a group settles in the fewest payments.
- **Settle up with eSewa, Khalti or Fonepay.** Friends see your wallet ID and QR code when they pay you.
- **English and नेपाली** (Devanagari numerals, lakh grouping), with **B.S. or A.D. dates**.
- **AI bill scanning and chat:** snap a bill and AI reads the items, service charge and VAT; tap who had what, or just type "Ram had the beer, the rest we shared". 5 free AI bills a month, plus 5 more for every friend you invite.
- **Easy signup:** email + password (the email is confirmed once with a code), a passwordless email code, or Google. **Import contacts** from your phone (Android Chrome) or a .vcf/.csv file. Invite people by WhatsApp or link; their history links to their account when they join.
- **Add friends by QR.** Everyone has a personal friend code and QR. Friends scan it with the phone camera or the in-app scanner, or look you up by code or exact email. Adding is mutual and instant, with a celebration on both phones.
- **Live sync.** Groups, expenses and settle-ups show up on everyone's screen as they happen (server-sent events over Postgres LISTEN/NOTIFY), with pop-down banners and a "For you" inbox.
- **Shared settle-up.** The receiver taps "Got it ✓" and the payer sees it confirmed. In-app nudges for people who owe you. Link a by-name placeholder to your friend's real account once they join.
- Groups, invite links and QR, activity feed with undo (restore deleted expenses), payment reminders on WhatsApp, CSV export, installable as a PWA.

## Stack

| Part | Tech |
|---|---|
| Web | React 19, Vite, Tailwind CSS 4, TanStack Query |
| API | Node, Hono, Zod |
| DB | PostgreSQL 17, Drizzle ORM. Money is stored as integer **paisa**, never floats. |
| Shared | `packages/shared`: split math, validation, contact parsing. The future mobile app reuses it. |
| Deploy | Docker Compose: app, Postgres, and Caddy (automatic HTTPS) |

```
packages/shared   split math + schemas (tested)      apps/api   Hono API, auth, ledger
apps/web          React app                           drizzle/   SQL migrations (run automatically on start)
```

## Develop

You need Node 20.19+ and Docker.

```bash
npm install
npm run db      # starts Postgres on localhost:5544
npm run dev     # API on :3000, web on http://localhost:5173
```

With no SMTP settings, sign-up codes **show on screen and in the API terminal** (dev only). Put SMTP settings in `.env` to send real emails. Gmail works with an app password on port 587.

`npm run seed -w apps/api` creates a demo account with sample data: **demo@splitup.test / Namaste123** (the API must be running).

### Google sign-in
1. Go to [console.cloud.google.com](https://console.cloud.google.com), open **APIs & Services → Credentials**, and choose **Create credentials → OAuth client ID → Web application**.
2. Under **Authorized redirect URIs**, add `https://splitup.thimitech.com/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback`.
3. Put `GOOGLE_CLIENT_ID=...` and `GOOGLE_CLIENT_SECRET=...` in `.env` and restart. A "Continue with Google" button then appears at the top of the login page.

Without a client secret, the app shows Google's own in-page button instead. That one needs **Authorized JavaScript origins** (`https://splitup.thimitech.com`, `http://localhost:5173`) rather than redirect URIs.

### AI: scan a bill, or just say what happened
Set `OPENAI_API_KEY` in `.env` (optionally `OPENAI_MODEL`, default `gpt-5.5`). Then:
- **Snap the bill.** The camera button in the "Tell AI what you spent…" bar (Home, groups, friends) or in *Add expense* reads every item, price, service charge and VAT, including B.S.-dated Nepali bills, and checks the result against the printed total.
- **Tap who had what.** Pick a person, tap their items; shares update live. Or tell the AI: "Bibek had the beer, the rest we shared, Hari paid."
- **Or just type it.** "hijo Sita sanga momo 900, maile tireko" becomes a ready-to-save expense. English, Nepali and Romanized Nepali all work, and the mic dictates where the browser supports it.

**Credits.** Everyone gets **5 free AI bills a month** (resets on the 1st, Nepal time). One credit covers one bill, including re-scans and chat corrections, and failed requests are refunded. **Invite friends to get more:** your friend code is your invite code, and when someone signs up with it (from your invite link, or typed at sign-up within their first 7 days) you both get **5 bonus credits** that never expire. The numbers live in `packages/shared/src/constants.ts`.

AI bills save as normal itemized (or equal) expenses, so they can be edited like any other. Bill photos and the names of the people on the bill are sent to OpenAI; nothing else leaves the server.

```bash
npm test         # split math, itemized VAT and contact parsing
npm run typecheck
```

To change the database, edit `apps/api/src/schema.ts` and then run `npm run db:generate -w apps/api`. The API applies new migrations when it starts.

## Deploy to splitup.thimitech.com

1. Add a DNS **A record**: `splitup.thimitech.com` → your server's IP.
2. On the server (with Docker installed):
   ```bash
   git clone <repo> split-up && cd split-up
   cp .env.example .env   # set POSTGRES_PASSWORD, SMTP_* (e.g. your Hostinger mailbox), optional GOOGLE_CLIENT_ID
   docker compose up -d --build
   ```
   Caddy gets the HTTPS certificate automatically. To update later: `git pull && docker compose up -d --build`.

**If the server already runs nginx on ports 80/443:** delete the `caddy` service from `docker-compose.yml`, add `ports: ["127.0.0.1:3000:3000"]` to `app`, and proxy to it:

```nginx
server {
  server_name splitup.thimitech.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  # then: certbot --nginx -d splitup.thimitech.com
}
```

Live updates use a long-lived `GET /api/events` stream. The app sends `X-Accel-Buffering: no` and a heartbeat every 25 s, so nginx's default buffering and a 60 s `proxy_read_timeout` are fine.

**Back up the database every night.** It holds people's money records.

```bash
# crontab -e
0 2 * * * cd /path/to/split-up && docker compose exec -T db pg_dump -U splitup splitup | gzip > backups/splitup-$(date +\%F).sql.gz
```

## Security notes

- Passwords are hashed with scrypt (salted, compared in constant time). Signing up with a password still confirms the email by code, so nobody can take over an email address they don't own.
- Login codes are hashed, expire after 10 minutes, and allow 5 attempts. Login endpoints are rate-limited per IP in production.
- Sessions are httpOnly, SameSite=Lax cookies on the web, or `Authorization: Bearer <token>` for mobile. Cross-site form posts are blocked.
- Every read and write checks group membership or friendship. People outside a group get a 404.
- Accounts link only by **verified email**. Phone numbers are never used to match people, because they aren't verified.

## Mobile (next)

Planned: **Expo (React Native)** in `apps/mobile`. It reuses `@splitup/shared` and the same API with bearer tokens. It adds native contact import (`expo-contacts`), push reminders, and a receipt camera, with one codebase for Android and iOS.

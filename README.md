# Split-Up

Split bills with friends, the Nepali way. Web app live at **splitup.thimitech.com**. Android and iOS apps come next (see [Mobile](#mobile-next)).

- **Free and unlimited.** No daily expense cap.
- **Five ways to split:** equal, exact amounts, percentages, shares, and **itemized bills** where each person pays for what they ate, with **10% service charge and 13% VAT** shared out proportionally.
- **Multiple payers** on one expense, and **debt simplification** so a group settles in the fewest payments.
- **Settle up with eSewa, Khalti or Fonepay.** Friends see your wallet ID and QR code when they pay you.
- **English and नेपाली** (Devanagari numerals, lakh grouping), with **B.S. or A.D. dates**.
- **Easy signup:** email + password (the email is confirmed once with a code), a passwordless email code, or Google. **Import contacts** from your phone (Android Chrome) or a .vcf/.csv file. Invite people by WhatsApp or link; their history links to their account when they join.
- Groups, invite links, activity feed with undo (restore deleted expenses), payment reminders on WhatsApp, CSV export, installable as a PWA.

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
2. Under **Authorized JavaScript origins**, add `http://localhost:5173`, `http://localhost:3000` and `https://splitup.thimitech.com`. No redirect URIs are needed.
3. Put the client ID in `.env` as `GOOGLE_CLIENT_ID=...` and restart. The "Continue with Google" button then appears on the login page.

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

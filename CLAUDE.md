# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Split-Up is a bill-splitting web app for Nepal (live at splitup.thimitech.com): groups, friends, five split types including itemized restaurant bills with 10% service charge + 13% VAT, eSewa/Khalti settle-up, English/नेपाली with B.S. dates, live sync, and AI bill scanning/chat (OpenAI).

## Commands

```bash
npm install
npm run db            # dev Postgres in Docker on localhost:5544 (docker-compose.dev.yml)
npm run dev           # API on :3000 (node --watch + tsx) and Vite on :5173 (proxies /api → :3000)
npm test              # node:test via tsx: packages/shared/src/{split,contacts,ai}.test.ts
npm run typecheck     # tsc for shared, api, web; there is no linter
npm run build         # vite build → apps/web/dist, esbuild bundle → apps/api/dist/index.cjs
npm run seed -w apps/api          # demo@splitup.test / Namaste123 (API must be running on :3000)
npm run db:generate -w apps/api   # after editing apps/api/src/schema.ts; migrations apply on API start
```

Single test file: `npx tsx --test packages/shared/src/ai.test.ts`. Single test by name: add `--test-name-pattern "itemized"`.

The API dev script loads `../../.env` with `--env-file-if-exists`, which does not override variables already set. To point dev at another DB, export `DATABASE_URL`, `NODE_ENV=development` and `SOCKET_PATH=` (empty) before starting it. With no `SMTP_HOST`, login codes print in the API log and show on screen.

## Production on this server

It runs bare-metal, not with the repo's docker-compose/Caddy. `splitup.service` (systemd) runs `node apps/api/dist/index.cjs` straight from this checkout, with `EnvironmentFile=.env`. It listens on the Unix socket `SOCKET_PATH` (`splitup.sock`), and nginx (`/etc/nginx/sites-enabled/splitup.thimitech.com`) proxies to it and serves `/assets/` from `apps/web/dist/assets`.

- **Deploy** = `npm run deploy` (`scripts/deploy.sh`): install, test, typecheck, build into side directories, swap them in, restart `splitup`, then wait for `/api/config` on the socket. Don't run a plain `npm run build` against the live checkout: it deletes the hashed assets the running process's in-memory `index.html` still points to. `.env` changes only need `systemctl restart splitup`.
- The production DB is `DATABASE_URL` in `.env` (Postgres 18, port 5432, db `splitup`). Don't run seeds or experiments against it; `splitup_dev` on the same server is someone's dev database.
- nginx `client_max_body_size` is 2M. Bill photos are shrunk in the browser to ≤1.5 MB before upload for this reason.

## Architecture

npm workspaces: `packages/shared` (pure TS, no build step, imported as `@splitup/shared` by both apps and meant for a future Expo app), `apps/api` (Hono on Node), `apps/web` (React 19 + Vite + Tailwind 4 + TanStack Query).

**Money is integer paisa everywhere** (रु 1 = 100). All split maths lives in `packages/shared/src/split.ts`. `allocate` (largest remainder) guarantees parts sum exactly to the total. Itemized bills apply service charge on the subtotal, then VAT on (subtotal + SC), shared in proportion to what each person ate. `expenseInput` (zod, shared) rejects expenses whose payers or shares don't sum to `amount`. The server re-validates everything the web computes.

**Expense storage.** `expenses` holds the header. `expense_payers` and `expense_shares` hold per-user paisa. `meta` (jsonb) keeps the raw form inputs (`items`, `sc`, `vat`, `excluded`, `exact`, …) so `ExpenseForm` can reopen an expense for editing. Anything that creates expenses (including the AI flow) must write `meta` in that same shape. Balances are never stored; `apps/api/src/ledger.ts` recomputes debts per group (optionally simplified) on each request. Deletes are soft (`deletedAt`) so Activity can undo.

**Visibility rule.** Every read and write checks group membership, or friendship for non-group items, and answers 404 otherwise. Non-group expenses must include the caller, and everyone else must be their friend. People can be unregistered placeholders (`users.registered=false`, `inviteToken`) created by a friend. Accounts link only by verified email, never phone. `mergeInto` in `routes.ts` moves a placeholder's history onto a real account.

**Live sync.** After any write, routes call `sync(userIds)` and/or `notify(...)` (`apps/api/src/events.ts`). These go through Postgres `LISTEN/NOTIFY` to the SSE stream `GET /api/events`. The web (`live.ts`) answers any push by invalidating all queries (debounced). New write endpoints must call `sync` for everyone who can see the change, or other devices go stale.

**Auth** (`apps/api/src/auth.ts`): httpOnly `sid` cookie on web, `Authorization: Bearer` for mobile, sessions hashed in the DB. Sign-in options are password (sign-up confirms email by OTP), passwordless OTP, and Google. Google has two paths: the web redirect flow `GET /api/auth/google/start` → `/callback` (authorization code + PKCE, state in a `g_oauth` cookie; needs `GOOGLE_CLIENT_SECRET`; redirect URI `<origin>/api/auth/google/callback` must be registered in Google Cloud Console, and origin comes from `APP_URL` or Host + X-Forwarded-Proto), and `POST /api/auth/google` for GIS/mobile ID tokens. `GET /api/config` tells the web which ones are available and whether AI is on.

**AI** (`apps/api/src/ai.ts`, `packages/shared/src/ai.ts`). Everything is a `Draft`: an itemized bill in paisa where every split is modelled as items + who had them ("2400 split by 4" = one item everyone had).
- `POST /ai/scan` sends a bill photo to OpenAI Chat Completions with a strict JSON schema, then `normalizeBill` converts to paisa, derives SC/VAT percents from printed amounts, and flags B.S. dates. The web converts B.S. → A.D. in `ai.ts:billDay`.
- `POST /ai/chat` takes the conversation + current draft and returns a reply + updated draft. The server builds the allowed people and groups from the DB (never from the client) and gives the model short refs (`P1`, `G2`) instead of UUIDs. `fromModel` maps refs back and drops anyone not allowed on the bill.
- Saving uses `draftToExpense` (shared, tested), which yields a normal `POST /expenses` body with ExpenseForm-compatible `meta`. There's no separate AI storage.
- Model: `OPENAI_MODEL` (default `gpt-5.5`; `reasoning_effort: low` is sent for gpt-5/o-series). Per-user hourly caps are in memory.
- **Credits** (`apps/api/src/credits.ts`, numbers in `shared/constants.ts`): 1 credit = 1 bill. Every AI request goes through `metered()`. With no valid `session` it spends a credit (this month's free ones first, then `aiBonus`, row-locked) and opens an `ai_sessions` row. Follow-ups carrying that session are free (≤25 turns, 6 h). If the AI throws, a freshly spent credit is refunded. Out of credits → 402, and the web opens the credits sheet. The free allowance resets per calendar month in **Asia/Kathmandu** time (`creditPeriod`); `users.aiUsed` only counts when `aiPeriod` is the current month.
- **Invites/referrals**: a user's friend code is also their invite code. `POST /me/referral` works once per account, within `REFERRAL_DAYS` of `joinedAt`. It gives the new user and the inviter `REFERRAL_BONUS` each (the inviter's reward is capped per month), befriends them and notifies (`referral_joined`). The web remembers a code from `/add/<code>` or the sign-up field in localStorage and redeems it after the first login (`App.tsx`), so it works for every sign-in method, Google included.
- Web entry points: `AiBar` (Home/Group/Friend), the "Let AI fill it in" strip in `ExpenseForm`, and the sidebar. All open `SmartSplit` (modal) → `BillEditor` (tap a person, then tap items). A single app-wide hidden `<input type=file>` (`registerPicker`/`snapBill` in `web/src/ai.ts`) lets camera buttons open the camera within the same click.

**Web conventions.** Global UI state (which modal is open, toasts) uses the tiny `createStore` in `ui.tsx` (`openExpense`, `openSettle`, `openAi`, …), not context. All data fetching goes through `api()` in `api.ts`; after writes, call `refresh()` (invalidates everything). Modals use native `<dialog>` via `Modal`, and Esc routes through `onClose`.

**i18n.** English text is the key: `t('Add expense')`. Nepali lives in `apps/web/src/ne.ts` as a flat object, and a duplicate key is a type error, so check before adding. Missing keys fall back to English. Server error messages are English only.
- `money()` prints `Rs 1,23,456` in English and `रु १,२३,४५६` in Nepali (use `cur()`/`amount()` for the parts, and never hard-code रु).
- Devanagari digits come from `devaDigits()`, not `Intl`: Chrome and Android ship without Nepali number data. Numeric `{n}` vars are converted automatically in Nepali.
- Nepali mode always shows B.S. dates with everyday month names (बैशाख, जेठ, … साउन, भदौ, असोज); English follows the account's A.D./B.S. setting (`usesBs()`).

**Styling.** Colour tokens are CSS variables in `index.css` (`bg`, `surface`, `ink`, `marigold`, `owed` = green, `owe` = sindoor), with dark mode via `prefers-color-scheme`. The global `:focus-visible` outline is unlayered, so Tailwind's `outline-none` can't override it; use the `.no-ring` class for text boxes inside a pill that shows focus itself. Inside `Modal`'s scroll area (which has `py-5`), sticky headers and footers need `-top-5` / `-bottom-5` to sit flush.

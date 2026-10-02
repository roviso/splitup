# Graph Report - .  (2026-10-01)

## Corpus Check
- 83 files · ~72,050 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 817 nodes · 2307 edges · 37 communities (36 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_AI credits & metering|AI credits & metering]]
- [[_COMMUNITY_Video script & captions|Video script & captions]]
- [[_COMMUNITY_Ledger & friend graph|Ledger & friend graph]]
- [[_COMMUNITY_Web app shell & layout|Web app shell & layout]]
- [[_COMMUNITY_Auth & sessions|Auth & sessions]]
- [[_COMMUNITY_Groups|Groups]]
- [[_COMMUNITY_AI draft & bill parsing (shared)|AI draft & bill parsing (shared)]]
- [[_COMMUNITY_AI bar & credits UI|AI bar & credits UI]]
- [[_COMMUNITY_Admin charts|Admin charts]]
- [[_COMMUNITY_Expense detail & rows UI|Expense detail & rows UI]]
- [[_COMMUNITY_Expense form & bill editor|Expense form & bill editor]]
- [[_COMMUNITY_Web dependencies|Web dependencies]]
- [[_COMMUNITY_Video app dependencies|Video app dependencies]]
- [[_COMMUNITY_Admin routes & activity feed|Admin routes & activity feed]]
- [[_COMMUNITY_Settle-up & payments UI|Settle-up & payments UI]]
- [[_COMMUNITY_API dependencies|API dependencies]]
- [[_COMMUNITY_Activity feed text|Activity feed text]]
- [[_COMMUNITY_AI web client|AI web client]]
- [[_COMMUNITY_Web data layer|Web data layer]]
- [[_COMMUNITY_Admin CLI & DB|Admin CLI & DB]]
- [[_COMMUNITY_Admin feed kit|Admin feed kit]]
- [[_COMMUNITY_Root buildtooling config|Root build/tooling config]]
- [[_COMMUNITY_SSE events & live push (server)|SSE events & live push (server)]]
- [[_COMMUNITY_Add friend  invites|Add friend / invites]]
- [[_COMMUNITY_Mobile (Capacitor) deps|Mobile (Capacitor) deps]]
- [[_COMMUNITY_Admin app shell|Admin app shell]]
- [[_COMMUNITY_API routes & server entry|API routes & server entry]]
- [[_COMMUNITY_Live sync (web)|Live sync (web)]]
- [[_COMMUNITY_Shared package manifest|Shared package manifest]]
- [[_COMMUNITY_Screenshot scripts|Screenshot scripts]]
- [[_COMMUNITY_AI screenshot scripts|AI screenshot scripts]]
- [[_COMMUNITY_Admin tables|Admin tables]]
- [[_COMMUNITY_Contacts parsing (shared)|Contacts parsing (shared)]]
- [[_COMMUNITY_QR scanner|QR scanner]]
- [[_COMMUNITY_Explore script|Explore script]]

## God Nodes (most connected - your core abstractions)
1. `useT()` - 78 edges
2. `cx()` - 72 edges
3. `usePrefs()` - 40 edges
4. `Button()` - 29 edges
5. `api()` - 28 edges
6. `money()` - 26 edges
7. `useMe()` - 26 edges
8. `usePeople()` - 26 edges
9. `useAdmin()` - 24 edges
10. `toastError()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `draftToExpense()` --calls--> `rupees()`  [INFERRED]
  packages/shared/src/ai.ts → apps/api/src/ai.ts
- `adminUser()` --calls--> `creditsOf()`  [EXTRACTED]
  apps/api/src/admin.ts → packages/shared/src/ai.ts
- `SettlementRow()` --calls--> `obj()`  [INFERRED]
  apps/web/src/components/Rows.tsx → apps/api/src/ai.ts
- `self()` --calls--> `creditsOf()`  [EXTRACTED]
  apps/api/src/auth.ts → packages/shared/src/ai.ts
- `loadLedger()` --calls--> `ledgerDebts()`  [EXTRACTED]
  apps/api/src/ledger.ts → packages/shared/src/split.ts

## Import Cycles
- None detected.

## Communities (37 total, 1 thin omitted)

### Community 0 - "AI credits & metering"
Cohesion: 0.06
Nodes (52): adminUser(), creditsFor(), spend(), netFor(), AiChatInput, aiScanInput, creditPeriod(), creditRenewal() (+44 more)

### Community 1 - "Video script & captions"
Cohesion: 0.05
Nodes (40): cuts, delays, inputs, lines, script, shots, sil, tail (+32 more)

### Community 2 - "Ledger & friend graph"
Cohesion: 0.09
Nodes (44): circleOf(), Ctx, canRedeem(), normCode(), self(), sql, ExpenseRow, friendIds() (+36 more)

### Community 3 - "Web app shell & layout"
Cohesion: 0.16
Nodes (32): api(), refresh(), AdminApp, Logo(), NAV, redeem(), LivePill(), TABS (+24 more)

### Community 4 - "Auth & sessions"
Cohesion: 0.08
Nodes (32): assignFriendCode(), bearer(), canSignUp(), email, G_COOKIE, hits, jwks, limit() (+24 more)

### Community 5 - "Groups"
Cohesion: 0.16
Nodes (31): Inbox, myNet(), ExpenseDetail(), Banners(), Celebrate(), ICON, NoticeRow(), Unread() (+23 more)

### Community 6 - "AI draft & bill parsing (shared)"
Cohesion: 0.11
Nodes (27): AddMember(), Detail, G, List, TYPES, act(), AdminUser, Ask (+19 more)

### Community 7 - "AI bar & credits UI"
Cohesion: 0.09
Nodes (30): ask(), billDate(), billSchema, cat(), category, chatContext(), chatPrompt(), chatSchema (+22 more)

### Community 8 - "Admin charts"
Cohesion: 0.11
Nodes (25): BillEditor(), toRs(), ExpenseForm(), Form(), num(), Row, SplitType, Ledger() (+17 more)

### Community 9 - "Expense detail & rows UI"
Cohesion: 0.09
Nodes (24): ActivityCalendar(), Bars(), Composition(), DOW, Funnel(), Heatmap(), niceTicks(), Retention() (+16 more)

### Community 10 - "Expense form & bill editor"
Cohesion: 0.07
Nodes (27): dependencies, canvas-confetti, jsqr, lucide-react, nepali-date-converter, react, react-dom, react-router-dom (+19 more)

### Community 11 - "Web dependencies"
Cohesion: 0.07
Nodes (27): dependencies, playwright, react, react-dom, remotion, @remotion/captions, @remotion/cli, @remotion/google-fonts (+19 more)

### Community 12 - "Video app dependencies"
Cohesion: 0.12
Nodes (20): Activity, Dashboard, FriendDetail, Group, GroupDetail, Part, Person, qc (+12 more)

### Community 13 - "Admin routes & activity feed"
Cohesion: 0.11
Nodes (18): ACTIVITY, addDays(), fail(), FEED(), FEED_CATS, FeedRow, getUser(), groupNames() (+10 more)

### Community 14 - "Settle-up & payments UI"
Cohesion: 0.09
Nodes (22): dependencies, drizzle-orm, hono, @hono/node-server, jose, nodemailer, postgres, @splitup/shared (+14 more)

### Community 15 - "API dependencies"
Cohesion: 0.15
Nodes (18): AdminApp(), Me, CreditsPanel(), CreditsPill(), CreditsSheet(), forgetInvite(), pendingInvite(), Redeemed (+10 more)

### Community 16 - "Activity feed text"
Cohesion: 0.12
Nodes (17): ACTIONS, actionText(), describe(), FeedList(), settingText(), TONE, [useExpenseDrawer, openExpenseDrawer], ago() (+9 more)

### Community 17 - "AI web client"
Cohesion: 0.14
Nodes (15): AiCtx, billDay(), draftFromBill(), load(), pending, pickedPhoto(), registerPicker(), shrink() (+7 more)

### Community 18 - "Web data layer"
Cohesion: 0.19
Nodes (14): askPassword(), by(), [cmd, who, ...rest], main(), Bucket, db, runMigrations(), Tx (+6 more)

### Community 19 - "Admin CLI & DB"
Cohesion: 0.13
Nodes (15): feedKey(), AskHost(), Delta(), Feed, FeedItem, Head(), n0, Panel() (+7 more)

### Community 20 - "Admin feed kit"
Cohesion: 0.15
Nodes (13): addUrl(), prettyCode(), AddFriend(), AddTab, FindTab(), Found, FoundCard(), InviteTab() (+5 more)

### Community 21 - "Root build/tooling config"
Cohesion: 0.11
Nodes (17): devDependencies, concurrently, esbuild, tsx, @types/node, typescript, name, private (+9 more)

### Community 22 - "SSE events & live push (server)"
Cohesion: 0.18
Nodes (16): Data, listeners, liveStats(), log(), notify(), Push, send(), startEvents() (+8 more)

### Community 23 - "Add friend / invites"
Cohesion: 0.12
Nodes (15): dependencies, @capacitor/android, @capacitor/core, devDependencies, @capacitor/assets, @capacitor/cli, name, private (+7 more)

### Community 24 - "Mobile (Capacitor) deps"
Cohesion: 0.25
Nodes (15): Hits, NAV, Palette(), Insights(), GroupDetail(), Groups(), rs(), useAdmin() (+7 more)

### Community 25 - "Admin app shell"
Cohesion: 0.14
Nodes (12): adminRoutes, aiRoutes, authRoutes, Env, meRoutes, api, app, photo (+4 more)

### Community 26 - "API routes & server entry"
Cohesion: 0.25
Nodes (9): snapBill(), App(), AiBar(), useAiGate(), Announcement(), read(), ViewAsBar(), useLive() (+1 more)

### Community 27 - "Live sync (web)"
Cohesion: 0.22
Nodes (9): Notice, dismissBanner(), LiveNotice, onPush(), Push, refetchSoon(), [useBanners, setBanners, getBanners], [useCelebration, celebrate] (+1 more)

### Community 28 - "Shared package manifest"
Cohesion: 0.20
Nodes (9): dependencies, zod, main, name, private, sideEffects, type, types (+1 more)

### Community 29 - "Screenshot scripts"
Cohesion: 0.28
Nodes (5): dialogShot(), groupUrl, items, settle(), shot()

### Community 30 - "AI screenshot scripts"
Cohesion: 0.25
Nodes (4): boxes, device, settle(), shot()

### Community 31 - "Admin tables"
Cohesion: 0.25
Nodes (8): TopGroups(), TopUsers(), Stat(), ExpenseTable(), SettlementTable(), Num(), Quick(), cx()

### Community 32 - "Contacts parsing (shared)"
Cohesion: 0.32
Nodes (8): byId(), PersonPicker(), LinkAccount(), Friends(), Groups(), Home(), AddByCode(), useDash()

### Community 33 - "QR scanner"
Cohesion: 0.47
Nodes (3): Contact, parseContacts(), parseCsv()

## Knowledge Gaps
- **257 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+252 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cx()` connect `Admin tables` to `Contacts parsing (shared)`, `Web app shell & layout`, `Groups`, `AI draft & bill parsing (shared)`, `Admin charts`, `Expense detail & rows UI`, `Video app dependencies`, `API dependencies`, `Activity feed text`, `AI web client`, `Admin CLI & DB`, `Admin feed kit`, `Mobile (Capacitor) deps`, `API routes & server entry`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `CATEGORIES` connect `AI credits & metering` to `Groups`, `AI draft & bill parsing (shared)`, `AI bar & credits UI`, `Admin charts`, `Expense detail & rows UI`, `Video app dependencies`, `Admin routes & activity feed`, `Activity feed text`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `useT()` connect `Groups` to `Contacts parsing (shared)`, `Explore script`, `Web app shell & layout`, `Admin charts`, `Video app dependencies`, `API dependencies`, `AI web client`, `Admin feed kit`, `API routes & server entry`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _257 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI credits & metering` be split into smaller, more focused modules?**
  _Cohesion score 0.056107539450613676 - nodes in this community are weakly interconnected._
- **Should `Video script & captions` be split into smaller, more focused modules?**
  _Cohesion score 0.05101327742837177 - nodes in this community are weakly interconnected._
- **Should `Ledger & friend graph` be split into smaller, more focused modules?**
  _Cohesion score 0.08953900709219859 - nodes in this community are weakly interconnected._
# App content / Policy — exact answers

Fill these in Play Console → **Policy → App content** (and the **Data safety**,
**Content rating**, **Target audience** sections). Every question below has the
recommended answer for Split-Up. Answer honestly — if you change a feature,
update the answer.

---

## 1. Privacy policy
- **URL:** `https://splitup.thimitech.com/privacy.html`
- The page is generated at `apps/web/public/privacy.html`. ⚠️ It only goes live
  after you **rebuild + redeploy the web app** (`docker compose up -d --build`).
  Verify the URL loads in a browser before submitting.

## 2. App access (⚠️ required — the app needs login)
Reviewers must be able to sign in. Select **“All or some functionality is restricted”**
and add a test login:
- Create a real account on production first (e.g. sign up with an email you control).
- Provide it under *Instructions*:
  - **Username/email:** `<the test email you created>`
  - **Password:** `<its password>`
  - Note: "Sign in with email + password on the login screen."
- If you use a passwordless/OTP-only test account, add a note that a code is
  emailed — but a password account is simplest for reviewers. Give it one via
  the app's password screen.

## 3. Ads
- **Does your app contain ads?** → **No**

## 4. Content rating (questionnaire)
- **Category:** Finance / Utility (not a game)
- Violence, sexual content, profanity, drugs, gambling → **No** to all
- **Does the app let users interact or exchange content/communicate?** → **Yes**
  (friends, groups, shared expenses, nudges)
- **Can users share their current location with other users?** → **No**
- **Does the app share user-provided personal info with other users?** → **Yes**
  (name + payment handles are shown to people you split with)
- **User-generated content / sharing?** → **Yes** (expenses, notes)
- Expected result: **Everyone / PEGI 3** (or Teen depending on region — fine either way).

## 5. Target audience & content
- **Target age group:** **18 and over** (simplest for a finance app; avoids extra
  child-safety obligations). Do **not** include under-13.
- **Appeal to children?** → **No**

## 6. Data safety (the big form)
**Does your app collect or share user data?** → **Yes**

For each type: *Collected = Yes*, *Shared = as noted*, *Processed ephemerally = No*,
*Required (not optional)* unless noted, *Purpose = App functionality + Account management*.

| Data type | Collected | Shared with other users? | Notes / purpose |
|---|---|---|---|
| **Name** | Yes | Yes | Shown to people you split with. App functionality. |
| **Email address** | Yes | No | Sign-in, login codes, account management. |
| **Phone number** | Yes (optional) | Only if you add it | Optional sign-in / identification. |
| **User IDs** | Yes | Yes | Friend code / account id used to connect friends. |
| **Other financial info** | Yes (optional) | Yes | eSewa/Khalti IDs & payment QR you add, shown so friends can pay you. No card/bank data. |
| **Contacts** | Yes (optional) | No | Only when you tap "import contacts", to find/invite friends. |
| **App activity / other user-generated content** | Yes | Yes | Expenses, groups, notes, settle-ups you enter. |

**Security practices to declare:**
- **Data is encrypted in transit** → **Yes** (HTTPS)
- **Users can request that data be deleted** → **Yes**
  - Provide the deletion method: email `ravi@thimitech.com` (or add an in-app
    "delete account" later and point here).
- **You follow the Families policy** → No (target is 18+)

**Account deletion URL** (Play now asks for this separately under *App content →
Data deletion*): give `https://splitup.thimitech.com/privacy.html` (the policy
explains how to request deletion) or a dedicated page if you make one.

## 7. Other App-content declarations (answer as they appear)
- **Government app?** → No
- **Financial features?** → The app helps track shared expenses but does **not**
  process payments, loans, or handle funds — answer **"My app doesn't provide any
  financial features"** (you only display users' own eSewa/Khalti handles; you are
  not a payment processor). If unsure, pick the closest "does not offer" options.
- **Health, News, COVID-19 apps?** → No
- **Data safety – SDKs:** you use Google Sign-In; declare Google as a provider if asked.

---

## Screenshots (Store listing → Graphics)
You need **at least 2** phone screenshots (JPEG/PNG, 9:16 portrait recommended,
min 320px on the short side). They must show the real app. Easiest ways:

1. **On your phone:** install `SplitUp-release.apk`, sign in, and screenshot
   3–5 good screens (dashboard/balances, a group with an itemized bill, add-friend
   QR, settle-up, Nepali view). Transfer and upload.
2. **Emulator / Chrome device mode:** open `https://splitup.thimitech.com` in
   Chrome, toggle device toolbar (phone size), sign in, and capture.

Suggested set: 1) Balances/home, 2) Itemized bill split, 3) Add friend by QR,
4) Settle up with eSewa/Khalti, 5) नेपाली interface.

Tell me if you want me to capture these from the live site for you (I can drive a
browser at a phone viewport if you're signed in / give a test account).

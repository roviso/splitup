# Split-Up launch film: script

**Format:** about 60 s, 1920×1080, 30 fps. One narrator speaking straight to the viewer.
**Voice:** Google `gemini-3.8-flash-tts`, voice *Sulafat*, recorded as one take and cut into lines.
**Look:** light lokta-paper UI (`#fbf7f0`) on a soft tiled background, ink type, with **marigold `#f2a007`** as the only accent colour. Every product shot is a real screen from splitup.thimitech.com.

## Research: what the product really does (from the live app)

| Finding | Where it shows | How the film uses it |
|---|---|---|
| Brand line: "Eat together. Split fairly. Stay friends." | Login hero | End card and CTA |
| Itemized bill: tag who had each dish; 10% service charge and 13% VAT shared out proportionally, to the paisa | Add expense → 🧾 | Hero product beat (the receipt) |
| Five split modes: equal, exact, %, shares, itemized | Add expense | One quick line |
| Live sync, and "Debts are simplified to the fewest payments" | Group → Balances | Fairness and trust beat |
| Settle with Cash, eSewa, Khalti, Fonepay or Bank; receiver taps "Got it ✓" | Settle up | Local payment rails |
| Personal friend QR and code, WhatsApp invite | Friends → My code | Getting started in seconds |
| EN / नेपाली toggle, रु amounts, B.S. dates | Header toggle | "In English, or in Nepali" |
| Free and unlimited, no daily cap | README / positioning | CTA |

**Who it's for:** friends in Nepal who eat out together, where one person pays the bill and then has to chase everyone for their share.
**The problem:** the money is small, but asking for it feels awkward.
**The promise:** the app keeps a fair tally, so nobody has to ask.

## Script (one take)

Emotion tags are used in the opening only. Each line becomes one shot.

| # | Beat | Line (spoken) | On screen |
|---|---|---|---|
| 1 | Hook, hopeful | **[excited]** Friday night. Momo with the gang, and you grab the bill. **[amazed]** Seventeen hundred rupees? Easy. They'll pay you back. | Kinetic type from inside your head; a momo plate and a bill slide in |
| 2 | Disappointed | **[disappointed]** Three weeks later… you're still waiting. And now it's awkward to ask. | Calendar pages flip; a "Seen" message goes unanswered |
| 3 | Diagnosis | Let's be honest. | Hard cut to big type |
| 4 | Diagnosis 1 | Calculators don't know who ate what. | "01", the calculator can't |
| 5 | Diagnosis 2 | Group-chat screenshots get buried. | "02", buried |
| 6 | Diagnosis 3 | And nobody wants to be the friend who asks for money. | "03", awkward |
| 7 | Turn | It's time to change. | Click → ripple → marigold colour flood |
| 8 | Reveal | Meet Split-Up. Bill splitting, the Nepali way. | Logo, then the real login screen |
| 9 | Step 1 | Add the bill item by item, and tag who had what. | Real *Add expense*, itemized view |
| 10 | Step 2 | Service charge and VAT? Shared out fairly, down to the paisa. | Real receipt: रु 1,765.06, per-person shares |
| 11 | Step 3 | Or split it equally, by shares, or by percentage. | Real split selector |
| 12 | Step 4 | Everyone sees it live, and debts simplify to the fewest payments. | Real group balances, "Live sync" |
| 13 | Step 5 | Settle up with eSewa, Khalti or Fonepay, in a tap. | Real *Settle up* sheet |
| 14 | Step 6 | Add friends with one QR scan. In English, or in Nepali. | Real friend QR, then the नेपाली home |
| 15 | Result | No chasing. No awkward texts. Just friends, square again. | Real home: "You owe रु 0", big result number |
| 16 | CTA | Eat together. Split fairly. Stay friends. Split-Up is free, at splitup dot thimitech dot com. | End card with URL |

**About 150 words, roughly 60 seconds at a conversational pace.**

## Director's notes for the voice
Warm, natural and conversational, like a friend telling you something useful over tea. The opening is played as the viewer's own inner voice: bright and hopeful, then deflated. "Let's be honest" is blunt and slower. "It's time to change" is quietly confident. The product section is calm and clear. The CTA is warm and unhurried.

## Final cut (measured)

One Gemini TTS take, cut at real pauses. Every line is leveled to −18 LUFS, and the dead air between lines is ≤ 0.08 s (checked by `scripts/check-voice.mjs`). The master is −16.0 LUFS.

| # | Shot | Starts | Length | Line |
|---|---|---|---|---|
| 1 | hook | 0.00 s | 7.80 s | Friday night. Momo with the gang, and you grab the bill. Seventeen hundred rupees? Easy. They'll pay you back. |
| 2 | sad | 7.80 s | 4.83 s | Three weeks later... you're still waiting. And now it's awkward to ask. |
| 3 | honest | 12.63 s | 0.83 s | Let's be honest. |
| 4 | d1 | 13.47 s | 2.07 s | Calculators don't know who ate what. |
| 5 | d2 | 15.53 s | 1.83 s | Group-chat screenshots get buried. |
| 6 | d3 | 17.37 s | 2.50 s | And nobody wants to be the friend who asks for money. |
| 7 | turn | 19.87 s | 1.00 s | It's time to change. |
| 8 | reveal | 20.87 s | 2.87 s | Meet Split-Up. Bill splitting, the Nepali way. |
| 9 | items | 23.73 s | 2.80 s | Add the bill item by item, and tag who had what. |
| 10 | vat | 26.53 s | 4.00 s | Service charge and VAT? Shared out fairly, down to the paisa. |
| 11 | modes | 30.53 s | 3.60 s | Or split it equally, by shares, or by percentage. |
| 12 | live | 34.13 s | 3.70 s | Everyone sees it live, and debts simplify to the fewest payments. |
| 13 | settle | 37.83 s | 3.70 s | Settle up with eSewa, Khalti or Fonepay, in a tap. |
| 14 | friends | 41.53 s | 3.90 s | Add friends with one QR scan. In English, or in Nepali. |
| 15 | result | 45.43 s | 4.57 s | No chasing. No awkward texts. Just friends, square again. |
| 16 | cta | 50.00 s | 9.67 s | Eat together. Split fairly. Stay friends. Split-Up is free, at splitup dot thimitech dot com. |

**Total:** 59.67 s (1790 frames at 30 fps).

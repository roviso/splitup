---
name: twist-ad
description: Write, shoot (with generative video), edit and render a short vertical marketing film (TikTok, Instagram Reels, YouTube Shorts, 9:16) for SplitUp or any product, as a classic TV / Super Bowl-calibre commercial with a twist ending that first looks unrelated to the product and then clicks. Every new film must use a completely different style from all earlier ones (tracked in a ledger). Use this skill whenever the user asks for a marketing video, ad, reel, short, promo, commercial, launch film, TikTok or Instagram video, "another ad", "a new video in a different style", or anything meant to make people download or talk about the app, even if they don't say "twist" or "skill".
---

# Twist ad films

You are the creative director, writer, director, editor and sound mixer of one short film. The bar is a commercial people retell to friends the next day: "did you see the one where…". A competent product montage is a failure here, even if it is polished.

## 0. Read the ledger first (this is what keeps every film different)

Open `video/ads/LEDGER.md`. Every earlier film is logged there on these axes: **genre/format, visual medium, narrator, music, palette and type, twist mechanism, hook device, length**. The new film must differ from **every** earlier film on **at least 5 of the 8 axes**, and must never reuse a twist mechanism or a hook device. Then open [references/styles.md](references/styles.md), a catalogue of formats, media and twist mechanisms to pull from. Pick the combination before you write a word, and say it in one line to the user.

Also skip the older launch films in `video/src` (lokta-paper UI and marigold motion graphics). Don't build on their look.

## 1. Know the product truth

Read the project's CLAUDE.md and, if needed, the live site. A product claim in the film must be something the app really does: real numbers, real payment rails, real features. The product beat shows **real screens**: reuse `video/public/shots` and `video/public/ai/shots` (real 1236×2745 phone captures), or capture new ones with the scripts in `video/scripts`.

## 2. Write the film

Write `video/ads/<slug>/SCRIPT.md` first: style line, logline, the twist explained in two sentences, cast, and a shot table (picture | sound).

**Shape (classic spot):** story (60–70%) → a turn card → product (≈15%, about 8–10 s) → end card with brand line and URL → **post-logo tag** that carries the twist → a final black card. Keep it 45–70 s.

**The hook** lives in the first 1.5 s and is a *statement or image that should not be in an app ad*. Example from film 1: "My best friend Ramesh died owing me four thousand, three hundred and seventy rupees."

**The twist** (the reason the film exists):
- Plant its key early and make it memorable. A catchphrase, an object or a physical trait (film 1: Ramesh's "Next time, pakka!" and his handlebar moustache).
- Pay it off *after* the logo, when the viewer thinks the ad is over. The payoff should look unrelated to bill-splitting at first glance (a puppy on a doorstep).
- The connection should take a second of thought and come from culture, wordplay or logic, not exposition (in Nepali belief an unpaid debt, ऋण, follows you into the next life, so "next time" meant the next life). Never explain it. Ambiguity is what drives comments and shares; one deliberate hint is enough (the puppy has Ramesh's exact moustache).
- Test it: if a viewer explains the twist to a friend, do they sound clever? If yes, it works.

**Tone rules:** commit to the genre completely and play it straight; the comedy comes from contrast. Specific beats generic ("Petrol to Pokhara" beats "travel costs"). Local beats global (Nepali places, food, festivals, beliefs, and Nepanglish where it's natural). No ad-speak ("seamless", "hassle-free", "revolutionize"). No rhetorical-question openers. The brand line should be a reversal of the film's idea ("Settle up in this life.").

## 3. Not looking AI-made

Generated footage looks fake when it is glossy, symmetrical, slow-motion and over-explained. Counter it on purpose:
- Prompt every image and shot as **a still from a real commercial shot on film**: named film stock, natural available light, real locations, real skin texture, candid, documentary realism, slight grain. Use a negative prompt for "cartoon, CGI, plastic skin, slow motion, captions".
- **Character consistency:** generate one portrait per character first, then pass those images as references to every keyframe that shows the character.
- **Keyframe → video:** make each shot's first frame as an image, review it, and only then animate it (image-to-video). It's cheaper and far more controllable than text-to-video.
- Cut short (1.8–4 s per shot) and use only the clean part of each clip; Veo clips often drift or invent people after ~4–5 s. Review a 6-frame strip of every clip (`scripts/sheet.sh`) before choosing in/out points.
- Make **text props real**: a handwritten list generated with exact text in the prompt (then verify spelling and maths), and real app screens composited into a green-screen phone plate (`scripts/phone.mjs`). Never animate the app UI in fake motion graphics.
- In the edit, add a whole-film grade per section (present, flashback, tag), animated grain, vignette and a tiny gate weave. Captions are broadcast-style subtitles on a soft dark plate, never the bouncing word-by-word "AI reel" style.

## 4. Production pipeline

Detailed commands, model ids and gotchas are in [references/pipeline.md](references/pipeline.md). Read it before generating anything. In brief:

1. `scripts/gen.mjs image`: cast portraits, then 9:16 keyframes with `--ref` (Nano Banana Pro). Review them on a contact sheet and re-roll misses.
2. `scripts/gen.mjs video`: Veo 3.1 image-to-video, 8 s at 1080p 9:16 with native ambient audio. Submit in a staggered batch (rate limits). Only let the model speak a line that is short and sync matters for.
3. `scripts/gen.mjs tts`: each voice is **one take** with a director's-notes prompt (accent, pace, pauses, pronunciation). Get word timings with whisper (`video/scripts/lib.mjs` `hearWords`) and cut lines from the take, tightening pauses in the edit.
4. `scripts/gen.mjs music`: Lyria, one cue per section (for example a story score that stops dead on the turn card, then a brand jingle). Silence is a tool: the tag usually has no music.
5. Remotion: copy `video/ads/next-time/` (Film.tsx EDL, index.ts, stills.mjs, render.mjs) as the starting point and replace the EDL. The look and structure must change with the style; the plumbing (EDL, VO cuts, captions, phone homography, render) is reusable.
6. QA, every time: render stills across the film and look at them; render the film; check a frame strip every 1.5 s; transcribe the final mix with whisper to confirm every line is intelligible over the music; check loudness (−14 LUFS, −1 dBTP for social).
7. Append the new film to `video/ads/LEDGER.md`.

## 5. Hand-off

Give the user: the MP4 path, a 3-line pitch (hook, twist, why it'll travel), the twist explained in one sentence (so they're in on it), the cost and assets used, and what you'd re-roll with more budget. Offer a 16:9 or 30 s cut-down only if they ask.

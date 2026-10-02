# Production pipeline: commands, models, gotchas

All paths are relative to `video/` (the Remotion project; `npm install --no-workspaces` there once). Keys live in the repo root `.env`: `GOOGLE_API_KEY` (Gemini, Veo, Lyria, TTS) and `OPENAI_API_KEY` (gpt-image-2, sora-2, if wanted). Higgsfield is also connected but had too few credits for film 1; check `balance` before relying on it.

`G=../.claude/skills/twist-ad/scripts/gen.mjs`, and every output also writes `<out>.json` with the exact prompt, so any shot can be re-rolled.

## Images (cast and keyframes)
```bash
node $G image public/ads/<slug>/cast/hero.png "<portrait prompt>" --ar 3:4
node $G image public/ads/<slug>/key/03-shot.png "<shot prompt>" --ref public/ads/<slug>/cast/hero.png --ref ... --ar 9:16
```
- Model `gemini-3-pro-image` (Nano Banana Pro), 2K. It renders exact handwritten text well; always verify the spelling and maths.
- When a trait carries the twist, pass the source character as `--ref` and describe the trait "exactly like the reference" (film 1: the puppy's moustache only worked once Ramesh's portrait was the reference).
- Wardrobe tells time apart: change the clothes for flashbacks and present day, or viewers lose the timeline.
- Contact sheet: `ffmpeg ... -filter_complex "[0]scale=432:768[s0];...xstack"` and view one image instead of eight.

## Video (Veo 3.1 image-to-video)
```bash
node $G video public/ads/<slug>/clips/03.mp4 "<motion + audio prompt>" --image key/03.png --dur 8 --res 1080p --neg "music, subtitles, ..."
```
- `veo-3.1-generate-preview`, 9:16, 8 s, 1080p, native audio. Roughly 1–3 min per clip.
- **Rate limit:** about 3 concurrent submits, then 429. `gen.mjs` retries 429s for ~20 min; stagger submissions by ~20 s (see `video/ads/next-time/shots.sh`, a reusable batch script with one prompt per shot).
- Write the prompt as motion plus an `Audio:` line (ambience, Foley). Say "No speech, no music" unless a character must talk. A line of dialogue works if it is short. Find it afterwards with whisper and silencedetect, since the timing is not where you asked for it.
- Clips drift after ~4–5 s (faces change, strangers walk in, waiters wipe the frame). Choose in/out points from a frame strip: `../.claude/skills/twist-ad/scripts/sheet.sh clip.mp4 out.jpg`.
- `sora-2` / `sora-2-pro` on the OpenAI key are an alternative look (useful when a style needs it).

## Voice (Gemini TTS)
```bash
node $G tts public/ads/<slug>/audio/narrator.wav "# AUDIO PROFILE ... ## DIRECTOR'S NOTES ... ## TRANSCRIPT ..." --voice Enceladus
```
- `gemini-3.8-flash-tts`. One take per voice, so the performance is consistent. Used so far: Enceladus (deadpan eulogist, light Nepali accent), Gacrux (classic baritone announcer). Others: Charon, Iapetus, Algenib, Orus, Puck, Kore, Sulafat (already the narrator of the older launch films, so avoid it).
- Spell out pronunciations in the notes (eSewa = "ee-seh-wah", Khalti = "khal-tee", paisa = "pie-sah", momo = "moh-moh").
- Word timings: `node video/ads/next-time/words.mjs <name>` (whisper.cpp medium.en with DTW, already installed in `video/whisper.cpp`). Cut lines as `[file, takeStart, takeEnd, filmTime, caption]` and tighten pauses in the edit, keeping the deliberate comedic ones.

## Music (Lyria)
```bash
node $G music public/ads/<slug>/audio/score.mp3 "<brief with timed sections, instruments, BPM, 'no vocals'>"
```
- `lyria-3.5` returns ~60 s. Write separate cues per section rather than one long piece; cut them in the EDL with `from`, `dur` and `fadeOut`.

## Real app in a real hand (green-screen phone plate)
1. Generate a keyframe of a hand holding a phone whose screen is "a perfectly flat, uniform pure chroma-key green, edge to edge", straight and centred.
2. `node ../.claude/skills/twist-ad/scripts/phone.mjs public/ads/<slug>/key/08-phone.png public/ads/<slug>`. This writes `phone.json` (four screen corners, from line fits that ignore rounded corners) and `phone-keyed.png` (the screen keyed out).
3. In Remotion, warp the screenshot onto the corners with a CSS `matrix3d` homography (see `Phone` in `video/ads/next-time/Film.tsx`) **under** the keyed plate, so thumbs and the bezel sit in front. Keep it a still with a slow push. A moving plate would need tracking.

## Edit (Remotion)
- Start from `video/ads/next-time/` (`Film.tsx` EDL plus components, `index.ts`, `stills.mjs`, `render.mjs`). Media goes in `video/public/ads/<slug>/` and is referenced with `staticFile('ads/<slug>/...')`. Bundle with `publicDir: video/public`. Port 3791 (3000 is the SplitUp dev server).
- Load only the font weights you use (`loadFont('normal', { weights: ['400'], subsets: ['latin'] })`), or the render makes 70+ font requests.
- Captions: dark translucent plate behind text (white captions disappear on white clothes and white app screens). Keep them inside y 300–1380 (the platform UI covers the bottom ~540 px and the right edge). Chunk long lines to word timings. Caption sync dialogue too: muted viewers need the line the twist depends on.
- Review stills: `node ads/next-time/stills.mjs 2 5.5 11 ...` (seconds) → a sheet.
- Render: `node ads/next-time/render.mjs` → loudnorm to −14 LUFS / −1 dBTP.

## QA checklist
- [ ] 6-frame strip of every clip reviewed; in/out points avoid drift
- [ ] Frame every 1.5 s of the final film reviewed on one sheet
- [ ] Whisper transcript of the final mix has every VO line (transcribe the product/jingle section separately; whisper skips music-heavy stretches)
- [ ] Every product claim is true; every number on screen adds up
- [ ] The twist's key (catchphrase or trait) is visible or captioned early, and the payoff is on screen after the logo
- [ ] Ledger updated

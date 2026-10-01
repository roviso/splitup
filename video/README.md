# Split-Up launch video

A roughly 60 s launch film (1920×1080, 30 fps) built in Remotion. The script and research are in [SCRIPT.md](SCRIPT.md).

```bash
cd video
npm install --no-workspaces          # standalone, not part of the monorepo workspaces
node scripts/setup-whisper.mjs       # one-off: whisper.cpp 1.7.6 (DTW word timings) + medium.en model (~1.5 GB)

SPLITUP_EMAIL=... SPLITUP_PASSWORD=... node scripts/screenshots.mjs   # real screens -> public/shots (never saves anything)
node scripts/voice.mjs [Sulafat]     # the whole script as ONE Gemini TTS take -> out/voice-raw.wav
node scripts/align.mjs               # words, cuts, leveled lines, gaps < 0.1 s -> public/voice.wav + src/timeline.json
node scripts/check-voice.mjs         # PASS/FAIL: every word inside its shot, max gap between lines
node scripts/music.mjs               # original Lyria bed -> out/music-raw.mp3
node scripts/mix.mjs                 # ducked music + SFX, mastered to -16 LUFS -> public/master.wav
node scripts/stills.mjs              # a still of every shot + each transition -> out/stills (check these)
node scripts/render.mjs              # -> out/splitup-launch.mp4 (16:9) and out/splitup-launch-9x16.mp4
npx remotion studio                  # live preview
```

The launch film has two cuts made from one timeline and one master. `Launch` is 16:9. `Launch-Vertical` is 9:16 for TikTok, Reels and Shorts. The scenes read `useLayout()` and restack for 9:16: text on top, a bigger phone, and magnifier cards kept inside y 200–1600 and left of x ~950, clear of the platform header, caption and button rail. To render or review one cut, use `node scripts/render.mjs Launch-Vertical` or `COMP=Launch-Vertical node scripts/stills.mjs`.

**One source of truth.** The lines are in `src/lines.json`. Every shot's length comes from its voice line through `src/timeline.json`, and `src/cues.js` gives the video and the mix the same click and whoosh frames. To change the script, edit `lines.json` and re-run `voice`, `align`, `check-voice`, `mix` and `render`.

**Film 2: Smart Split (the AI feature).** Script and research are in [SCRIPT-AI.md](SCRIPT-AI.md). The same scripts run it with `FILM=ai`, using `src/ai`, `public/ai` and `out/ai`. It renders two cuts, `AI-Landscape` (16:9) and `AI-Vertical` (9:16), from one timeline and one master.

```bash
SPLITUP_EMAIL=... SPLITUP_PASSWORD=... node scripts/screenshots-ai.mjs   # real 412px phone screens + UI boxes (spends 2 AI credits, saves nothing)
FILM=ai node scripts/voice.mjs && FILM=ai node scripts/align.mjs && FILM=ai node scripts/check-voice.mjs
FILM=ai node scripts/music.mjs && FILM=ai node scripts/mix.mjs
FILM=ai node scripts/stills.mjs          # COMP=AI-Vertical to do one cut only
FILM=ai node scripts/render.mjs          # -> out/ai/splitup-smart-split-16x9.mp4 and -9x16.mp4
```

**Port.** Remotion renders on port 3791 because 3000 is taken by the Split-Up dev server.

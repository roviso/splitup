// One take -> timestamped lines -> leveled clips -> gapless voice track + frame timeline.
// Usage: node scripts/align.mjs   (needs out/voice-raw.wav from voice.mjs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { norm, dur, silences, hearWords, align, P } from './lib.mjs';

const FPS = 30;
const TEMPO = 1.0;       // pitch-preserving speed knob for the whole take (1.0 = as performed)
const VOICE_LUFS = -18;  // every line leveled to the same loudness (final master goes to -16 LUFS)
const KEEP_IN = 0.015, KEEP_OUT = 0.03, GAP = 0; // dead air between lines stays under 0.1 s (checked by check-voice.mjs)
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const loud = (f) => +spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' })
  .stderr.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)[1];

const lines = JSON.parse(readFileSync(`${P.src}/lines.json`, 'utf8'));
const clean = (t) => t.replace(/\[[a-z]+\]\s*/g, '');

// 1. The take, sped up, and the words heard in it.
mkdirSync(`${P.out}/clips`, { recursive: true });
ff('-i', `${P.out}/voice-raw.wav`, '-af', `atempo=${TEMPO}`, '-ar', '48000', `${P.out}/voice-take.wav`);
const heard = await hearWords(`${P.out}/voice-take.wav`);
writeFileSync(`${P.out}/heard.json`, JSON.stringify(heard, null, 1));

// 2. Align script words to heard words, so "1,700" vs "seventeen hundred" can't derail it.
const script = align(lines.flatMap((l, li) => clean(l.text).split(/\s+/).map((raw) => ({ raw, w: norm(raw), li }))).filter((x) => x.w), heard);
console.log(`aligned ${script.filter((x) => x.exact).length}/${script.length} script words exactly (${heard.length} heard)`);

// 3. Cut points: the real pause after line i's last word and before line i+1's first word.
//    Breaths inside that pause are dropped with it.
const TAKE = dur(`${P.out}/voice-take.wav`);
const sil = silences(`${P.out}/voice-take.wav`);
const wordsOf = (li) => script.filter((x) => x.li === li && x.h);
lines.forEach((l, li) => { if (!wordsOf(li).length) throw new Error(`line ${l.id} not found in the take`); });
const cuts = lines.map(() => ({}));
cuts[0].s = Math.max(0, (sil.filter((p) => p.e <= wordsOf(0)[0].h.e).at(-1)?.e ?? 0) - KEEP_IN);
const lastEnd = wordsOf(lines.length - 1).at(-1).h.e;
cuts.at(-1).e = Math.min(TAKE, (sil.find((p) => p.s >= lastEnd - 0.12)?.s ?? TAKE) + KEEP_OUT);
for (let i = 0; i < lines.length - 1; i++) {
  const end = wordsOf(i).at(-1).h.e, nextEnd = wordsOf(i + 1)[0].h.e;
  // A pause that spans the word end counts too: whisper can place the end a few ms inside the silence.
  const pause = sil.filter((p) => p.e > end && p.s >= end - 0.3 && p.e <= nextEnd - 0.05 && p.e - p.s >= 0.08);
  if (!pause.length) throw new Error(`no pause between ${lines[i].id} and ${lines[i + 1].id}`);
  cuts[i].e = pause[0].s + KEEP_OUT;
  cuts[i + 1].s = pause.at(-1).e - KEEP_IN;
}

// 4. Cut each line and level it to the same loudness.
let t = 0;
const shots = [], inputs = [], delays = [];
lines.forEach((l, i) => {
  const base = `${P.out}/clips/${String(i).padStart(2, '0')}-${l.id}`;
  ff('-i', `${P.out}/voice-take.wav`, '-ss', cuts[i].s.toFixed(3), '-to', cuts[i].e.toFixed(3), '-af', 'afade=t=in:d=0.01,areverse,afade=t=in:d=0.02,areverse', '-ar', '48000', `${base}-raw.wav`);
  const gain = VOICE_LUFS - loud(`${base}-raw.wav`);
  ff('-i', `${base}-raw.wav`, '-af', `volume=${gain.toFixed(2)}dB`, '-ar', '48000', `${base}-lev.wav`);
  // Shave leftover edge silence (measured after leveling, which is what the listener hears).
  const d0 = dur(`${base}-lev.wav`), es = silences(`${base}-lev.wav`, 0.02);
  const lead = es[0]?.s <= 0.03 ? // a leading blip under 30 ms (breath tail) counts as silence
     Math.max(0, es[0].e - KEEP_IN) : 0;
  const end = es.at(-1)?.e >= d0 - 0.005 && es.at(-1).s > lead ? es.at(-1).s + KEEP_OUT : d0;
  ff('-i', `${base}-lev.wav`, '-ss', lead.toFixed(3), '-to', Math.min(d0, end).toFixed(3), `${base}.wav`);
  cuts[i].s += lead;
  const d = dur(`${base}.wav`);
  const words = script.filter((x) => x.li === i).map((x) => ({ text: x.raw, s: x.h?.s, e: x.h?.e }));
  words.forEach((w, k) => { // unaligned word: borrow the gap between its neighbours
    if (w.s != null) return;
    const q = words.slice(k + 1).find((z) => z.s != null);
    w.s = words[k - 1]?.e ?? cuts[i].s; w.e = q?.s ?? cuts[i].e;
  });
  const at = (x) => +Math.min(t + d, Math.max(t, t + x - cuts[i].s)).toFixed(3);
  shots.push({
    id: l.id, text: clean(l.text), tag: l.tag ?? null, start: +t.toFixed(3), duration: +(d + GAP).toFixed(3), gainDb: +gain.toFixed(2),
    words: words.map((w) => ({ text: w.text, start: at(w.s), end: at(w.e) })),
  });
  inputs.push('-i', `${base}.wav`);
  delays.push(Math.round(t * 1000));
  t += d + GAP;
});

// 5. Lay the clips on the timeline.
const filter = delays.map((ms, i) => `[${i}]adelay=${ms}|${ms}[a${i}]`).join(';') + ';' + delays.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${delays.length}:normalize=0,apad=pad_dur=0.5[v]`;
mkdirSync(P.pub, { recursive: true });
ff(...inputs, '-filter_complex', filter, '-map', '[v]', '-ac', '2', '-ar', '48000', `${P.pub}/voice.wav`);

// Frame-snapped shot boundaries for Remotion.
shots.forEach((x) => { x.from = Math.round(x.start * FPS); });
shots.forEach((x, i) => { x.frames = (shots[i + 1]?.from ?? Math.round(t * FPS)) - x.from; });
const tail = Math.round(2.5 * FPS); // hold the end card after the last word
shots.at(-1).frames += tail;
const totalFrames = shots.at(-1).from + shots.at(-1).frames;
writeFileSync(`${P.src}/timeline.json`, JSON.stringify({ fps: FPS, totalFrames, voiceSeconds: +t.toFixed(3), shots }, null, 1));
console.log(`voice ${t.toFixed(2)} s, ${shots.length} lines, video ${(totalFrames / FPS).toFixed(2)} s`);
for (const s of shots) console.log(`${String(s.from).padStart(5)}f ${String(s.frames).padStart(4)}f  ${s.gainDb >= 0 ? '+' : ''}${s.gainDb}dB  ${s.id}: ${s.text}`);

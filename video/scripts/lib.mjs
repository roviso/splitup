// Shared by align.mjs and check-voice.mjs: word timings (whisper.cpp DTW) and script alignment.
import { transcribe } from '@remotion/install-whisper-cpp';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

/** Which film the pipeline works on: FILM=ai uses src/ai, out/ai and public/ai; default is the launch film. */
export const FILM = process.env.FILM ?? 'launch';
const sub = FILM === 'launch' ? '' : `/${FILM}`;
export const P = { src: `src${sub}`, out: `out${sub}`, pub: `public${sub}`, staticDir: FILM === 'launch' ? '' : `${FILM}/` };

export const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
export const dur = (f) => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' });

/** Silences (merged across < 30 ms clicks) as [{s, e}] in seconds. */
export function silences(file, minDur = 0.03, noise = '-45dB') {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', `silencedetect=noise=${noise}:d=${minDur}`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const total = dur(file);
  const S = [...r.matchAll(/silence_start: (-?[\d.]+)/g)].map((x) => Math.max(0, +x[1]));
  const E = [...r.matchAll(/silence_end: ([\d.]+)/g)].map((x) => +x[1]);
  const out = [];
  S.forEach((st, k) => { const e = E[k] ?? total; if (out.length && st - out.at(-1).e < 0.03) out.at(-1).e = e; else out.push({ s: st, e }); });
  return out;
}

/**
 * Words heard in a wav, with timings. whisper.cpp's DTW time (t_dtw) lands on a token's END
 * (checked against detected pauses to within ~50 ms); a word starts where the previous one
 * ended, or where a pause in between ends.
 */
export async function hearWords(wav) {
  const w16 = wav.replace(/\.wav$/, '-16k.wav');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ar', '16000', '-ac', '1', w16]);
  const { transcription } = await transcribe({
    inputPath: path.resolve(w16), whisperPath: path.resolve('whisper17'), whisperCppVersion: '1.7.6',
    model: 'medium.en', modelFolder: path.resolve('whisper.cpp'), tokenLevelTimestamps: true, printOutput: false,
  });
  const words = [];
  for (const t of transcription.flatMap((s) => s.tokens)) {
    const w = norm(t.text);
    if (!w || t.t_dtw < 0 || /^\[/.test(t.text.trim())) continue;
    const end = t.t_dtw / 100;
    if (words.length && !/^\s/.test(t.text)) { words.at(-1).w += w; words.at(-1).e = end; }
    else words.push({ w, e: end });
  }
  const sil = silences(wav, 0.08);
  words.forEach((x, i) => {
    const prev = i ? words[i - 1].e : 0;
    const gap = sil.filter((p) => p.e > prev && p.e < x.e).at(-1);
    x.s = gap ? Math.max(prev, gap.e) : prev;
  });
  return words;
}

/** Edit-distance alignment; sets item.h = heard word (on match or substitution) and item.exact. */
export function align(script, heard) {
  const n = script.length, m = heard.length;
  const D = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    D[i][j] = Math.min(D[i - 1][j - 1] + (script[i - 1].w === heard[j - 1].w ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  for (let i = n, j = m; i > 0 && j > 0;) {
    const same = script[i - 1].w === heard[j - 1].w;
    if (D[i][j] === D[i - 1][j - 1] + (same ? 0 : 1)) { script[i - 1].h = heard[j - 1]; script[i - 1].exact = same; i--; j--; }
    else if (D[i][j] === D[i - 1][j] + 1) i--;
    else j--;
  }
  return script;
}

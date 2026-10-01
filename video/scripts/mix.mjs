// Master mix: leveled voice + music ducked under it + synthesized UI SFX on the video's cue frames,
// mastered to -16 LUFS integrated (two-pass loudnorm). Usage: node scripts/mix.mjs -> public/master.wav
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { P } from './lib.mjs';
const { getCues } = await import(`../${P.src}/cues.js`);

const TARGET = { I: -16, TP: -1.5, LRA: 11 };
const MUSIC_BED_LUFS = -22; // music level before ducking (voice lines sit at -18)
const tl = JSON.parse(readFileSync(`${P.src}/timeline.json`, 'utf8'));
const DUR = tl.totalFrames / tl.fps;
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
const stats = (file, af = 'ebur128=peak=true') => spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const lufs = (file) => +stats(file).match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)[1];

// Synthesized SFX (no stock audio).
mkdirSync('out/sfx', { recursive: true });
const SFX = {
  click: { expr: '0.9*sin(2*PI*2400*t)*exp(-t*140)+0.5*sin(2*PI*1200*t)*exp(-t*80)', d: 0.12, gain: -13 },
  pop: { expr: '0.8*sin(2*PI*(520+1400*t)*t)*exp(-t*22)', d: 0.3, gain: -14 },
  thump: { expr: '0.9*sin(2*PI*(120-80*t)*t)*exp(-t*13)', d: 0.4, gain: -10 },
  whoosh: { d: 0.45, gain: -21 },
  tap: { expr: '0.7*sin(2*PI*1800*t)*exp(-t*220)+0.4*sin(2*PI*700*t)*exp(-t*120)', d: 0.08, gain: -17 },
  shutter: { d: 0.16, gain: -12 },
};
for (const [name, s] of Object.entries(SFX)) {
  const out = `out/sfx/${name}.wav`;
  if (name === 'whoosh') ff('-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=${s.d}:seed=7`, '-af', 'highpass=f=500,lowpass=f=6000,afade=t=in:d=0.28:curve=exp,afade=t=out:st=0.28:d=0.17', '-ar', '48000', '-ac', '2', out);
  else if (name === 'shutter') ff('-f', 'lavfi', '-i', `anoisesrc=color=white:duration=${s.d}:seed=3`, '-af', 'highpass=f=1500,volume=0.8,afade=t=out:st=0.02:d=0.03:curve=exp,apad=pad_dur=0.04,aecho=0.6:0.3:55:0.35,atrim=0:0.16', '-ar', '48000', '-ac', '2', out);
  else ff('-f', 'lavfi', '-i', `aevalsrc=${s.expr}:s=48000:d=${s.d}`, '-af', 'afade=t=out:st=' + (s.d - 0.02) + ':d=0.02', '-ac', '2', out);
}

// Music: fit to the video, fade out, set bed level.
const musicSrc = existsSync(`${P.out}/music-raw.mp3`) ? `${P.out}/music-raw.mp3` : `${P.out}/music-raw.wav`;
// A bed that ends a little early is stretched (pitch kept) so its own ending lands on the last frame.
const mDur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', musicSrc], { encoding: 'utf8' });
const stretch = mDur < DUR && mDur / DUR > 0.95 ? `atempo=${(mDur / DUR).toFixed(4)},` : '';
ff('-i', musicSrc, '-t', DUR.toFixed(3), '-af', `${stretch}afade=t=in:d=0.4,afade=t=out:st=${(DUR - 2.2).toFixed(3)}:d=2.2`, '-ar', '48000', '-ac', '2', `${P.out}/music-fit.wav`);
const musicGain = MUSIC_BED_LUFS - lufs(`${P.out}/music-fit.wav`);

const { sfx } = getCues(tl);
const inputs = ['-i', `${P.pub}/voice.wav`, '-i', `${P.out}/music-fit.wav`];
const parts = [
  `[0]aresample=48000,apad,atrim=0:${DUR.toFixed(3)},asplit=2[voice][key]`,
  `[1]volume=${musicGain.toFixed(2)}dB[bed]`,
  // Duck the music under the voice (~9 dB), release slowly so it breathes back between lines.
  `[bed][key]sidechaincompress=threshold=0.015:ratio=9:attack=20:release=450:knee=4[music]`,
];
const labels = ['[voice]', '[music]'];
sfx.forEach((c, i) => {
  inputs.push('-i', `out/sfx/${c.type}.wav`);
  const ms = Math.max(0, Math.round((c.frame / tl.fps) * 1000));
  parts.push(`[${i + 2}]volume=${SFX[c.type].gain}dB,adelay=${ms}|${ms}[s${i}]`);
  labels.push(`[s${i}]`);
});
parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first[mix]`);
ff(...inputs, '-filter_complex', parts.join(';'), '-map', '[mix]', '-ar', '48000', '-ac', '2', `${P.out}/mix-pre.wav`);

// Two-pass loudnorm to -16 LUFS.
const m = JSON.parse(stats(`${P.out}/mix-pre.wav`, `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`).match(/\{[\s\S]*\}/)[0]);
ff('-i', `${P.out}/mix-pre.wav`, '-af',
  `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
  '-ar', '48000', '-ac', '2', `${P.out}/mix-norm.wav`);
// Linear loudnorm can land a few tenths off; trim the remainder with plain gain (true peak has headroom).
ff('-i', `${P.out}/mix-norm.wav`, '-af', `volume=${(TARGET.I - lufs(`${P.out}/mix-norm.wav`)).toFixed(2)}dB`, '-ar', '48000', `${P.pub}/master.wav`);
const fin = stats(`${P.pub}/master.wav`);
console.log(`music bed gain ${musicGain.toFixed(1)} dB; master: I=${fin.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)[1]} LUFS, true peak ${fin.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]} dBTP`);

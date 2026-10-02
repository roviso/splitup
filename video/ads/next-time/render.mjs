// Full render: node ads/next-time/render.mjs -> out/ads/next-time/splitup-next-time-9x16.mp4 (−14 LUFS, −1 dBTP for social)
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const D = 'out/ads/next-time'; mkdirSync(D, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('ads/next-time/index.ts'), publicDir: path.resolve('public') });
const composition = await selectComposition({ serveUrl, id: 'NextTime', port: 3791 });
let last = -1;
await renderMedia({ serveUrl, composition, port: 3791, codec: 'h264', crf: 16, pixelFormat: 'yuv420p', outputLocation: `${D}/raw.mp4`,
  onProgress: ({ progress }) => { const p = Math.floor(progress * 10); if (p !== last) { last = p; console.log(`${p * 10}%`); } } });
const out = `${D}/splitup-next-time-9x16.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', `${D}/raw.mp4`, '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', out]);
const r = spawnSync('ffmpeg', ['-hide_banner', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
console.log(out, r.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)?.[1], 'LUFS, peak', r.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);

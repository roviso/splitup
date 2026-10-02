// Render review stills: node ads/next-time/stills.mjs 1 5.5 40 ... (seconds) -> out/ads/next-time/stills/*.jpg + sheet.jpg
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
const D = 'out/ads/next-time/stills'; mkdirSync(D, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('ads/next-time/index.ts'), publicDir: path.resolve('public') });
const composition = await selectComposition({ serveUrl, id: 'NextTime', port: 3791 });
const ts = process.argv.slice(2).map(Number), files = [];
for (const t of ts) { const o = `${D}/t${t}.jpg`; await renderStill({ serveUrl, composition, frame: Math.round(t * 30), output: o, imageFormat: 'jpeg', port: 3791 }); files.push(o); }
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f]), '-filter_complex', files.map((_, i) => `[${i}]scale=360:640[s${i}]`).join(';') + ';' + files.map((_, i) => `[s${i}]`).join('') + `hstack=${files.length}`, `${D}/sheet.jpg`]);
console.log(`${D}/sheet.jpg`);

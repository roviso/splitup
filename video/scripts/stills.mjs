// Render a still of every shot (late in the shot, when its words are on screen) plus each transition,
// so they can be checked before the final render. Usage: node scripts/stills.mjs [id | name=frame ...] -> out/stills/*.png
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { FILM, P } from './lib.mjs';
const film = await import(`../${P.src}/cues.js`);

const tl = JSON.parse(readFileSync(`${P.src}/timeline.json`, 'utf8'));
const cues = film.getCues(tl);
const only = process.argv.slice(2);
const frames = [
  ...tl.shots.map((s) => [s.id, s.from + Math.round(Math.min(s.frames - 4, Math.max(8, s.frames * 0.8)))]),
  ...(FILM !== 'launch' ? film.stillFrames(cues, tl) : [
  ['x-whip', tl.shots[1].from - 3],
  ['x-turn-flood', cues.turnClick + 7],
  ['x-reveal-flood', cues.revealClick + 7],
  ['x-product-first', cues.S.items.from],
  ['x-nepali', cues.friendsSwap + 20],
  ['x-cta-flood', cues.ctaClick + 7],
  ['x-end', tl.totalFrames - 1]]),
  ...only.filter((a) => a.includes('=')).map((a) => a.split('=')).map(([id, fr]) => [id, +fr]), // ad-hoc: name=frame
].filter(([id]) => !only.length || only.some((a) => a === id || a.startsWith(id + '=')));

const COMPS = film.compositions ?? ['Launch'];
const dir = `${P.out}/stills`;
mkdirSync(dir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const port = 3791; // 3000 is the Split-Up dev server
for (const comp of COMPS.filter((c) => !process.env.COMP || c === process.env.COMP)) {
  const composition = await selectComposition({ serveUrl, id: comp, inputProps: { previewAudio: false }, port });
  const tag = COMPS.length > 1 ? `${comp}-` : '';
  for (const [id, frame] of frames) {
    await renderStill({ serveUrl, composition, frame, output: `${dir}/${tag}${String(frame).padStart(4, '0')}-${id}.png`, inputProps: { previewAudio: false }, port });
    console.log('still', comp, frame, id);
  }
}

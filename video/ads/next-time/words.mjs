// Word timings for each VO take -> audio/<name>.words.json (whisper.cpp DTW via scripts/lib.mjs)
import { writeFileSync } from 'node:fs';
import { hearWords } from '../../scripts/lib.mjs';
for (const n of process.argv.slice(2)) {
  const w = await hearWords(`public/ads/next-time/audio/${n}.wav`);
  writeFileSync(`public/ads/next-time/audio/${n}.words.json`, JSON.stringify(w));
  console.log(n, w.map((x) => `${x.w}@${x.s.toFixed(2)}-${x.e.toFixed(2)}`).join(' '));
}

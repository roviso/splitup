// Verify the cut voice track: every script word is heard inside its own shot, and line gaps stay < 0.1 s.
// Usage: node scripts/check-voice.mjs   (exit code 1 on failure)
import { readFileSync } from 'node:fs';
import { norm, silences, hearWords, align, P } from './lib.mjs';

const tl = JSON.parse(readFileSync(`${P.src}/timeline.json`, 'utf8'));
const heard = await hearWords(`${P.pub}/voice.wav`);
const script = align(tl.shots.flatMap((sh, si) => sh.words.map((w) => ({ w: norm(w.text), si }))).filter((x) => x.w), heard);

let bad = 0;
for (const x of script.filter((x) => x.exact)) {
  const sh = tl.shots[x.si], end = sh.start + sh.duration;
  if (x.h.e < sh.start + 0.03 || x.h.e > end + 0.06) { bad++; console.log(`OUT OF SHOT: "${x.w}" ends ${x.h.e.toFixed(2)}, ${sh.id} is ${sh.start}-${end.toFixed(2)}`); }
}
const sil = silences(`${P.pub}/voice.wav`, 0.02);
let maxGap = 0;
for (const sh of tl.shots.slice(1)) {
  const p = sil.find((q) => q.s <= sh.start + 0.02 && q.e >= sh.start - 0.02);
  const g = p ? p.e - p.s : 0;
  maxGap = Math.max(maxGap, g);
  if (g >= 0.1) { bad++; console.log(`GAP ${g.toFixed(3)} s before ${sh.id}`); }
}
console.log(`${script.filter((x) => x.exact).length}/${script.length} words heard exactly; max line gap ${maxGap.toFixed(3)} s; ${bad ? 'FAIL' : 'PASS'}`);
process.exit(bad ? 1 : 0);

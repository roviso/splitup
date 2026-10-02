// Green-screen phone plate -> keyed PNG (alpha where the screen is) + the screen's 4 corners in plate pixels.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
// Usage: node phone.mjs <plate.png> <outDir>
const [IN, D] = process.argv.slice(2);
if (!IN || !D) { console.error('usage: phone.mjs <plate.png> <outDir>'); process.exit(1); }
const [W, H] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', IN], { encoding: 'utf8' }).trim().split(',').map(Number);
const px = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', IN, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
const green = (x, y) => { const i = (y * W + x) * 3, r = px[i], g = px[i + 1], b = px[i + 2]; return g > 100 && g > r * 1.6 && g > b * 1.6; };
// least-squares x = a*y + b over rows (or y = a*x + b over cols), using the middle 70% so rounded corners don't bend the fit
const fit = (pts) => { const n = pts.length, sx = pts.reduce((s, p) => s + p[0], 0), sy = pts.reduce((s, p) => s + p[1], 0), sxx = pts.reduce((s, p) => s + p[0] * p[0], 0), sxy = pts.reduce((s, p) => s + p[0] * p[1], 0); const a = (n * sxy - sx * sy) / (n * sxx - sx * sx); return [a, (sy - a * sx) / n]; };
const rows = [], cols = [];
for (let y = 0; y < H; y++) { let l = -1, r = -1; for (let x = 0; x < W; x++) if (green(x, y)) { if (l < 0) l = x; r = x; } if (r - l > W * 0.2) rows.push([y, l, r]); }
const y0 = rows[0][0], y1 = rows.at(-1)[0], mid = (a, b) => (p) => p[0] > a + (b - a) * 0.15 && p[0] < b - (b - a) * 0.15;
const R = rows.filter(mid(y0, y1));
const left = fit(R.map((p) => [p[0], p[1]])), right = fit(R.map((p) => [p[0], p[2]]));
for (let x = 0; x < W; x++) { let t = -1, b = -1; for (let y = 0; y < H; y++) if (green(x, y)) { if (t < 0) t = y; b = y; } if (b - t > H * 0.2) cols.push([x, t, b]); }
const C = cols.filter(mid(cols[0][0], cols.at(-1)[0]));
const top = fit(C.map((p) => [p[0], p[1]])), bot = fit(C.map((p) => [p[0], p[2]]));
// intersect x = a*y + b (vertical edge) with y = c*x + d (horizontal edge)
const meet = ([a, b], [c, d]) => { const y = (c * b + d) / (1 - c * a); return [a * y + b, y]; };
const corners = { tl: meet(left, top), tr: meet(right, top), br: meet(right, bot), bl: meet(left, bot) };
writeFileSync(`${D}/phone.json`, JSON.stringify({ W, H, corners }, null, 1));
// key: alpha = 0 where green (with despill so the bezel edge doesn't glow)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', IN, '-vf', 'format=rgba,chromakey=0x22aa44:0.18:0.06,despill=type=green', `${D}/phone-keyed.png`]);
console.log(W, H, corners);

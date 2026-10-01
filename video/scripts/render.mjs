// Final render: video frames from Remotion (muted), then the -16 LUFS master muxed in untouched.
// Usage: node scripts/render.mjs -> out/splitup-launch.mp4   |   FILM=ai node scripts/render.mjs [comp] -> out/ai/*.mp4
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { P } from './lib.mjs';

const film = await import(`../${P.src}/cues.js`);
const OUTPUTS = film.outputs ?? { Launch: 'splitup-launch' }; // composition id -> file name
const port = 3791; // 3000 is the Split-Up dev server
const inputProps = { previewAudio: false };
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
for (const [id, name] of Object.entries(OUTPUTS).filter(([id]) => !process.argv[2] || id === process.argv[2])) {
  const composition = await selectComposition({ serveUrl, id, inputProps, port });
  const video = `${P.out}/${name}-video.mp4`, final = `${P.out}/${name}.mp4`;
  let last = -1;
  await renderMedia({
    serveUrl, composition, inputProps, port, codec: 'h264', crf: 16, pixelFormat: 'yuv420p', muted: true, outputLocation: video,
    onProgress: ({ progress }) => { const p = Math.floor(progress * 20); if (p !== last) { last = p; console.log(`${id} ${p * 5}%`); } },
  });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', `${P.pub}/master.wav`, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final]);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', final, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final], { encoding: 'utf8' }).trim();
  console.log(`${final}: ${(+dur).toFixed(2)} s, ${r.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/)[1]} LUFS, true peak ${r.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]} dBTP`);
}

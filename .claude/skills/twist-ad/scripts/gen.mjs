#!/usr/bin/env node
// One CLI for every generated asset of an ad film (Google AI Studio key: GOOGLE_API_KEY in env or any parent .env).
//
//   node gen.mjs image <out.png> "<prompt>" [--ref a.png ...] [--ar 9:16] [--size 2K] [--model gemini-3-pro-image]
//   node gen.mjs video <out.mp4> "<prompt>" [--image first.png] [--last last.png] [--dur 8] [--ar 9:16] [--res 1080p] [--model veo-3.1-generate-preview] [--neg "..."]
//   node gen.mjs tts   <out.wav> "<director prompt + transcript>" [--voice Charon] [--model gemini-3.8-flash-tts]
//   node gen.mjs music <out.mp3> "<music brief>" [--model lyria-3.5]
//
// Writes <out>.json next to every output with the exact prompt and settings, so any shot can be re-rolled.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const [kind, out, prompt, ...rest] = process.argv.slice(2);
if (!kind || !out || !prompt) { console.error('usage: gen.mjs image|video|tts|music <out> "<prompt>" [flags]'); process.exit(1); }
const flags = {}; const refs = [];
for (let i = 0; i < rest.length; i += 2) rest[i] === '--ref' ? refs.push(rest[i + 1]) : (flags[rest[i].slice(2)] = rest[i + 1]);

function findKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  for (let d = process.cwd(); ; d = path.dirname(d)) {
    const f = path.join(d, '.env');
    const m = existsSync(f) && readFileSync(f, 'utf8').match(/^GOOGLE_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^"|"$/g, '');
    if (path.dirname(d) === d) throw new Error('GOOGLE_API_KEY not found');
  }
}
const key = findKey();
const H = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
const mime = (f) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[path.extname(f).toLowerCase()];
const b64 = (f) => readFileSync(f).toString('base64');
// Veo allows only a few requests per minute: on 429, back off and retry (up to ~20 min) instead of failing.
const post = async (url, body) => {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { method: 'POST', headers: H, body: JSON.stringify(body) });
    const j = await r.json();
    if (r.status === 429 && i < 40) { await new Promise((s) => setTimeout(s, 30000)); continue; }
    if (!r.ok || j.error) throw new Error(JSON.stringify(j).slice(0, 1500));
    return j;
  }
};
const inline = (j) => j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData
  ?? (() => { throw new Error('no media in response: ' + JSON.stringify(j).slice(0, 1500)); })();

mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
const meta = { kind, prompt, flags, refs, at: new Date().toISOString() };

if (kind === 'image') {
  const model = flags.model ?? 'gemini-3-pro-image';
  const parts = [...refs.map((f) => ({ inlineData: { mimeType: mime(f), data: b64(f) } })), { text: prompt }];
  const j = await post(`${API}/models/${model}:generateContent`, {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: flags.ar ?? '9:16', imageSize: flags.size ?? '2K' } },
  });
  writeFileSync(out, Buffer.from(inline(j).data, 'base64'));
} else if (kind === 'video') {
  const model = flags.model ?? 'veo-3.1-generate-preview';
  const inst = { prompt };
  if (flags.image) inst.image = { bytesBase64Encoded: b64(flags.image), mimeType: mime(flags.image) };
  if (flags.last) inst.lastFrame = { bytesBase64Encoded: b64(flags.last), mimeType: mime(flags.last) };
  const parameters = { aspectRatio: flags.ar ?? '9:16', durationSeconds: +(flags.dur ?? 8), resolution: flags.res ?? '1080p' };
  if (flags.neg) parameters.negativePrompt = flags.neg;
  let op = await post(`${API}/models/${model}:predictLongRunning`, { instances: [inst], parameters });
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10000));
    op = await (await fetch(`${API}/${op.name}`, { headers: H })).json();
  }
  if (op.error) throw new Error(JSON.stringify(op.error));
  const sample = op.response?.generateVideoResponse?.generatedSamples?.[0];
  if (!sample) throw new Error('no video (likely filtered): ' + JSON.stringify(op.response).slice(0, 1500));
  const r = await fetch(sample.video.uri, { headers: { 'x-goog-api-key': key }, redirect: 'follow' });
  writeFileSync(out, Buffer.from(await r.arrayBuffer()));
} else if (kind === 'tts') {
  const model = flags.model ?? 'gemini-3.8-flash-tts';
  const j = await post(`${API}/models/${model}:generateContent`, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: flags.voice ?? 'Charon' } } } },
  });
  const d = inline(j); const rate = d.mimeType.match(/rate=(\d+)/)?.[1] ?? '24000';
  writeFileSync(out + '.pcm', Buffer.from(d.data, 'base64'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', out + '.pcm', out]);
} else if (kind === 'music') {
  const model = flags.model ?? 'lyria-3.5';
  const j = await post(`${API}/models/${model}:generateContent`, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'] } });
  const d = inline(j);
  writeFileSync(out, Buffer.from(d.data, 'base64'));
  meta.mimeType = d.mimeType;
} else throw new Error('unknown kind ' + kind);

writeFileSync(out + '.json', JSON.stringify(meta, null, 2));
console.log(`${kind} -> ${out}`);

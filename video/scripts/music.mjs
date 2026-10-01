// Original music bed with Google Lyria (no stock audio). Usage: node scripts/music.mjs -> public/music.<ext>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { FILM, P } from './lib.mjs';

const key = readFileSync('../.env', 'utf8').match(/^GOOGLE_API_KEY=(.+)$/m)?.[1].trim().replace(/^"|"$/g, '');
const MODEL = process.env.MUSIC_MODEL ?? 'lyria-3.5';
const { voiceSeconds, totalFrames, fps, shots } = JSON.parse(readFileSync(`${P.src}/timeline.json`, 'utf8'));
const at = (id) => shots.find((s) => s.id === id).start.toFixed(0);

const prompt = FILM !== 'launch' ? (await import(`../${P.src}/film.js`)).musicPrompt(at, totalFrames / fps) : `Instrumental music bed for a 62-second modern SaaS product launch film. No vocals, no lyrics.
Warm, optimistic, premium; clean modern production with a subtle South Asian colour (soft madal hand-drum pattern and a gentle bansuri-like flute motif), felt piano and airy synth pads. Around 104 BPM.
Structure, timed to the voiceover:
- 0 to ${at('sad')} s: light and bouncy, hopeful pluck groove.
- ${at('sad')} to ${at('turn')} s: groove drops out, sparse and slightly melancholic, lots of space.
- ${at('turn')} s: a riser then a confident lift into the main theme at ${at('reveal')} s.
- ${at('reveal')} to ${at('result')} s: steady, calm, uplifting groove that sits under a narrator (leave the midrange clear).
- ${at('result')} s to the end: bigger, joyful final chorus, then a clean resolved ending at ${(totalFrames / fps).toFixed(0)} s.`;

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'] } }),
});
const json = await res.json();
const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) throw new Error(JSON.stringify(json).slice(0, 1200));
const ext = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' }[part.inlineData.mimeType.split(';')[0]] ?? 'bin';
mkdirSync(P.out, { recursive: true });
writeFileSync(`${P.out}/music-raw.${ext}`, Buffer.from(part.inlineData.data, 'base64'));
console.log(`music via ${MODEL}: ${part.inlineData.mimeType} -> ${P.out}/music-raw.${ext} (voice ${voiceSeconds}s)`);

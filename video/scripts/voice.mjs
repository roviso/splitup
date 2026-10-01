// Generate the whole voiceover as ONE take with Gemini TTS, so it never sounds like a different person.
// Usage: node scripts/voice.mjs [voiceName]   -> out/voice-raw.wav
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { FILM, P } from './lib.mjs';

const key = readFileSync('../.env', 'utf8').match(/^GOOGLE_API_KEY=(.+)$/m)?.[1].trim().replace(/^"|"$/g, '');
if (!key) throw new Error('GOOGLE_API_KEY missing in ../.env');
const MODEL = process.env.TTS_MODEL ?? 'gemini-3.8-flash-tts';
const VOICE = process.argv[2] ?? 'Sulafat';
const lines = JSON.parse(readFileSync(`${P.src}/lines.json`, 'utf8'));

const transcript = lines.map((l) => (l.tag ? `[${l.tag}] ` : '') + l.text).join('\n\n');
const prompt = FILM !== 'launch' ? (await import(`../${P.src}/film.js`)).voicePrompt(transcript) : `# AUDIO PROFILE
A warm, natural narrator in their late twenties, speaking straight to one friend. Conversational, never salesy.

## THE SCENE
A modern product launch film for Split-Up, a bill-splitting app for friends in Nepal.

## DIRECTOR'S NOTES
- The opening is the listener's own inner voice: bright and hopeful, then deflated. Honour the emotion tags in brackets; never read them aloud.
- "Let's be honest." is blunt and slower. The three problems land like a list, each one short and clear.
- "It's time to change." is quietly confident, with a short breath before it.
- The product section is calm, clear and friendly. The last line is warm and unhurried.
- Leave a short natural pause between paragraphs. Keep one consistent voice for the whole read.
- Pronounce "eSewa" as "ee-seh-wah", "Khalti" as "khal-tee", "paisa" as "pie-sah", "thimitech" as "thimmy-tech".

## TRANSCRIPT
${transcript}`;

const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } },
  }),
});
const json = await res.json();
const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
if (!part) throw new Error(JSON.stringify(json).slice(0, 800));

mkdirSync(P.out, { recursive: true });
const rate = part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] ?? '24000';
writeFileSync(`${P.out}/voice-raw.pcm`, Buffer.from(part.inlineData.data, 'base64'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', `${P.out}/voice-raw.pcm`, `${P.out}/voice-raw.wav`]);
console.log(`voice ${VOICE} via ${MODEL} -> ${P.out}/voice-raw.wav`);

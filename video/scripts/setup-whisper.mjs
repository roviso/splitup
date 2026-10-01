// One-off: whisper.cpp + medium.en model. 1.7.6 is the one used (DTW word timings); the model lives in whisper.cpp/.
import { installWhisperCpp, downloadWhisperModel } from '@remotion/install-whisper-cpp';
import { existsSync, mkdirSync, renameSync } from 'node:fs';

await downloadWhisperModel({ model: 'medium.en', folder: 'whisper.cpp' });
await installWhisperCpp({ to: 'whisper17', version: '1.7.6' }).catch((e) => { if (!existsSync('whisper17/Release')) throw e; });
// The Windows zip unpacks to Release/, but the helper looks in build/bin/.
if (existsSync('whisper17/Release')) { mkdirSync('whisper17/build', { recursive: true }); renameSync('whisper17/Release', 'whisper17/build/bin'); }
console.log('whisper ready');

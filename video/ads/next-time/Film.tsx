// NEXT TIME: a 9:16 SplitUp spot. Everything is driven by the edit list (EDL) below; times are in seconds.
import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { loadFont as loadGaramond } from '@remotion/google-fonts/EBGaramond';
import { loadFont as loadBricolage } from '@remotion/google-fonts/BricolageGrotesque';
import phone from '../../public/ads/next-time/phone.json';

const serif = loadGaramond('normal', { weights: ['400'], subsets: ['latin'] }).fontFamily;
loadGaramond('italic', { weights: ['400'], subsets: ['latin'] });
const brand = loadBricolage('normal', { weights: ['500', '800'], subsets: ['latin'] }).fontFamily;
export const FPS = 30;
const A = (p: string) => staticFile(`ads/next-time/${p}`);
const f = (s: number) => Math.round(s * FPS);

type Grade = 'present' | 'flash' | 'tag' | 'none';
type Shot =
  | { at: number; dur: number; clip: string; from: number; vol?: number; grade: Grade; push?: number }
  | { at: number; dur: number; still: string; grade: Grade; push?: number }
  | { at: number; dur: number; phone: { s: number; img: string; top?: boolean }[] }
  | { at: number; dur: number; card: 'black' | 'end'; text?: string; hand?: boolean };

// ── EDL ──────────────────────────────────────────────────────────────────────────
export const SHOTS: Shot[] = [
  { at: 0, dur: 4.7, clip: '01-altar', from: 0, vol: 0.5, grade: 'present' },
  { at: 4.7, dur: 2.7, clip: '03-suresh-mic', from: 0.2, vol: 0.4, grade: 'present' },
  { at: 7.4, dur: 2.9, clip: '02-hall', from: 0.3, vol: 0.5, grade: 'present' },
  { at: 10.3, dur: 3.9, clip: '01-altar', from: 2.5, vol: 0.4, grade: 'present' },
  { at: 14.2, dur: 2.8, clip: '03-suresh-mic', from: 5.2, vol: 0.4, grade: 'present' },
  { at: 17.0, dur: 4.4, clip: '04a-momo', from: 1.6, vol: 1, grade: 'flash' },
  { at: 21.4, dur: 1.8, clip: '04b-chiya', from: 0.0, vol: 0.6, grade: 'flash' },
  { at: 23.2, dur: 2.0, clip: '04c-petrol', from: 0.3, vol: 0.6, grade: 'flash' },
  { at: 25.2, dur: 2.2, clip: '04d-birthday', from: 0.0, vol: 0.6, grade: 'flash' },
  { at: 27.4, dur: 2.1, still: 'key/05-list.png', grade: 'present', push: 0.08 },
  { at: 29.5, dur: 3.2, clip: '02-hall', from: 4.0, vol: 0.5, grade: 'present' },
  { at: 32.7, dur: 4.3, clip: '06-mourners', from: 1.0, vol: 0.7, grade: 'present' },
  { at: 37.0, dur: 1.9, card: 'black', text: "Don't wait for next time." },
  { at: 38.9, dur: 9.3, phone: [{ s: 0, img: 'ai/shots/reading-2.png' }, { s: 2.2, img: 'ai/shots/assigned-bottom.png' }, { s: 6.6, img: 'shots/settle-form.png', top: true }] },
  { at: 48.2, dur: 6.6, card: 'end' },
  { at: 55.1, dur: 2.7, clip: '10a-door', from: 0.0, vol: 1, grade: 'tag' },
  { at: 57.8, dur: 2.6, clip: '10b-puppy', from: 3.0, vol: 1, grade: 'tag' },
  { at: 60.4, dur: 3.8, clip: '10c-suresh', from: 1.4, vol: 1, grade: 'tag' },
  { at: 64.2, dur: 2.6, card: 'black', text: 'Next time.', hand: true },
];

// Voice cuts from the two single takes: [file, take start, take end, film time, caption]
// caption: one string, or chunks [take time the chunk starts, text] so long reads never become a wall of text
export const VO: [string, number, number, number, string | [number, string][]][] = [
  ['suresh', 0.22, 4.5, 0.35, [[0.22, 'My best friend, Ramesh,'], [3.1, 'died owing me']]],
  ['suresh', 6.05, 7.85, 4.9, 'four thousand, three hundred and seventy rupees.'],
  ['suresh', 9.66, 10.8, 7.55, 'He was a good man.'],
  ['suresh', 11.78, 12.98, 8.95, "He'd give you anything."],
  ['suresh', 13.8, 14.66, 10.45, 'His time.'],
  ['suresh', 15.02, 15.95, 11.5, 'His jokes.'],
  ['suresh', 16.9, 18.35, 12.6, 'His last momo.'],
  ['suresh', 19.1, 21.45, 14.45, 'Just… never money.'],
  ['suresh', 22.75, 23.6, 21.60, 'Chiya.'],
  ['suresh', 24.75, 25.95, 23.40, 'Petrol to Pokhara.'],
  ['suresh', 27.15, 27.95, 25.40, 'My birthday.'],
  ['suresh', 29.88, 32.9, 29.55, 'Ramesh… there was no next time.'],
  ['suresh', 34.5, 35.85, 32.90, 'And judging by the crowd…'],
  ['suresh', 37.12, 38.55, 35.00, "I wasn't the only one."],
  ['announcer', 0.15, 6.55, 39.10, [[0.15, 'SplitUp.'], [1.3, 'Snap the bill at the table.'], [3.0, 'Everyone sees exactly what they owe,'], [5.4, 'down to the paisa.']]],
  ['announcer', 6.8, 9.15, 45.65, 'Settle up with eSewa or Khalti…'],
  ['announcer', 9.25, 12.35, 48.20, 'before anyone can say… next time.'],
  ['announcer', 12.65, 15.35, 51.60, [[12.65, 'SplitUp.'], [13.85, 'Settle up in this life.']]],
];
// Ramesh's own "Next time, pakka!" lifted from the momo clip and replayed over the last card: [clip, start, end, film time]
export const ECHO: [string, number, number, number] = ['04a-momo', 4.1, 5.85, 64.7];
// On-screen dialogue captions (sync sound from the clips): [film time, seconds, text]. Muted viewers need Ramesh's line for the twist.
export const SYNC: [number, number, string][] = [[19.45, 1.95, '“Next time, pakka!”']];
export const MUSIC = [
  { file: 'audio/score.mp3', at: 0, from: 0, dur: 37.0, vol: 0.55, fadeOut: 0.05 },
  { file: 'audio/brand.mp3', at: 38.9, from: 0, dur: 16.0, vol: 0.4, fadeOut: 1.2 },
];
export const TOTAL = 67;
// ─────────────────────────────────────────────────────────────────────────────────

const FILTER: Record<Grade, string> = {
  present: 'contrast(1.07) saturate(0.8) brightness(0.97) sepia(0.08)',
  flash: 'contrast(1.05) saturate(1.15) sepia(0.25) brightness(1.04)',
  tag: 'contrast(1.05) saturate(0.95) brightness(1.01)',
  none: 'none',
};

const Push: React.FC<{ dur: number; amount: number; children: React.ReactNode }> = ({ dur, amount, children }) => {
  const fr = useCurrentFrame();
  const s = 1 + amount * (fr / f(dur));
  return <AbsoluteFill style={{ transform: `scale(${s})` }}>{children}</AbsoluteFill>;
};

// Homography mapping the unit rect (w×h) onto 4 corners -> CSS matrix3d
function matrix3d(w: number, h: number, q: number[][]) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const M: number[][] = [], b: number[] = [];
  src.forEach(([x, y], i) => {
    const [u, v] = q[i];
    M.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    M.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  });
  for (let c = 0; c < 8; c++) { // Gaussian elimination
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j < 8; j++) M[r][j] -= k * M[c][j]; b[r] -= k * b[c]; }
  }
  const [a, bb, c, d, e, ff, g, hh] = b.map((v, i) => v / M[i][i]);
  return `matrix3d(${[a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, ff, 0, 1].join(',')})`;
}

const Phone: React.FC<{ screens: { s: number; img: string; top?: boolean }[]; dur: number }> = ({ screens, dur }) => {
  const fr = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const k = Math.max(width / phone.W, height / phone.H), ox = (width - phone.W * k) / 2, oy = (height - phone.H * k) / 2;
  const c = phone.corners, pad = 6; // bleed under the bezel so no green fringe shows
  const q = [[c.tl[0] - pad, c.tl[1] - pad], [c.tr[0] + pad, c.tr[1] - pad], [c.br[0] + pad, c.br[1] + pad], [c.bl[0] - pad, c.bl[1] + pad]].map(([x, y]) => [x * k + ox, y * k + oy]);
  const SW = 1236, SH = 2745;
  const cur = [...screens].reverse().find((x) => fr >= f(x.s))!;
  return (
    <Push dur={dur} amount={0.05}>
      <Img src={A('key/08-phone.png')} style={{ position: 'absolute', left: ox, top: oy, width: phone.W * k, height: phone.H * k, filter: FILTER.present }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: SW, height: SH, transformOrigin: '0 0', transform: matrix3d(SW, SH, q), background: '#FBF7F0', overflow: 'hidden' }}>
        <Img src={staticFile(cur.img)} style={{ width: SW, height: cur.top ? 'auto' : SH, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        {/* screen glow + a hint of reflection, so the UI sits in the room rather than on top of it */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 40%, rgba(255,200,140,0.06))' }} />
      </div>
      <Img src={A('phone-keyed.png')} style={{ position: 'absolute', left: ox, top: oy, width: phone.W * k, height: phone.H * k, filter: FILTER.present }} />
    </Push>
  );
};

const Card: React.FC<{ kind: 'black' | 'end'; text?: string; hand?: boolean; dur: number }> = ({ kind, text, hand, dur }) => {
  const fr = useCurrentFrame();
  const fade = interpolate(fr, [6, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (kind === 'black') return (
    <AbsoluteFill style={{ background: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: fade, color: '#f3eee4', fontFamily: serif, fontSize: hand ? 88 : 62, fontStyle: hand ? 'italic' : 'normal', letterSpacing: hand ? 0 : 0.5, textAlign: 'center', padding: '0 90px', lineHeight: 1.2 }}>{text}</div>
    </AbsoluteFill>
  );
  const rise = (d: number) => interpolate(fr, [d, d + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#1B1A17', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -160 }}>
        <Img src={staticFile('icon.svg')} style={{ width: 210, height: 210, opacity: rise(2), transform: `scale(${0.94 + 0.06 * rise(2)})` }} />
        <div style={{ fontFamily: brand, fontWeight: 800, fontSize: 132, color: '#FBF7F0', letterSpacing: -3, marginTop: 34, opacity: rise(6) }}>SplitUp</div>
        <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 64, color: '#F2A007', marginTop: 18, opacity: rise(f(3.4)) }}>Settle up in this life.</div>
        <div style={{ fontFamily: brand, fontWeight: 500, fontSize: 40, color: 'rgba(251,247,240,0.72)', marginTop: 70, opacity: rise(f(3.4) + 8), letterSpacing: 0.5 }}>splitup.thimitech.com</div>
      </div>
    </AbsoluteFill>
  );
};

const ShotView: React.FC<{ shot: Shot }> = ({ shot }) => {
  if ('phone' in shot) return <Phone screens={shot.phone} dur={shot.dur} />;
  if ('card' in shot) return <Card kind={shot.card} text={shot.text} hand={shot.hand} dur={shot.dur} />;
  const media = 'clip' in shot
    ? <OffthreadVideo src={A(`clips/${shot.clip}.mp4`)} startFrom={f(shot.from)} volume={shot.vol ?? 0.6} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : <Img src={A(shot.still)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
  return <AbsoluteFill style={{ filter: FILTER[shot.grade] }}><Push dur={shot.dur} amount={shot.push ?? 0}>{media}</Push></AbsoluteFill>;
};

// 35 mm texture over everything: grain that changes every frame, a soft vignette, and a little gate weave.
const Film35: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fr = useCurrentFrame();
  const wx = (random(`x${fr}`) - 0.5) * 2.2, wy = (random(`y${fr}`) - 0.5) * 2.2;
  const flicker = 1 + (random(`f${fr}`) - 0.5) * 0.025;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translate(${wx}px, ${wy}px) scale(1.012)`, filter: `brightness(${flicker})` }}>{children}</AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)' }} />
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.32 }}>
        <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={fr % 24} /><feColorMatrix type="saturate" values="0" /></filter>
        <rect width="100%" height="100%" filter="url(#g)" />
      </svg>
    </AbsoluteFill>
  );
};

// Broadcast-style subtitles on a soft dark plate (they must read over a white kurta or a white phone screen),
// kept above the TikTok/Reels caption and button area. During the product shot they sit above the phone.
const Caption: React.FC<{ text: string; top?: boolean }> = ({ text, top }) => {
  const fr = useCurrentFrame();
  const o = interpolate(fr, [0, 3], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: top ? 'flex-start' : 'flex-end', alignItems: 'center', paddingTop: 300, paddingBottom: 540 }}>
      <div style={{ opacity: o, maxWidth: 900, textAlign: 'center', fontFamily: serif, fontSize: 52, lineHeight: 1.2, color: '#fffaf0', background: 'rgba(12,10,8,0.62)', padding: '10px 26px 14px', borderRadius: 6 }}>{text}</div>
    </AbsoluteFill>
  );
};

export const Film: React.FC = () => {
  const inStory = (s: Shot) => !('card' in s && s.card === 'end') && !('phone' in s);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Film35>
        {SHOTS.filter(inStory).map((s, i) => <Sequence key={i} from={f(s.at)} durationInFrames={f(s.dur)}><ShotView shot={s} /></Sequence>)}
      </Film35>
      {/* product + end card stay clean (lighter texture) so the UI reads */}
      {SHOTS.filter((s) => !inStory(s)).map((s, i) => <Sequence key={`p${i}`} from={f(s.at)} durationInFrames={f(s.dur)}><ShotView shot={s} /></Sequence>)}
      {VO.map(([file, s, e, at, cap], i) => {
        const during = (k: 'end' | 'phone') => SHOTS.some((x) => (k === 'end' ? 'card' in x && x.card === 'end' : 'phone' in x) && at >= x.at && at < x.at + x.dur);
        const chunks = typeof cap === 'string' ? [[s, cap] as [number, string]] : cap;
        return (
          <Sequence key={`v${i}`} from={f(at)} durationInFrames={f(e - s + 0.35)}>
            <Audio src={A(`audio/${file}.wav`)} startFrom={f(s)} endAt={f(e)} volume={1} />
            {!during('end') && chunks.map(([t, text], j) => (
              <Sequence key={j} from={f(t - s)} durationInFrames={f((chunks[j + 1]?.[0] ?? e + 0.35) - t)}><Caption text={text} top={during('phone')} /></Sequence>
            ))}
          </Sequence>
        );
      })}
      {SYNC.map(([at, d, t], i) => <Sequence key={`s${i}`} from={f(at)} durationInFrames={f(d)}><Caption text={t} /></Sequence>)}
      <Sequence from={f(ECHO[3])} durationInFrames={f(ECHO[2] - ECHO[1])}>
        <Audio src={A(`clips/${ECHO[0]}.mp4`)} startFrom={f(ECHO[1])} endAt={f(ECHO[2])} volume={0.55} />
      </Sequence>
      {MUSIC.map((m, i) => (
        <Sequence key={`m${i}`} from={f(m.at)} durationInFrames={f(m.dur)}>
          <Audio src={A(m.file)} startFrom={f(m.from)} volume={(fr) => m.vol * interpolate(fr, [f(m.dur - m.fadeOut), f(m.dur)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

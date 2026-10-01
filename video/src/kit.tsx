import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from './theme';

export type Word = { text: string; start: number; end: number };
export const FPS = 30;
export const wf = (w: Word) => Math.round(w.start * FPS);
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const ease = (f: number, [a, b]: [number, number], [x, y]: [number, number], e = Easing.inOut(Easing.cubic)) =>
  interpolate(f, [a, b], [x, y], { ...clamp, easing: e });

export const useSpring = (at: number, config: Parameters<typeof spring>[0]['config'] = {}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 15, stiffness: 170, mass: 0.7, ...config } });
};

/** Canvas size and orientation; V = vertical (9:16) cut. */
export const useLayout = () => {
  const { width, height } = useVideoConfig();
  return { W: width, H: height, V: height > width };
};

/** Soft tiled paper background, drifting slowly. `grey` desaturates it for the sad beat. */
export const TiledBg: React.FC<{ grey?: number; color?: string }> = ({ grey = 0, color = C.paper }) => {
  const f = useCurrentFrame();
  const off = (f * 0.35) % 96;
  return (
    <AbsoluteFill style={{ background: color }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <pattern id="tile" width="96" height="96" patternUnits="userSpaceOnUse" patternTransform={`translate(${off} ${off * 0.5})`}>
            <rect x="5" y="5" width="86" height="86" rx="20" fill="#fffdf8" stroke="#efe5d4" strokeWidth="1.5" />
          </pattern>
          <radialGradient id="glow" cx="18%" cy="12%" r="70%">
            <stop offset="0%" stopColor={C.marigoldSoft} stopOpacity="0.9" />
            <stop offset="100%" stopColor={C.marigoldSoft} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vig" cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor={C.paper} stopOpacity="0" />
            <stop offset="100%" stopColor="#efe6d6" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#tile)" />
        <rect width="100%" height="100%" fill="url(#glow)" />
        <rect width="100%" height="100%" fill="url(#vig)" />
      </svg>
      <AbsoluteFill style={{ background: '#dcd8d2', opacity: grey * 0.55, mixBlendMode: 'saturation' }} />
      <AbsoluteFill style={{ background: '#e7e3dd', opacity: grey * 0.35 }} />
    </AbsoluteFill>
  );
};

/** Split words into on-screen phrases at punctuation. */
export const phrases = (words: Word[]) => {
  const out: Word[][] = [[]];
  words.forEach((w, i) => {
    out.at(-1)!.push(w);
    if (/[.,?!…]$/.test(w.text) && i < words.length - 1) out.push([]);
  });
  return out.filter((p) => p.length);
};

/**
 * Bold kinetic captions: one phrase on screen at a time; each word springs in on its own voice timestamp.
 * `energetic` = big overshoot + tilt (opening); otherwise a calm fade-up (product section).
 */
export const Kinetic: React.FC<{
  words: Word[];
  size: number;
  emphasis?: string[];
  energetic?: boolean;
  color?: string;
  accent?: string;
  align?: 'center' | 'left';
  maxWidth?: number;
  whole?: boolean; // show the whole line (no phrase paging)
  top?: boolean; // hang the text from the top instead of centring it
  style?: React.CSSProperties;
}> = ({ words, size, emphasis = [], energetic, color = C.ink, accent = C.marigold, align = 'center', maxWidth = 1560, whole, top, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const groups = whole ? [words] : phrases(words);
  let cur = 0;
  groups.forEach((g, i) => { if (f >= wf(g[0]) - 1) cur = i; });
  const emph = new Set(emphasis.map(norm));
  const render = (g: Word[], i: number) => {
    const next = groups[i + 1];
    const exitAt = next ? wf(next[0]) - 1 : null;
    const exit = exitAt === null ? 0 : ease(f, [exitAt, exitAt + (energetic ? 5 : 4)], [0, 1], energetic ? Easing.in(Easing.cubic) : undefined);
    return (
      <div key={i} style={{
        position: 'absolute', inset: 0, display: 'flex', flexWrap: 'wrap', alignContent: top ? 'flex-start' : 'center',
        justifyContent: align === 'center' ? 'center' : 'flex-start', gap: `0 ${size * 0.26}px`, maxWidth,
        margin: align === 'center' ? '0 auto' : 0, opacity: 1 - exit, transform: `translateY(${-exit * (energetic ? 90 : 20)}px)`,
      }}>
        {g.map((w, k) => {
          const at = wf(w) - 1;
          const s = spring({ frame: f - at, fps, config: energetic ? { damping: 11, stiffness: 210, mass: 0.6 } : { damping: 30, stiffness: 160 } });
          const o = interpolate(f - at, [0, energetic ? 3 : 5], [0, 1], clamp);
          const isE = emph.has(norm(w.text));
          const tf = energetic
            ? `translateY(${(1 - s) * 80}px) scale(${0.6 + 0.4 * s}) rotate(${(1 - s) * (k % 2 ? 6 : -6)}deg)`
            : `translateY(${(1 - s) * 14}px)`;
          return (
            <span key={k} style={{ display: 'inline-block', opacity: o, transform: tf, color: isE ? accent : color, whiteSpace: 'nowrap' }}>
              {w.text}
            </span>
          );
        })}
      </div>
    );
  };
  return (
    <div style={{ position: 'relative', fontFamily: F.display, fontWeight: 800, fontSize: size, lineHeight: 1.04, letterSpacing: '-0.035em', textAlign: align, ...style }}>
      {cur > 0 && f < wf(groups[cur][0]) + 6 ? render(groups[cur - 1], cur - 1) : null}
      {render(groups[cur], cur)}
    </div>
  );
};

/** A crop of a real screenshot (px coords at 3x), scaled to `width`. */
export const Crop: React.FC<{ src: string; crop: [number, number, number, number]; width: number; imgW?: number; style?: React.CSSProperties }> = ({ src, crop, width, imgW = 1290, style }) => {
  const [x0, y0, x1, y1] = crop;
  const k = width / (x1 - x0);
  return (
    <div style={{ width, height: (y1 - y0) * k, overflow: 'hidden', position: 'relative', ...style }}>
      <Img src={staticFile(`shots/${src}`)} style={{ position: 'absolute', width: imgW * k, left: -x0 * k, top: -y0 * k, maxWidth: 'none' }} />
    </div>
  );
};

export const PHONE = { w: 440, bezel: 12 };
export const SCREEN_W = PHONE.w - PHONE.bezel * 2;
export const SCREEN_H = Math.round((SCREEN_W * 2796) / 1290);
export const PHONE_H = SCREEN_H + PHONE.bezel * 2;
export const SK = SCREEN_W / 1290; // screenshot px -> phone px

/** A flat phone (no tilt). Children render inside the screen. */
export const Phone: React.FC<{ x: number; y: number; children: React.ReactNode; scale?: number }> = ({ x, y, children, scale = 1 }) => (
  <div style={{
    position: 'absolute', left: x, top: y, width: PHONE.w, height: PHONE_H, borderRadius: 64, background: C.ink, padding: PHONE.bezel,
    boxShadow: '0 40px 80px -30px rgba(60,40,10,.35), 0 12px 30px -12px rgba(60,40,10,.25)', transform: `scale(${scale})`, transformOrigin: 'center',
  }}>
    <div style={{ width: SCREEN_W, height: SCREEN_H, borderRadius: 52, overflow: 'hidden', position: 'relative', background: C.paper }}>{children}</div>
  </div>
);

/** A real screen inside the phone, optionally scrolled (px at 3x) and with a bottom sheet over a dimmed page. */
export const Screen: React.FC<{ src: string; scrollY?: number; sheet?: string; opacity?: number }> = ({ src, scrollY = 0, sheet, opacity = 1 }) => (
  <AbsoluteFill style={{ opacity }}>
    <Img src={staticFile(`shots/${src}`)} style={{ position: 'absolute', width: SCREEN_W, top: -scrollY * SK, left: 0, maxWidth: 'none' }} />
    {sheet && (
      <>
        <AbsoluteFill style={{ background: 'rgba(27,26,23,.38)' }} />
        <Img src={staticFile(`shots/${sheet}`)} style={{ position: 'absolute', width: SCREEN_W, bottom: 0, left: 0, maxWidth: 'none', borderRadius: '28px 28px 0 0' }} />
      </>
    )}
  </AbsoluteFill>
);

/** Floating magnifier card showing a crop of the same real screen. */
export const Callout: React.FC<{ src: string; crop: [number, number, number, number]; width: number; x: number; y: number; opacity?: number; scale?: number; children?: React.ReactNode }> = ({ src, crop, width, x, y, opacity = 1, scale = 1, children }) => (
  <div style={{
    position: 'absolute', left: x, top: y, opacity, transform: `scale(${scale})`, transformOrigin: 'left center',
    borderRadius: 30, background: C.surface, padding: 10, border: `1px solid ${C.line}`,
    boxShadow: '0 50px 90px -40px rgba(60,40,10,.45), 0 10px 24px -10px rgba(60,40,10,.2)',
  }}>
    <div style={{ borderRadius: 22, overflow: 'hidden', position: 'relative' }}>
      <Crop src={src} crop={crop} width={width} />
      {children}
    </div>
  </div>
);

/** Arrow cursor that flies in, presses at `click`, and leaves a ripple. */
export const Cursor: React.FC<{ click: number; x: number; y: number; from?: [number, number]; ring?: string }> = ({ click, x, y, from = [x + 420, y + 320], ring = C.ink }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const arrive = spring({ frame: f - (click - 16), fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
  const cx = interpolate(arrive, [0, 1], [from[0], x]);
  const cy = interpolate(arrive, [0, 1], [from[1], y]);
  const press = interpolate(f - click, [-2, 0, 4], [1, 0.8, 1], clamp);
  const out = ease(f, [click + 10, click + 18], [1, 0]);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {[0, 5].map((d) => {
        const p = ease(f, [click + d, click + d + 18], [0, 1], Easing.out(Easing.cubic));
        return f >= click + d ? (
          <div key={d} style={{ position: 'absolute', left: x - 160 * p, top: y - 160 * p, width: 320 * p, height: 320 * p, borderRadius: '50%', border: `${6 * (1 - p) + 1}px solid ${ring}`, opacity: 1 - p }} />
        ) : null;
      })}
      <svg width="64" height="64" viewBox="0 0 24 24" style={{ position: 'absolute', left: cx - 10, top: cy - 6, transform: `scale(${press})`, transformOrigin: '10px 6px', opacity: out, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.25))' }}>
        <path d="M5 2.5l14 8.2-6.1 1.6 3.6 6.6-2.7 1.5-3.6-6.6L5.6 18z" fill={C.ink} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};

/** Colour flood: reveals the incoming scene through a circle growing from the click point. */
export const Flood: React.FC<{ at: number; x: number; y: number; children: React.ReactNode; dur?: number }> = ({ at, x, y, children, dur = 17 }) => {
  const f = useCurrentFrame();
  const r = ease(f, [at + 1, at + 1 + dur], [0, 2300], Easing.bezier(0.7, 0, 0.25, 1));
  return <AbsoluteFill style={{ clipPath: r >= 2299 ? undefined : `circle(${r}px at ${x}px ${y}px)` }}>{children}</AbsoluteFill>;
};

export const Logo: React.FC<{ size: number }> = ({ size }) => <Img src={staticFile('icon.svg')} style={{ width: size, height: size }} />;

export const Pill: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 26px', borderRadius: 999, background: C.surface, border: `1.5px solid ${C.line}`, fontFamily: F.body, fontWeight: 700, fontSize: 30, color: C.ink, boxShadow: '0 10px 30px -18px rgba(60,40,10,.4)', ...style }}>
    {children}
  </div>
);

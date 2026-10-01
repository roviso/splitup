import React, { createContext, useContext } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, F } from '../theme';
import { Logo, ease, useLayout } from '../kit';
import boxes from '../../public/ai/shots/boxes.json';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const IMG_W = 1236, IMG_H = 2745; // 412x915 phone screens at 3x
export type BoxName = keyof typeof boxes;

export { useLayout };

// ── Phone ─────────────────────────────────────────────────────────────────────────────────────
const PhoneCtx = createContext({ sw: 400, sh: 888, k: 400 / IMG_W });
export const usePhone = () => useContext(PhoneCtx);
export const phoneH = (w: number) => { const b = Math.round(w * 0.03); return Math.round(((w - 2 * b) * IMG_H) / IMG_W) + 2 * b; };

/** A flat phone. Children draw inside the screen; `usePhone()` gives its size and the screenshot scale. */
export const Phone: React.FC<{ x: number; y: number; w: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ x, y, w, children, style }) => {
  const b = Math.round(w * 0.03);
  const sw = w - 2 * b, sh = Math.round((sw * IMG_H) / IMG_W);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: sh + 2 * b, borderRadius: w * 0.14, background: C.ink, padding: b,
      boxShadow: '0 50px 90px -40px rgba(60,40,10,.45), 0 14px 30px -14px rgba(60,40,10,.3)', ...style }}>
      <div style={{ width: sw, height: sh, borderRadius: w * 0.115, overflow: 'hidden', position: 'relative', background: C.paper }}>
        <PhoneCtx.Provider value={{ sw, sh, k: sw / IMG_W }}>{children}</PhoneCtx.Provider>
      </div>
    </div>
  );
};

/** A real screenshot filling the screen (scrollY in screenshot px). */
export const Shot: React.FC<{ src: string; opacity?: number; scrollY?: number; y?: number }> = ({ src, opacity = 1, scrollY = 0, y = 0 }) => {
  const { sw, k } = usePhone();
  return <Img src={staticFile(`ai/shots/${src}.png`)} style={{ position: 'absolute', left: 0, top: y - scrollY * k, width: sw, maxWidth: 'none', opacity }} />;
};

/** A saved UI box in screen px. */
export const useBox = (name: BoxName) => {
  const { k } = usePhone();
  const b = boxes[name];
  return { left: b.x * 3 * k, top: b.y * 3 * k, width: b.width * 3 * k, height: b.height * 3 * k };
};

/** A finger tap: a soft dot that presses at `at` and leaves a ripple. */
export const Tap: React.FC<{ at: number; x: number; y: number; size?: number }> = ({ at, x, y, size = 46 }) => {
  const f = useCurrentFrame();
  if (f < at - 8 || f > at + 18) return null;
  const inn = ease(f, [at - 8, at - 2], [0, 1]);
  const press = interpolate(f - at, [-2, 0, 3], [1, 0.8, 1], clamp);
  const out = ease(f, [at + 6, at + 14], [1, 0]);
  const r = ease(f, [at, at + 16], [0, 1], Easing.out(Easing.cubic));
  return (
    <>
      {f >= at && <div style={{ position: 'absolute', left: x - size * 1.4 * r, top: y - size * 1.4 * r, width: size * 2.8 * r, height: size * 2.8 * r,
        borderRadius: '50%', border: `${3 * (1 - r) + 1}px solid ${C.marigold}`, opacity: 1 - r }} />}
      <div style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: '50%',
        background: 'rgba(27,26,23,.28)', border: '3px solid rgba(255,255,255,.9)', opacity: inn * out, transform: `scale(${press * (1.3 - 0.3 * inn)})` }} />
    </>
  );
};
export const TapBox: React.FC<{ at: number; box: BoxName; fx?: number; fy?: number }> = ({ at, box, fx = 0.5, fy = 0.5 }) => {
  const b = useBox(box);
  const { sw } = usePhone();
  return <Tap at={at} x={b.left + b.width * fx} y={b.top + b.height * fy} size={sw * 0.11} />;
};

/** Text typed character by character over a box, with a caret. */
export const Typing: React.FC<{ box: BoxName; text: string; from: number; to: number; pad?: number; size?: number; bg?: string; wrap?: boolean }> = ({ box, text, from, to, pad = 0.04, size, bg = C.surface, wrap }) => {
  const f = useCurrentFrame();
  const b = useBox(box);
  const { sw } = usePhone();
  if (f < from) return null;
  const n = Math.round(interpolate(f, [from, to], [0, text.length], clamp));
  const caret = f < to + 12 && Math.floor(f / 8) % 2 === 0;
  const fs = size ?? sw * 0.04;
  return (
    <div style={{ position: 'absolute', left: b.left + sw * pad, top: b.top + 2, width: b.width - sw * pad * 2 - sw * 0.12, height: b.height - 4, background: bg,
      display: 'flex', alignItems: 'center', overflow: 'hidden', fontFamily: F.body, fontWeight: 500, fontSize: fs, color: C.ink, lineHeight: 1.2 }}>
      <span style={{ whiteSpace: wrap ? 'normal' : 'nowrap', direction: 'ltr', display: 'block', transform: wrap ? undefined : `translateX(${Math.min(0, (b.width - sw * 0.2) - n * fs * 0.5)}px)` }}>
        {text.slice(0, n)}<span style={{ opacity: caret ? 1 : 0, color: C.marigold, fontWeight: 700 }}>|</span>
      </span>
    </div>
  );
};

/** Marigold highlight ring around a saved box, easing in at `at` (and out at `out`). */
export const Ring: React.FC<{ box: BoxName; at: number; out?: number; pad?: number }> = ({ box, at, out, pad = 6 }) => {
  const f = useCurrentFrame();
  const b = useBox(box);
  const o = ease(f, [at, at + 8], [0, 1]) * (out ? ease(f, [out, out + 6], [1, 0]) : 1);
  return <div style={{ position: 'absolute', left: b.left - pad, top: b.top - pad, width: b.width + pad * 2, height: b.height + pad * 2, borderRadius: 18,
    border: `4px solid ${C.marigold}`, boxShadow: `0 0 0 ${8 * o}px rgba(242,160,7,.18)`, opacity: o, transform: `scale(${1.05 - 0.05 * o})` }} />;
};

// ── Floating cards ────────────────────────────────────────────────────────────────────────────
export const Card: React.FC<{ x: number; y: number; w: number; opacity?: number; scale?: number; children: React.ReactNode; style?: React.CSSProperties; origin?: string }> = ({ x, y, w, opacity = 1, scale = 1, children, style, origin = 'center' }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, opacity, transform: `scale(${scale})`, transformOrigin: origin, borderRadius: 30, background: C.surface,
    padding: 12, border: `1px solid ${C.line}`, boxShadow: '0 50px 90px -40px rgba(60,40,10,.45), 0 10px 24px -10px rgba(60,40,10,.2)', ...style }}>
    {children}
  </div>
);

/** A crop of a screenshot, in screenshot px, scaled to width w. */
export const Crop: React.FC<{ src: string; crop: [number, number, number, number]; w: number; children?: React.ReactNode; ext?: string }> = ({ src, crop, w, children, ext = 'png' }) => {
  const [x0, y0, x1, y1] = crop;
  const k = w / (x1 - x0);
  const full = ext === 'jpg' ? 900 : IMG_W;
  return (
    <div style={{ width: w, height: (y1 - y0) * k, overflow: 'hidden', position: 'relative', borderRadius: 20 }}>
      <Img src={staticFile(`ai/shots/${src}.${ext}`)} style={{ position: 'absolute', width: full * k, left: -x0 * k, top: -y0 * k, maxWidth: 'none' }} />
      {children}
    </div>
  );
};

/** A user chat bubble (the app's ink bubble) that types itself. */
export const Bubble: React.FC<{ text: string; from: number; to: number; size: number; w: number; x: number; y?: number; bottom?: number; show?: number; hide?: number }> = ({ text, from, to, size, w, x, y, bottom, show, hide }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: f - (show ?? from) + 2, fps, config: { damping: 16, stiffness: 180 } });
  const n = Math.round(interpolate(f, [from, to], [0, text.length], clamp));
  if (f < (show ?? from) - 2) return null;
  const gone = hide ? ease(f, [hide, hide + 5], [1, 0]) : 1;
  return (
    <div style={{ position: 'absolute', left: x, top: y, bottom, width: w, display: 'flex', justifyContent: 'flex-end', opacity: s * gone, transform: `translateY(${(1 - s) * 30}px) scale(${0.9 + 0.1 * s})`, transformOrigin: 'right bottom' }}>
      <div style={{ background: C.ink, color: C.paper, fontFamily: F.body, fontWeight: 600, fontSize: size, lineHeight: 1.3, padding: `${size * 0.7}px ${size * 0.95}px`,
        borderRadius: `${size * 1.4}px ${size * 1.4}px ${size * 0.35}px ${size * 1.4}px`, boxShadow: '0 30px 60px -30px rgba(27,26,23,.6)', maxWidth: w }}>
        {text.slice(0, n)}
        {n < text.length && <span style={{ color: C.marigold }}>|</span>}
      </div>
    </div>
  );
};

// ── The receipt: the film's main object ───────────────────────────────────────────────────────
export const BILL_LINES: [string, string, string][] = [
  ['Buff Momo (Steam)', '2', '640.00'], ['Jhol Momo', '1', '380.00'], ['Chicken Chowmein', '1', '420.00'],
  ['Everest Beer 650ml', '2', '1,100.00'], ['Lemon Soda', '2', '240.00'],
];
/** A thermal receipt drawn as vector type. `reveal` (0..1) unrolls it from the top; `extra` adds blank paper below. */
export const Receipt: React.FC<{ w: number; reveal?: number; extra?: number; grey?: number; mark?: number }> = ({ w, reveal = 1, extra = 0, grey = 0, mark = -1 }) => {
  const fs = w * 0.047;
  const row = (a: string, b: string, i: number, bold = false) => (
    <div key={a + i} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: bold ? 800 : 500, background: i === mark ? 'rgba(242,160,7,.35)' : undefined, borderRadius: 6, padding: '0 6px', margin: '0 -6px' }}>
      <span>{a}</span><span>{b}</span>
    </div>
  );
  const dash = <div style={{ borderTop: `${Math.max(2, w * 0.004)}px dashed #6f6a60`, margin: `${fs * 0.5}px 0` }} />;
  const full = (
    <div style={{ padding: `${fs * 1.4}px ${fs * 1.3}px ${fs * 1.2}px`, fontFamily: '"Courier New", monospace', fontSize: fs, lineHeight: 1.5, color: '#27251f' }}>
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: fs * 1.45, letterSpacing: '0.12em' }}>MOMO ADDA</div>
      <div style={{ textAlign: 'center', opacity: 0.8 }}>Jhamsikhel, Lalitpur</div>
      {dash}
      {row('Date: 2083/06/14', 'Table 7', -1)}
      {dash}
      {BILL_LINES.map(([n, q, p], i) => row(`${n}${q !== '1' ? ` ×${q}` : ''}`, p, i))}
      {dash}
      {row('Sub Total', '2,780.00', 5)}
      {row('Service Charge 10%', '278.00', 6)}
      {row('VAT 13%', '397.54', 7)}
      {dash}
      <div style={{ fontSize: fs * 1.2 }}>{row('GRAND TOTAL', '3,455.54', 8, true)}</div>
      {dash}
      <div style={{ textAlign: 'center', opacity: 0.8 }}>Thank you! धन्यवाद</div>
      <div style={{ height: extra }} />
    </div>
  );
  return (
    <div style={{ width: w, position: 'relative', filter: grey ? `grayscale(${grey})` : undefined }}>
      <div style={{ overflow: 'hidden', clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)`, background: '#fbf9f3',
        boxShadow: '0 40px 80px -30px rgba(40,25,5,.5), inset 0 0 50px rgba(120,100,60,.08)',
        // torn edge: solid paper above, a row of half-circle bites along the bottom
        WebkitMaskImage: `linear-gradient(#000,#000), radial-gradient(circle at 50% 100%, transparent ${w / 70}px, #000 ${w / 70 + 0.5}px)`,
        WebkitMaskSize: `100% calc(100% - ${w / 70}px), ${w / 26}px ${w / 70}px`, WebkitMaskPosition: 'top, bottom', WebkitMaskRepeat: 'no-repeat, repeat-x' }}>
        {full}
      </div>
    </div>
  );
};

// ── Install demo: browser chrome, share sheet and home screen (generic, not brand art) ────────
const StatusBar: React.FC<{ dark?: boolean; ios?: boolean }> = ({ dark, ios }) => {
  const { sw } = usePhone();
  const c = dark ? '#fff' : C.ink;
  return (
    <div style={{ height: sw * 0.1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${sw * 0.08}px`, fontFamily: F.body, fontWeight: 700, fontSize: sw * 0.038, color: c }}>
      <span>{ios ? '9:41' : '8:47'}</span>
      <span style={{ display: 'flex', gap: sw * 0.015, alignItems: 'center' }}>
        {[0.45, 0.65, 0.85, 1].map((h, i) => <span key={i} style={{ width: sw * 0.009, height: sw * 0.03 * h, background: c, borderRadius: 2 }} />)}
        <span style={{ width: sw * 0.06, height: sw * 0.03, border: `2px solid ${c}`, borderRadius: 5, marginLeft: sw * 0.012, position: 'relative' }}>
          <span style={{ position: 'absolute', inset: 2, right: '25%', background: c, borderRadius: 2 }} />
        </span>
      </span>
    </div>
  );
};

const Lock: React.FC<{ s: number }> = ({ s }) => (
  <svg width={s} height={s} viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0110 0v3" fill="none" stroke={C.muted} strokeWidth="2.4" /><rect x="5" y="10" width="14" height="11" rx="2.5" fill={C.muted} /></svg>
);

/** Android-style browser: URL bar on top with a ⋮ menu. The page is the real login screen. */
export const AndroidBrowser: React.FC<{ urlFrom: number; urlTo: number; pageAt: number; menuAt: number; installAt: number; confirmAt: number }> = ({ urlFrom, urlTo, pageAt, menuAt, installAt, confirmAt }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { sw, sh } = usePhone();
  const url = 'splitup.thimitech.com';
  const n = Math.round(interpolate(f, [urlFrom, urlTo], [0, url.length], clamp));
  const barH = sw * 0.16, top = sw * 0.1;
  const menu = spring({ frame: f - menuAt - 2, fps, config: { damping: 18, stiffness: 220 } });
  const dlg = spring({ frame: f - installAt - 4, fps, config: { damping: 18, stiffness: 200 } });
  const items = ['New tab', 'New Incognito tab', 'History', 'Downloads', 'Bookmarks', 'Recent tabs', 'Share…', 'Install app', 'Desktop site'];
  const fs = sw * 0.043;
  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      <StatusBar />
      <div style={{ position: 'absolute', top, left: 0, right: 0, height: barH, display: 'flex', alignItems: 'center', gap: sw * 0.03, padding: `0 ${sw * 0.04}px`, background: '#fff', zIndex: 2 }}>
        <div style={{ flex: 1, height: barH * 0.66, borderRadius: 999, background: '#eef0f3', display: 'flex', alignItems: 'center', gap: sw * 0.02, padding: `0 ${sw * 0.04}px`, fontFamily: F.body, fontSize: fs, color: C.ink, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <Lock s={fs} />{n ? url.slice(0, n) : <span style={{ color: C.muted }}>Search or type URL</span>}
        </div>
        <div style={{ width: sw * 0.065, height: sw * 0.065, border: `3px solid ${C.ink}`, borderRadius: 6, display: 'grid', placeItems: 'center', fontFamily: F.body, fontWeight: 700, fontSize: fs * 0.7 }}>1</div>
        <div style={{ width: sw * 0.06, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sw * 0.012 }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: sw * 0.013, height: sw * 0.013, borderRadius: '50%', background: C.ink }} />)}
        </div>
      </div>
      <div style={{ position: 'absolute', top: top + barH, left: 0, right: 0, bottom: 0, overflow: 'hidden', background: C.paper }}>
        {f >= pageAt && <div style={{ opacity: ease(f, [pageAt, pageAt + 6], [0, 1]) }}><Shot src="login" /></div>}
        {f < pageAt && f >= urlTo && <div style={{ position: 'absolute', top: 0, left: 0, height: 4, width: `${ease(f, [urlTo, pageAt], [10, 90])}%`, background: '#1a73e8' }} />}
      </div>
      {f >= menuAt && f < installAt + 4 && (
        <div style={{ position: 'absolute', top: top + sw * 0.02, right: sw * 0.02, width: sw * 0.62, background: '#fff', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,.28)', zIndex: 3,
          padding: `${sw * 0.02}px 0`, transformOrigin: 'top right', transform: `scale(${0.6 + 0.4 * menu})`, opacity: menu }}>
          {items.map((it) => {
            const hot = it === 'Install app';
            const glow = hot ? ease(f, [installAt - 12, installAt - 4], [0, 1]) : 0;
            return (
              <div key={it} style={{ padding: `${sw * 0.026}px ${sw * 0.055}px`, fontFamily: F.body, fontWeight: hot ? 700 : 500, fontSize: fs, color: C.ink,
                background: `rgba(242,160,7,${0.25 * glow})`, display: 'flex', alignItems: 'center', gap: sw * 0.03 }}>
                {hot && <span style={{ fontSize: fs * 1.05 }}>📲</span>}{it}
              </div>
            );
          })}
        </div>
      )}
      {f >= installAt + 2 && (
        <AbsoluteFill style={{ background: `rgba(0,0,0,${0.4 * dlg})`, zIndex: 4 }}>
          <div style={{ position: 'absolute', left: sw * 0.07, right: sw * 0.07, top: sh * 0.36, background: '#fff', borderRadius: 26, padding: sw * 0.065,
            transform: `scale(${0.85 + 0.15 * dlg})`, opacity: dlg, fontFamily: F.body, color: C.ink }}>
            <div style={{ fontWeight: 700, fontSize: fs * 1.25, marginBottom: sw * 0.05 }}>Install app</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: sw * 0.04 }}>
              <div style={{ borderRadius: sw * 0.035, background: C.ink, padding: sw * 0.012 }}><Logo size={sw * 0.12} /></div>
              <div><div style={{ fontWeight: 700, fontSize: fs * 1.05 }}>Split-Up</div><div style={{ fontSize: fs * 0.85, color: C.muted }}>splitup.thimitech.com</div></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: sw * 0.08, marginTop: sw * 0.07, fontWeight: 700, fontSize: fs, color: '#1a73e8' }}>
              <span>Cancel</span><span>Install</span>
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
/** Where the Android demo's taps land (screen px). */
export const androidTaps = (sw: number, sh: number) => ({
  menu: { x: sw * 0.925, y: sw * 0.18 },
  install: { x: sw * 0.6, y: sw * 0.12 + sw * 0.02 + sw * 0.02 + sw * 0.0955 * 7.5 },
  confirm: { x: sw * 0.79, y: sh * 0.36 + sw * 0.48 },
});

/** iPhone-style browser: URL pill and toolbar at the bottom, share sheet on tap. */
export const IosBrowser: React.FC<{ urlFrom: number; urlTo: number; pageAt: number; shareAt: number; addAt: number }> = ({ urlFrom, urlTo, pageAt, shareAt, addAt }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { sw, sh } = usePhone();
  const url = 'splitup.thimitech.com';
  const n = Math.round(interpolate(f, [urlFrom, urlTo], [0, url.length], clamp));
  const fs = sw * 0.043;
  const sheet = spring({ frame: f - shareAt - 2, fps, config: { damping: 20, stiffness: 170 } });
  const toolH = sw * 0.3;
  const rows = ['Copy', 'Add to Reading List', 'Add Bookmark', 'Add to Favourites', 'Add to Home Screen', 'Find on Page'];
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: toolH, overflow: 'hidden' }}>
        {f >= pageAt ? <div style={{ opacity: ease(f, [pageAt, pageAt + 6], [0, 1]) }}><Shot src="login" /></div> : <AbsoluteFill style={{ background: '#fff' }} />}
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}><StatusBar dark={f >= pageAt} ios /></div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: toolH, background: 'rgba(248,248,248,.97)', borderTop: '1px solid #ddd', padding: `${sw * 0.03}px ${sw * 0.05}px` }}>
        <div style={{ height: sw * 0.11, borderRadius: 14, background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: sw * 0.02, fontFamily: F.body, fontSize: fs, color: C.ink }}>
          <Lock s={fs * 0.9} />{n ? url.slice(0, n) : <span style={{ color: C.muted }}>Search or enter website</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginTop: sw * 0.045, color: '#0a7aff', fontSize: sw * 0.06, fontFamily: F.body }}>
          <span>‹</span><span style={{ opacity: 0.35 }}>›</span>
          <svg width={sw * 0.07} height={sw * 0.07} viewBox="0 0 24 24"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="#0a7aff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <svg width={sw * 0.065} height={sw * 0.065} viewBox="0 0 24 24"><path d="M3 5h7a2 2 0 012 2v13a2 2 0 00-2-2H3zM21 5h-7a2 2 0 00-2 2v13a2 2 0 012-2h7z" fill="none" stroke="#0a7aff" strokeWidth="2" strokeLinejoin="round" /></svg>
          <svg width={sw * 0.065} height={sw * 0.065} viewBox="0 0 24 24"><rect x="7" y="3" width="14" height="14" rx="2" fill="none" stroke="#0a7aff" strokeWidth="2" /><path d="M17 21H5a2 2 0 01-2-2V7" fill="none" stroke="#0a7aff" strokeWidth="2" /></svg>
        </div>
      </div>
      {f >= shareAt && (
        <AbsoluteFill style={{ background: `rgba(0,0,0,${0.35 * sheet})` }}>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: sh * 0.62, background: '#f2f2f7', borderRadius: '26px 26px 0 0', transform: `translateY(${(1 - sheet) * 100}%)`,
            padding: sw * 0.05, fontFamily: F.body, color: C.ink }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: sw * 0.035, background: '#fff', borderRadius: 14, padding: sw * 0.035 }}>
              <div style={{ borderRadius: sw * 0.03, background: C.ink, padding: sw * 0.01 }}><Logo size={sw * 0.1} /></div>
              <div><div style={{ fontWeight: 700, fontSize: fs }}>Split-Up</div><div style={{ fontSize: fs * 0.8, color: C.muted }}>splitup.thimitech.com</div></div>
            </div>
            <div style={{ display: 'flex', gap: sw * 0.04, margin: `${sw * 0.05}px 0` }}>
              {['#5ac8fa', '#34c759', '#ff9f0a', '#af52de'].map((c, i) => <div key={i} style={{ width: sw * 0.15, height: sw * 0.15, borderRadius: sw * 0.04, background: c, opacity: 0.85 }} />)}
            </div>
            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden' }}>
              {rows.map((r, i) => {
                const hot = r === 'Add to Home Screen';
                const glow = hot ? ease(f, [addAt - 12, addAt - 4], [0, 1]) : 0;
                return (
                  <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `${sw * 0.032}px ${sw * 0.045}px`, fontSize: fs,
                    fontWeight: hot ? 700 : 500, borderTop: i ? '1px solid #e5e5ea' : undefined, background: `rgba(242,160,7,${0.25 * glow})` }}>
                    {r}<span style={{ color: '#8e8e93' }}>{hot ? '⊕' : '·'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
export const iosTaps = (sw: number, sh: number) => ({
  share: { x: sw * 0.5, y: sh - sw * 0.3 + sw * 0.03 + sw * 0.11 + sw * 0.045 + sw * 0.035 },
  add: { x: sw * 0.45, y: sh - sh * 0.62 + sw * 0.05 + sw * 0.17 + sw * 0.25 + sw * 0.0955 * 4.5 },
});

/** A phone home screen with generic app tiles; the Split-Up icon lands at `at`. */
export const HomeScreen: React.FC<{ at: number; ios?: boolean }> = ({ at, ios }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { sw } = usePhone();
  const s = spring({ frame: f - at, fps, config: { damping: 9, stiffness: 190, mass: 0.7 } });
  const apps: [string, string, string][] = [['📷', 'Camera', '#dfe6ee'], ['🗒️', 'Notes', '#fff4c2'], ['🎵', 'Music', '#ffd9de'], ['🗺️', 'Maps', '#d8f0dc'],
    ['⏰', 'Clock', '#e4e4e4'], ['📅', 'Calendar', '#ffe3d6'], ['⛅', 'Weather', '#d6ecff'], ['📁', 'Files', '#e7ddff']];
  const tile = sw * 0.17, gap = (sw - tile * 4) / 5, fs = sw * 0.032;
  const icon = (glyph: React.ReactNode, label: string, bg: string, style?: React.CSSProperties) => (
    <div key={label} style={{ width: tile, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: sw * 0.015, ...style }}>
      <div style={{ width: tile, height: tile, borderRadius: tile * (ios ? 0.24 : 0.5), background: bg, display: 'grid', placeItems: 'center', fontFamily: F.emoji, fontSize: tile * 0.5, boxShadow: '0 6px 14px rgba(0,0,0,.15)', overflow: 'hidden' }}>{glyph}</div>
      <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: fs, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.4)' }}>{label}</div>
    </div>
  );
  return (
    <AbsoluteFill style={{ background: ios ? 'linear-gradient(160deg,#f7b52e 0%,#e5663a 55%,#6b2f5e 100%)' : 'linear-gradient(170deg,#2d3a5c 0%,#6d4c7d 55%,#e09a4f 100%)' }}>
      <StatusBar dark ios={ios} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${sw * 0.07}px ${gap}px`, padding: `${sw * 0.1}px ${gap}px` }}>
        {apps.map(([g, l, b]) => icon(g, l, b))}
        {f >= at && icon(<div style={{ width: '100%', height: '100%', background: C.ink, display: 'grid', placeItems: 'center' }}><Logo size={tile * 0.72} /></div>, 'Split-Up', C.ink,
          { transform: `scale(${s})`, filter: `drop-shadow(0 0 ${14 * s}px rgba(242,160,7,.9))` })}
      </div>
    </AbsoluteFill>
  );
};

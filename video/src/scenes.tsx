import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import tl from './timeline.json';
import { getCues } from './cues.js';
import { C, F } from './theme';
import { Callout, Kinetic, Logo, Phone, PHONE, PHONE_H, Pill, Screen, TiledBg, Word, ease, useLayout, useSpring, wf } from './kit';

const cues = getCues(tl);
const S = cues.S as Record<string, (typeof tl.shots)[number]>;
const words = (id: string) => S[id].words as Word[];
const find = (id: string, text: string) => words(id).find((w) => w.text.toLowerCase().startsWith(text.toLowerCase()))!;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Vertical (9:16) cut: key content stays inside y 200–1600 and left of x ~950 (the TikTok/Shorts
// header, caption and right-hand button rail sit outside that).

/** Where each click → ripple → flood happens, per layout. */
export const clickPoints = (V: boolean) => ({
  turn: V ? { x: 590, y: 1035 } : { x: 1395, y: 540 }, // on "change."
  reveal: V ? { x: 540, y: 690 } : { x: 640, y: 470 }, // the logo
  result: V ? { x: 515, y: 385 } : { x: 555, y: 330 }, // the ✓
});

/** Emoji prop that pops in on a word and bobs gently. */
const Prop: React.FC<{ at: number; x: number; y: number; size?: number; children: string; tilt?: number }> = ({ at, x, y, size = 200, children, tilt = -10 }) => {
  const f = useCurrentFrame();
  const s = useSpring(at, { damping: 9, stiffness: 200, mass: 0.6 });
  if (f < at) return null;
  return (
    <div style={{ position: 'absolute', left: x, top: y, fontFamily: F.emoji, fontSize: size, lineHeight: 1,
      transform: `translateY(${Math.sin((f - at) / 9) * 8}px) scale(${s}) rotate(${(1 - s) * 40 + tilt}deg)` }}>{children}</div>
  );
};

const Thought: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
  const s = useSpring(at);
  const { V } = useLayout();
  return (
    <div style={{ position: 'absolute', top: V ? 230 : 96, left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: s, transform: `translateY(${(1 - s) * -30}px)` }}>
      <Pill style={{ fontSize: V ? 38 : 32 }}>{children}</Pill>
    </div>
  );
};

// ── 1–2. Opening: from inside your head, hopeful then disappointed ─────────────────────────────
export const Opening: React.FC = () => {
  const f = useCurrentFrame();
  const { W, V } = useLayout();
  const cut = S.sad.from;
  const hookX = ease(f, [cut - 7, cut], [0, -W], Easing.in(Easing.cubic));
  const sadX = ease(f, [cut - 7, cut + 3], [W, 0], Easing.out(Easing.cubic));
  const grey = ease(f, [cut, cut + 12], [0, 1]);
  const days = Math.round(interpolate(f, [cut + 2, wf(find('sad', 'later')) + 8], [1, 21], clamp));
  const awk = find('sad', 'awkward');
  return (
    <AbsoluteFill>
      <TiledBg grey={grey} />
      {f < cut && (
        <AbsoluteFill style={{ transform: `translateX(${hookX}px)` }}>
          <Thought at={2}>💭 Friday, 8:47 pm</Thought>
          <Prop at={wf(find('hook', 'momo')) - 1} x={V ? 70 : 170} y={V ? 1260 : 640} size={V ? 250 : 230}>🥟</Prop>
          <Prop at={wf(find('hook', 'bill')) - 1} x={V ? 720 : 1520} y={V ? 380 : 190} size={200} tilt={12}>🧾</Prop>
          <Prop at={wf(find('hook', 'easy')) - 1} x={V ? 700 : 1500} y={V ? 1280 : 660} size={210} tilt={8}>😎</Prop>
          <AbsoluteFill style={{ justifyContent: 'center' }}>
            <Kinetic words={words('hook')} size={V ? 138 : 150} energetic maxWidth={V ? 960 : 1560} emphasis={['Momo', 'bill.', 'Seventeen', 'hundred', 'rupees?', 'Easy.']} />
          </AbsoluteFill>
        </AbsoluteFill>
      )}
      {f >= cut - 7 && (
        <AbsoluteFill style={{ transform: `translateX(${sadX}px)` }}>
          <Thought at={cut}>💭 Day {days} · still waiting</Thought>
          <Prop at={wf(awk) - 1} x={V ? 680 : 1480} y={V ? 1280 : 640} size={210} tilt={Math.sin(f / 3) * 6}>😬</Prop>
          <AbsoluteFill style={{ justifyContent: 'center' }}>
            <Kinetic words={words('sad')} size={V ? 128 : 140} energetic maxWidth={V ? 960 : 1560} color="#3b3833" emphasis={['awkward']} />
          </AbsoluteFill>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ── 3–6. "Let's be honest" + three-part diagnosis ─────────────────────────────────────────────
const Row: React.FC<{ id: string; n: string; top: number; emoji: string; next?: number }> = ({ id, n, top, emoji, next }) => {
  const f = useCurrentFrame();
  const { V } = useLayout();
  const slam = useSpring(S[id].from - 1, { damping: 17, stiffness: 260, mass: 0.7 });
  const dim = next ? ease(f, [next - 2, next + 6], [1, 0.3]) : 1;
  if (f < S[id].from - 1) return null;
  const num = <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 84, color: C.marigold, letterSpacing: '-0.04em', lineHeight: 1.05, width: 120 }}>{n}</div>;
  const icon = <div style={{ fontFamily: F.emoji, fontSize: 88, lineHeight: 1, transform: `scale(${slam})` }}>{emoji}</div>;
  // Vertical: number + emoji on one line, the sentence underneath at full width.
  if (V) return (
    <div style={{ position: 'absolute', left: 70, top, width: 940, opacity: dim, transform: `translateX(${(1 - slam) * 900}px)` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{num}{icon}</div>
      <Kinetic words={words(id)} size={74} energetic align="left" whole top maxWidth={940} style={{ height: 240, marginTop: 8 }} />
    </div>
  );
  return (
    <div style={{ position: 'absolute', left: 150, top, right: 70, display: 'flex', gap: 44, alignItems: 'flex-start', opacity: dim, transform: `translateX(${(1 - slam) * 900}px)` }}>
      {num}
      <Kinetic words={words(id)} size={66} energetic align="left" whole maxWidth={1420} style={{ flex: 1, minHeight: 80 }} />
      {icon}
    </div>
  );
};

export const Diagnosis: React.FC = () => {
  const f = useCurrentFrame();
  const { V } = useLayout();
  const up = useSpring(S.d1.from - 3, { damping: 20, stiffness: 150 });
  const L = V
    ? { left: 70, top: [820, 200], scale: 0.62, size: 124, line: 318, lineW: 940, rows: [400, 790, 1180] }
    : { left: 150, top: [380, 130], scale: 0.46, size: 190, line: 262, lineW: 1620, rows: [320, 500, 680] };
  return (
    <AbsoluteFill>
      <TiledBg />
      <div style={{ position: 'absolute', left: L.left, top: interpolate(up, [0, 1], L.top), transform: `scale(${interpolate(up, [0, 1], [1, L.scale])})`, transformOrigin: 'left top', width: 1700 }}>
        <Kinetic words={words('honest')} size={L.size} energetic align="left" whole emphasis={['honest.']} style={{ height: L.size * 1.16 }} />
      </div>
      {f >= S.d1.from - 1 && <div style={{ position: 'absolute', left: L.left, top: L.line, width: interpolate(up, [0, 1], [0, L.lineW]), height: 3, background: C.line }} />}
      <Row id="d1" n="01" top={L.rows[0]} emoji="🧮" next={S.d2.from} />
      <Row id="d2" n="02" top={L.rows[1]} emoji="💬" next={S.d3.from} />
      <Row id="d3" n="03" top={L.rows[2]} emoji="😬" />
    </AbsoluteFill>
  );
};

// ── 7. The turn ───────────────────────────────────────────────────────────────────────────────
export const Turn: React.FC = () => {
  const { V } = useLayout();
  return (
    <AbsoluteFill>
      <TiledBg />
      <AbsoluteFill style={{ justifyContent: 'center' }}>
        <Kinetic words={words('turn')} size={V ? 160 : 170} energetic whole maxWidth={V ? 960 : 1840} emphasis={['change.']} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── 8. Reveal, on a marigold flood ────────────────────────────────────────────────────────────
export const Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const { V } = useLayout();
  const w = words('reveal');
  const logo = useSpring(wf(w[0]) - 2, { damping: 11, stiffness: 190 });
  const mark = useSpring(wf(w[1]) - 1, { damping: 14, stiffness: 190 });
  const press = interpolate(f - cues.revealClick, [-2, 0, 5], [1, 0.9, 1], clamp);
  const logoEl = <div style={{ transform: `scale(${logo * press}) rotate(${(1 - logo) * -90}deg)` }}><Logo size={V ? 280 : 240} /></div>;
  const markEl = <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: V ? 180 : 200, letterSpacing: '-0.045em', color: C.ink, opacity: mark, transform: `translate${V ? 'Y' : 'X'}(${(1 - mark) * 60}px)` }}>Split-Up</div>;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, #f7b52e 0%, ${C.marigold} 60%, #e89600 100%)` }}>
      <div style={{ position: 'absolute', top: V ? 550 : 350, left: 0, right: 0, display: 'flex', flexDirection: V ? 'column' : 'row', justifyContent: 'center', alignItems: 'center', gap: V ? 30 : 44 }}>
        {logoEl}{markEl}
      </div>
      <div style={{ position: 'absolute', top: V ? 1150 : 640, left: 0, right: 0 }}>
        <Kinetic words={w.slice(2)} size={84} whole top={V} maxWidth={V ? 900 : 1560} color={C.ink} style={{ height: V ? 200 : 110 }} />
      </div>
    </AbsoluteFill>
  );
};

// ── 9–14. Product, step by step on real screens (calm: flat, short fades, visible from frame 1) ──
type Step = {
  id: string; from: number; to: number; label: string; screen: string; sheet?: string; scroll?: [number, number];
  callout: { src: string; crop: [number, number, number, number]; width: number; dy?: number; marks?: { box: [number, number, number, number]; at: number }[] };
  words: Word[];
};
const fr = S.friends.from, swap = cues.friendsSwap;
const STEPS: Step[] = [
  { id: 'items', from: S.items.from, to: S.vat.from, label: 'Itemized bills', screen: 'expense-itemized.png', scroll: [700, 1050],
    callout: { src: 'expense-itemized.png', crop: [58, 1283, 1229, 2140], width: 640 }, words: words('items') },
  { id: 'vat', from: S.vat.from, to: S.modes.from, label: 'Service charge + VAT', screen: 'expense-itemized.png', scroll: [2300, 2480],
    callout: { src: 'expense-itemized.png', crop: [58, 3170, 1229, 3880], width: 660, marks: [
      { box: [0.012, 0.135, 0.988, 0.345], at: S.vat.from + 4 },
      { box: [0.012, 0.54, 0.988, 0.935], at: wf(find('vat', 'shared')) } ] }, words: words('vat') },
  { id: 'modes', from: S.modes.from, to: S.live.from, label: '5 ways to split', screen: 'expense-equal.png', scroll: [0, 0],
    callout: { src: 'expense-equal.png', crop: [61, 1020, 1229, 1890], width: 620, marks: [{ box: [0.006, 0.004, 0.994, 0.152], at: S.modes.from + 4 }] }, words: words('modes') },
  { id: 'live', from: S.live.from, to: S.settle.from, label: 'Live balances', screen: 'group-balances.png', scroll: [0, 0],
    callout: { src: 'group-balances.png', crop: [49, 1118, 1241, 1640], width: 680 }, words: words('live') },
  { id: 'settle', from: S.settle.from, to: fr, label: 'Settle up', screen: 'group.png', sheet: 'settle-form.png',
    callout: { src: 'settle-form.png', crop: [40, 240, 1250, 1060], width: 640, marks: [{ box: [0.02, 0.66, 0.98, 0.97], at: wf(find('settle', 'esewa')) - 2 }] }, words: words('settle') },
  { id: 'friends', from: fr, to: swap, label: 'Friends in one scan', screen: 'friends.png', sheet: 'friend-qr.png',
    callout: { src: 'friend-qr.png', crop: [61, 440, 1230, 1750], width: 470 }, words: words('friends') },
  { id: 'nepali', from: swap, to: S.result.from, label: 'English & नेपाली', screen: 'home-ne.png',
    callout: { src: 'home-ne.png', crop: [42, 60, 1244, 1040], width: 600 }, words: words('friends') },
];

/** Product layout: landscape = text left, phone centre, magnifier right; vertical = text on top, big phone, magnifier over its lower half. */
const useProductLayout = () => {
  const { H, V } = useLayout();
  const ps = V ? 1.14 : 1; // phone scale
  const phoneTop = V ? 680 : Math.round((H - PHONE_H) / 2);
  return {
    V, ps,
    phone: { x: V ? (1080 - PHONE.w) / 2 : 770, y: phoneTop - (PHONE_H * (1 - ps)) / 2 }, // scale is about the centre
    text: V ? { x: 70, y: 245, w: 900, size: 60, h: 250 } : { x: 130, y: 250, w: 600, size: 68, h: 430 },
    // Magnifier: vertical cards are capped at 820 wide / 660 tall, centred on (520, 1250), clear of the button rail.
    callout: (c: Step['callout']) => {
      const ar = (c.crop[3] - c.crop[1]) / (c.crop[2] - c.crop[0]);
      const width = V ? Math.min(820, 660 / ar) : c.width;
      const h = ar * width + 20;
      return { width, x: V ? 520 - (width + 20) / 2 : 1150, y: (V ? 1250 : 540) - h / 2 + (c.dy ?? 0) };
    },
  };
};

export const Product: React.FC = () => {
  const f = useCurrentFrame();
  const L = useProductLayout();
  let i = 0;
  STEPS.forEach((s, k) => { if (f >= s.from - 3) i = k; });
  const step = STEPS[i];
  const prev = i > 0 && f < step.from + 4 ? STEPS[i - 1] : null;
  const fadeIn = (s: Step) => (s === STEPS[0] ? 1 : ease(f, [s.from - 3, s.from + 3], [0, 1]));
  const scrollOf = (s: Step) => (s.scroll ? ease(f, [s.from, s.to], s.scroll, Easing.inOut(Easing.sin)) : 0);
  const stepNo = step.id === 'nepali' ? 6 : i + 1;
  const T = L.text;
  const center = L.V;
  return (
    <AbsoluteFill>
      <TiledBg />
      {/* text: step label, caption, progress */}
      <div style={{ position: 'absolute', left: T.x, top: T.y, width: T.w }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', gap: 14, fontFamily: F.body, fontWeight: 700, fontSize: center ? 34 : 28, color: C.ink }}>
          <span style={{ background: C.marigold, color: C.ink, borderRadius: 999, padding: '6px 16px', fontSize: center ? 30 : 24 }}>0{stepNo}</span>
          <span style={{ opacity: fadeIn(step) }}>{step.label}</span>
        </div>
        <div style={{ position: 'relative', height: T.h, marginTop: center ? 18 : 26 }}>
          {(prev && prev.words !== step.words ? [prev, step] : [step]).map((s) => (
            <div key={s.words[0].start} style={{ position: 'absolute', inset: 0, opacity: s.words === prev?.words ? (s === step ? 1 : 1 - fadeIn(step)) : fadeIn(s) }}>
              <Kinetic words={s.words} size={T.size} whole top={center} align={center ? 'center' : 'left'} maxWidth={T.w} style={{ height: T.h, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: center ? 10 : 30, justifyContent: center ? 'center' : 'flex-start' }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} style={{ height: 8, width: n === stepNo ? 64 : 22, borderRadius: 8, background: n <= stepNo ? C.marigold : C.line }} />
          ))}
        </div>
      </div>
      {/* phone with the real screen */}
      <Phone x={L.phone.x} y={L.phone.y} scale={L.ps}>
        {prev && <Screen src={prev.screen} sheet={prev.sheet} scrollY={scrollOf(prev)} />}
        <Screen src={step.screen} sheet={step.sheet} scrollY={scrollOf(step)} opacity={fadeIn(step)} />
      </Phone>
      {/* magnified crop of the same screen */}
      {[prev, step].filter(Boolean).map((s) => {
        const c = s!.callout;
        const box = L.callout(c);
        const o = s === step ? fadeIn(step) : 1 - fadeIn(step);
        const push = interpolate(f, [s!.from, s!.to], [1, 1.025], clamp);
        return (
          <Callout key={s!.id} src={c.src} crop={c.crop} width={box.width} x={box.x} y={box.y} opacity={o} scale={push}>
            {c.marks?.map((m, k) => {
              const next = c.marks![k + 1]?.at;
              const mk = ease(f, [m.at, m.at + 8], [0, 1]) * (next ? ease(f, [next, next + 6], [1, 0]) : 1);
              const [x0, y0, x1, y1] = m.box;
              return <div key={k} style={{ position: 'absolute', left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%`,
                border: `5px solid ${C.marigold}`, borderRadius: 16, opacity: mk, transform: `scale(${1.06 - 0.06 * mk})` }} />;
            })}
          </Callout>
        );
      })}
    </AbsoluteFill>
  );
};

// ── 15. The result ────────────────────────────────────────────────────────────────────────────
export const Result: React.FC = () => {
  const f = useCurrentFrame();
  const { H, V } = useLayout();
  const r = S.result;
  const fadeIn = ease(f, [r.from - 4, r.from + 4], [0, 1]);
  const t = ease(f, [r.from + 4, cues.squareAt - 2], [0, 1], Easing.inOut(Easing.cubic));
  const amount = Math.round(1765 * (1 - t));
  const done = useSpring(cues.squareAt - 1, { damping: 10, stiffness: 180 });
  const numPop = useSpring(r.from, { damping: 12, stiffness: 160 });
  const cardIn = ease(f, [r.from + 6, r.from + 14], [0, 1]);
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <TiledBg />
      <div style={{ position: 'absolute', left: V ? 90 : 130, top: V ? 225 : 170 }}>
        <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: V ? 38 : 34, color: C.muted, letterSpacing: '0.02em' }}>Left to chase after momo night</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${0.8 + 0.2 * numPop})`, transformOrigin: 'left center' }}>
          <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 230, letterSpacing: '-0.05em', color: C.ink, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>
            रु {amount.toLocaleString('en-IN')}
          </div>
          <div style={{ width: 150, height: 150, borderRadius: '50%', background: C.marigold, display: 'grid', placeItems: 'center', transform: `scale(${done}) rotate(${(1 - done) * -120}deg)` }}>
            <svg width="86" height="86" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={C.ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: V ? 90 : 130, top: V ? 560 : 540, width: V ? 900 : 820 }}>
        <Kinetic words={words('result')} size={V ? 84 : 74} energetic whole top={V} align="left" maxWidth={V ? 900 : 820} emphasis={['square', 'again.']} style={{ height: 300 }} />
      </div>
      <Phone x={V ? (1080 - PHONE.w) / 2 : 1330} y={V ? 930 : Math.round((H - PHONE_H) / 2)}>
        <Screen src="activity.png" />
      </Phone>
      <Callout src="activity.png" crop={[49, 510, 1241, 915]} width={V ? 800 : 560} x={V ? 100 : 1010} y={V ? 1250 : 690} opacity={cardIn} />
    </AbsoluteFill>
  );
};

// ── 16. CTA, on a marigold flood ──────────────────────────────────────────────────────────────
export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { H, V } = useLayout();
  const w = words('cta');
  const line = (a: number, b: number, color: string) => (
    <Kinetic words={w.slice(a, b)} size={V ? 132 : 150} energetic whole align="left" color={color} maxWidth={V ? 960 : 1100} style={{ height: V ? 142 : 160 }} />
  );
  const free = w.find((x) => x.text.toLowerCase().startsWith('free'))!;
  const url = w[w.findIndex((x) => x.text.toLowerCase() === 'at') + 1];
  const pFree = useSpring(wf(free) - 1, { damping: 13 });
  const pUrl = useSpring(wf(url) - 1, { damping: 12, stiffness: 200 });
  const phone = useSpring(cues.ctaClick + 8, { damping: 18, stiffness: 110 });
  const left = V ? 80 : 130;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 40%, #f7b52e 0%, ${C.marigold} 55%, #e89600 100%)` }}>
      <div style={{ position: 'absolute', left, top: V ? 210 : 110, display: 'flex', alignItems: 'center', gap: 22 }}>
        <Logo size={84} />
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 64, letterSpacing: '-0.04em', color: C.ink }}>Split-Up</span>
      </div>
      <div style={{ position: 'absolute', left, top: V ? 350 : 250, width: V ? 960 : 1150 }}>
        {line(0, 2, C.ink)}
        {line(2, 4, C.paper)}
        {line(4, 6, C.ink)}
      </div>
      <div style={{ position: 'absolute', left, top: V ? 820 : 790, display: 'flex', flexDirection: V ? 'column' : 'row', alignItems: V ? 'flex-start' : 'center', gap: 22 }}>
        <div style={{ transform: `scale(${pUrl})`, transformOrigin: 'left center', background: C.ink, color: C.paper, fontFamily: F.display, fontWeight: 700, fontSize: 56, letterSpacing: '-0.02em', padding: '22px 44px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 20 }}>
          splitup.thimitech.com <span style={{ color: C.marigold }}>→</span>
        </div>
        <Pill style={{ opacity: pFree, transform: `translateY(${(1 - pFree) * 20}px)`, background: C.paper, border: 'none', fontSize: 30 }}>Free · English & नेपाली</Pill>
      </div>
      {/* Vertical: the phone peeks up from the bottom edge. */}
      <div style={{ opacity: phone, transform: `translateY(${(1 - phone) * 300}px)` }}>
        <Phone x={V ? (1080 - PHONE.w) / 2 : 1330} y={V ? 1100 : Math.round((H - PHONE_H) / 2)}>
          <Screen src="login.png" />
        </Phone>
      </div>
    </AbsoluteFill>
  );
};

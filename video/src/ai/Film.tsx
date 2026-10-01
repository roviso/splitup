import React from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import tl from './timeline.json';
import { getCues } from './cues.js';
import { C, F } from '../theme';
import { Flood, Kinetic, Logo, Pill, TiledBg, Word, ease, useSpring, wf } from '../kit';
import {
  AndroidBrowser, Bubble, Card, Crop, HomeScreen, IosBrowser, Phone, Receipt, Ring, Shot, Tap, TapBox, Typing,
  androidTaps, phoneH, useBox, useLayout, usePhone, iosTaps,
} from './parts';

const cues = getCues(tl);
const S = cues.S as Record<string, (typeof tl.shots)[number]>;
const words = (id: string) => S[id].words as Word[];
const at = (id: string, t: string) => cues.wordFrame(id, t);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const AV: [string, string][] = [['R', '#12879f'], ['A', '#e0461b'], ['B', '#c8235f'], ['SP', '#e04e14'], ['S', '#8e4fc9']];
const ASSIGN = 'Binisha and I had the beers, Sagar had the chowmein, everyone shared the rest. I paid.';
const CHAT = 'hijo Aayush ra Binisha sanga momo, 1,350, I paid';

const Avatar: React.FC<{ i: number; size: number; style?: React.CSSProperties }> = ({ i, size, style }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: AV[i][1], color: '#fff', display: 'grid', placeItems: 'center', fontFamily: F.body,
    fontWeight: 800, fontSize: size * 0.36, border: `${size * 0.06}px solid ${C.paper}`, boxShadow: '0 12px 24px -10px rgba(60,40,10,.4)', ...style }}>{AV[i][0]}</div>
);

/** Emoji prop that springs in on a word and bobs. */
const Prop: React.FC<{ at: number; x: number; y: number; size: number; children: string; tilt?: number; out?: number }> = ({ at: a, x, y, size, children, tilt = -8, out }) => {
  const f = useCurrentFrame();
  const s = useSpring(a, { damping: 9, stiffness: 200, mass: 0.6 });
  if (f < a) return null;
  const o = out ? ease(f, [out, out + 6], [1, 0]) : 1;
  return <div style={{ position: 'absolute', left: x, top: y, fontFamily: F.emoji, fontSize: size, lineHeight: 1, opacity: o,
    transform: `translateY(${Math.sin((f - a) / 9) * 8 - (1 - o) * 120}px) scale(${s}) rotate(${(1 - s) * 40 + tilt}deg)` }}>{children}</div>;
};

const CameraButton: React.FC<{ size: number; press?: number }> = ({ size, press = 1 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: C.marigold, display: 'grid', placeItems: 'center', transform: `scale(${press})`,
    boxShadow: '0 30px 60px -20px rgba(242,160,7,.7)' }}>
    <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2.2" strokeLinejoin="round">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.6" />
    </svg>
  </div>
);

// ── 1–3. Opening: the bill arrives, the maths begins, the calculator goes away ───────────────
const TURN_BTN = (W: number, H: number, V: boolean) => ({ x: W / 2, y: V ? H * 0.66 : H * 0.76 });

const Opening: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, V } = useLayout();
  const sad = S.sad.from, turn = S.turn.from;
  const grey = ease(f, [sad, sad + 14], [0, 0.85]) * ease(f, [cues.shutter - 10, cues.shutter], [1, 0]);

  // The receipt: drops on "bill", unrolls, then moves aside for the maths.
  const rw = V ? 560 : 500;
  const drop = spring({ frame: f - cues.billDrop, fps, config: { damping: 12, stiffness: 170, mass: 0.9 } });
  const unroll = ease(f, [cues.billDrop + 3, sad + 8], [0.18, 1], Easing.out(Easing.cubic));
  const aside = ease(f, [sad - 2, sad + 10], [0, 1], Easing.inOut(Easing.cubic));
  const [cx, cy] = V ? [(W - rw) / 2, 380] : [(W - rw) / 2, 90];
  const [ax, ay] = V ? [60, 150] : [140, 70];
  const rx = interpolate(aside, [0, 1], [cx, ax]);
  const ry = interpolate(drop, [0, 1], [-1600, V ? interpolate(aside, [0, 1], [cy, ay]) : cy]) - (V ? 0 : 0);
  const rScale = interpolate(aside, [0, 1], [1, V ? 0.72 : 0.94]);
  const away = ease(f, [cues.calcAway - 1, cues.calcAway + 7], [0, 1], Easing.in(Easing.cubic));
  const markIdx = [cues.chips[0], cues.chips[1], cues.chips[2], cues.chips[3]].reduce((m, c, i) => (f >= c ? [3, 2, 6, 7][i] : m), -1);

  // Hook text leaves as the bill lands.
  const hookOut = ease(f, [cues.billDrop - 2, cues.billDrop + 6], [0, 1], Easing.in(Easing.cubic));
  const calm = f < sad;

  // Chips fly out of the bill, one per worry.
  const chipTexts = ['🍺  Everest Beer ×2 · who?', '🍜  Chicken Chowmein · ???', '+10% service charge', '+13% VAT on top'];
  const chip = (i: number) => {
    const a = cues.chips[i];
    const s = spring({ frame: f - a, fps, config: { damping: 12, stiffness: 190, mass: 0.7 } });
    if (f < a) return null;
    const wob = i === 1 ? Math.sin((f - a) / 2.2) * 4 * ease(f, [a, a + 30], [1, 0.3]) : 0;
    const [tx, ty] = V ? [520, 210 + i * 150] : [780 + (i % 2) * 540, 560 + Math.floor(i / 2) * 150];
    const fx = rx + rw * 0.5, fy = ry + 300;
    return (
      <div key={i} style={{ position: 'absolute', left: interpolate(s, [0, 1], [fx, tx]), top: interpolate(s, [0, 1], [fy, ty]), transform: `scale(${0.3 + 0.7 * s}) rotate(${(1 - s) * 20 + wob + (i % 2 ? 2 : -2)}deg)`,
        transformOrigin: 'left center', background: i >= 2 ? C.ink : C.surface, color: i >= 2 ? C.marigold : C.ink, border: `2px solid ${i >= 2 ? C.ink : C.line}`,
        borderRadius: 999, padding: '18px 32px', fontFamily: F.body, fontWeight: 800, fontSize: V ? 32 : 36, whiteSpace: 'nowrap', boxShadow: '0 24px 40px -24px rgba(60,40,10,.5)' }}>
        {chipTexts[i]}
      </div>
    );
  };

  // The calculator: slides up on "calculator", jams, then gets swiped away.
  const calcS = spring({ frame: f - cues.calcIn, fps, config: { damping: 14, stiffness: 160 } });
  const cw = V ? 720 : 600;
  const jam = Math.floor(f / 4) % 2;
  const calc = f >= cues.calcIn && (
    <AbsoluteFill style={{ background: `rgba(27,26,23,${0.3 * calcS * (1 - away)})` }}>
      <div style={{ position: 'absolute', left: (W - cw) / 2, top: interpolate(calcS, [0, 1], [H + 50, (H - cw * 1.05) / 2]), width: cw, height: cw * 1.05, borderRadius: 48, background: '#2b2a27',
        padding: cw * 0.06, transform: `translateX(${-away * (W + cw)}px) rotate(${-away * 25 + (1 - calcS) * 8}deg)`, boxShadow: '0 60px 100px -40px rgba(0,0,0,.6)' }}>
        <div style={{ background: '#cfd6c2', borderRadius: 22, padding: '24px 30px', fontFamily: '"Courier New", monospace', color: '#1d2418', textAlign: 'right' }}>
          <div style={{ fontSize: cw * 0.052, opacity: 0.7 }}>2780 × 1.1 × 1.13 ÷ 5 − 🍺?</div>
          <div style={{ fontSize: cw * 0.13, fontWeight: 800, transform: `translateX(${jam ? 4 : -4}px)` }}>{jam ? '= ???' : 'Err'}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: cw * 0.03, marginTop: cw * 0.05 }}>
          {['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '.', '='].map((k) => (
            <div key={k} style={{ height: cw * 0.11, borderRadius: 18, background: '=÷×−'.includes(k) ? '#8a857b' : '#45433e', color: '#f4efe6', display: 'grid', placeItems: 'center', fontFamily: F.body, fontWeight: 700, fontSize: cw * 0.055 }}>{k}</div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );

  // "Put the calculator away." and the camera button that replaces it.
  const btn = TURN_BTN(W, H, V);
  const btnS = spring({ frame: f - (at('turn', 'away') + 1), fps, config: { damping: 10, stiffness: 200 } });
  const press = interpolate(f - cues.shutter, [-3, 0, 3], [1, 0.86, 1.1], clamp);
  const sadOut = ease(f, [turn - 2, turn + 6], [0, 1]);

  return (
    <AbsoluteFill>
      <TiledBg grey={grey} />
      {calm && (
        <AbsoluteFill style={{ opacity: 1 - hookOut, transform: `scale(${1 - 0.15 * hookOut})` }}>
          <Prop at={at('hook', 'momo') - 1} x={V ? 110 : 190} y={V ? 250 : 130} size={V ? 200 : 210}>🥟</Prop>
          <Prop at={at('hook', 'laughs') - 1} x={V ? 790 : 1540} y={V ? 300 : 150} size={V ? 180 : 200} tilt={10}>😂</Prop>
          <AbsoluteFill style={{ justifyContent: 'center', padding: V ? '0 60px' : 0 }}>
            <Kinetic words={words('hook').slice(0, 8)} size={V ? 124 : 150} energetic maxWidth={V ? 960 : 1560} emphasis={['perfect.', 'Momo,', 'gang.']} style={{ height: V ? 700 : 420 }} />
          </AbsoluteFill>
          {AV.map((_, i) => {
            const s = spring({ frame: f - (at('hook', 'whole') + i * 3), fps, config: { damping: 9, stiffness: 220, mass: 0.6 } });
            const n = AV.length, size = V ? 150 : 140;
            const x = W / 2 + (i - (n - 1) / 2) * size * 1.15 - size / 2;
            const y = (V ? 1430 : 820) - Math.sin(((i + 0.5) / n) * Math.PI) * 40;
            return f >= at('hook', 'whole') + i * 3 ? <Avatar key={i} i={i} size={size} style={{ position: 'absolute', left: x, top: y + (1 - s) * 200 + Math.sin((f + i * 7) / 8) * 6, transform: `scale(${s})` }} /> : null;
          })}
        </AbsoluteFill>
      )}
      {f < turn + 8 && (
        <AbsoluteFill style={{ opacity: 1 - sadOut }}>
          {f >= cues.billDrop - 1 && (
            <div style={{ position: 'absolute', left: rx, top: ry, transformOrigin: 'top left', transform: `scale(${rScale}) rotate(${-4 + 2 * aside}deg)` }}>
              <Receipt w={rw} reveal={unroll} mark={markIdx} grey={grey * 0.4} />
            </div>
          )}
          {f >= at('hook', 'then') && f < sad + 4 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 170 : 820, opacity: ease(f, [sad - 2, sad + 3], [1, 0]) }}>
              <Kinetic words={words('hook').slice(8)} size={V ? 110 : 110} energetic maxWidth={V ? 960 : 1700} emphasis={['bill', 'arrived.']} style={{ height: 140 }} />
            </div>
          )}
          {!calm && (
            <div style={{ position: 'absolute', left: V ? 60 : 780, top: V ? 1240 : 110, width: V ? 960 : 1060, opacity: ease(f, [cues.calcIn, cues.calcIn + 6], [1, 0.25]) }}>
              <Kinetic words={words('sad')} size={V ? 84 : 76} energetic align={V ? 'center' : 'left'} maxWidth={V ? 960 : 1060} color="#3b3833"
                emphasis={['beers,', 'chowmein', 'nobody', 'ten', 'thirteen', 'VAT...', 'calculator.']} style={{ height: V ? 460 : 400 }} />
            </div>
          )}
          {!calm && [0, 1, 2, 3].map(chip)}
        </AbsoluteFill>
      )}
      {calc}
      {f >= turn - 1 && (
        <AbsoluteFill>
          <AbsoluteFill style={{ justifyContent: 'center', padding: V ? '0 60px' : 0, transform: `translateY(${V ? -140 : -90}px)` }}>
            <Kinetic words={words('turn')} size={V ? 130 : 170} energetic whole maxWidth={V ? 960 : 1800} emphasis={['away.']} style={{ height: V ? 340 : 220 }} />
          </AbsoluteFill>
          {f >= at('turn', 'away') + 1 && (
            <div style={{ position: 'absolute', left: btn.x - 90, top: btn.y - 90, transform: `scale(${btnS})` }}><CameraButton size={180} press={press} /></div>
          )}
          <Tap at={cues.shutter} x={btn.x} y={btn.y} size={80} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

// ── 4. Reveal on a marigold flood ─────────────────────────────────────────────────────────────
const Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const { W, V } = useLayout();
  const w = words('reveal');
  const up = useSpring(at('reveal', 'ai') - 2, { damping: 18, stiffness: 110 });
  const pw = V ? 520 : 440;
  const sparkle = useSpring(at('reveal', 'smart') - 2, { damping: 8, stiffness: 200 });
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${V ? '50% 30%' : '30% 45%'}, #f7b52e 0%, ${C.marigold} 58%, #e89600 100%)` }}>
      <div style={{ position: 'absolute', left: V ? 60 : 130, top: V ? 170 : 200, width: V ? 960 : 1000 }}>
        <Kinetic words={w.slice(0, 4)} size={V ? 84 : 92} energetic whole align={V ? 'center' : 'left'} maxWidth={V ? 960 : 1120} color={C.ink} emphasis={['AI.']} accent={C.paper} style={{ height: V ? 110 : 110 }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: V ? 'center' : 'flex-start', gap: 24, marginTop: V ? 30 : 50 }}>
          <span style={{ fontFamily: F.emoji, fontSize: V ? 110 : 140, transform: `scale(${sparkle}) rotate(${(1 - sparkle) * -90}deg)`, display: 'inline-block' }}>{f >= at('reveal', 'smart') - 2 ? '✨' : ''}</span>
          <Kinetic words={w.slice(4)} size={V ? 130 : 150} energetic whole top align={V ? 'center' : 'left'} maxWidth={V ? 820 : 950} color={C.ink} emphasis={['Smart', 'Split.']} accent={C.paper} style={{ height: V ? 300 : 340, flex: 1 }} />
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - up) * 1100}px)` }}>
        <Phone x={V ? (W - pw) / 2 : 1300} y={V ? 800 : 67} w={pw}>
          <Shot src="home" />
          <Ring box="aiBar" at={at('reveal', 'meet')} pad={4} />
        </Phone>
      </div>
    </AbsoluteFill>
  );
};

// ── 5–12. Product: calm, flat, real screens ───────────────────────────────────────────────────
const useProductLayout = () => {
  const { W, H, V } = useLayout();
  const pw = V ? 500 : 440;
  const ph = phoneH(pw);
  const bezel = Math.round(pw * 0.03);
  return {
    V, W, H, pw, ph, bezel, sw: pw - 2 * bezel,
    px: V ? (W - pw) / 2 : 790, py: V ? 690 : Math.round((H - ph) / 2),
    cap: V ? { x: 60, y: 150, w: 960, size: 66, h: 330 } : { x: 120, y: 280, w: 610, size: 62, h: 380 },
    side: V ? { x: 520, w: 500 } : { x: 1290, w: 520 },
  };
};

const PRODUCT = ['snap', 'read', 'say', 'shares', 'chat', 'save', 'credits', 'invite'];
const LABEL: Record<string, string> = {
  snap: 'Snap the bill', read: 'AI reads it', say: 'Say who had what', shares: 'Split to the paisa', chat: 'Or just type it',
  save: 'Live for everyone', credits: '5 free every month', invite: 'Invite friends', bonus: '+5 for both of you', soon: 'Get the app',
  android: 'Android · Chrome', iphone: 'iPhone · Safari',
};

/** Label pill + the spoken line, crossfading between shots. */
const Caption: React.FC<{ ids: string[]; x: number; y: number; w: number; size: number; h: number; center?: boolean; dots?: boolean }> = ({ ids, x, y, w, size, h, center, dots }) => {
  const f = useCurrentFrame();
  let i = 0;
  ids.forEach((id, k) => { if (f >= S[id].from - 3) i = k; });
  const fadeIn = (k: number) => (k === 0 ? 1 : ease(f, [S[ids[k]].from - 3, S[ids[k]].from + 3], [0, 1]));
  const show = i > 0 && f < S[ids[i]].from + 4 ? [i - 1, i] : [i];
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w }}>
      {show.map((k) => {
        const o = k === i ? fadeIn(k) : 1 - fadeIn(i);
        return (
          <div key={k} style={{ position: 'absolute', inset: 0, opacity: o }}>
            <div style={{ display: 'flex', justifyContent: center ? 'center' : 'flex-start' }}>
              <span style={{ background: C.marigold, color: C.ink, borderRadius: 999, padding: '10px 26px', fontFamily: F.body, fontWeight: 800, fontSize: size * 0.5 }}>{LABEL[ids[k]]}</span>
            </div>
            <div style={{ marginTop: size * 0.4 }}>
              <Kinetic words={words(ids[k])} size={size} whole top align={center ? 'center' : 'left'} maxWidth={w} style={{ height: h, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }} />
            </div>
          </div>
        );
      })}
      {dots && (
        <div style={{ position: 'absolute', top: h + size * 1.3, display: 'flex', gap: 10, width: w, justifyContent: center ? 'center' : 'flex-start' }}>
          {ids.map((_, n) => <div key={n} style={{ height: 8, width: n === i ? 64 : 22, borderRadius: 8, background: n <= i ? C.marigold : C.line }} />)}
        </div>
      )}
    </div>
  );
};

const SCREENS: [string, number][] = [
  ['group-start', cues.productIn - 4],
  ['reading-1', S.read.from],
  ['reading-2', at('read', 'service') - 2],
  ['reading-3', at('read', 'even')],
  ['scanned', S.say.from],
  ['assigned', cues.sendTap + 8],
  ['assigned-bottom', at('shares', 'paisa') - 8],
  ['home', S.chat.from],
  ['chat-draft', at('chat', 'text') + 12],
  ['assigned-bottom', S.save.from],
  ['group', cues.toGroup],
  ['credits', S.credits.from],
];

/** Screens crossfade in 5 frames; overlays (taps, typing, rings) are drawn on the real screen. */
const ProductScreen: React.FC = () => {
  const f = useCurrentFrame();
  const { sw } = usePhone();
  let i = 0;
  SCREENS.forEach(([, a], k) => { if (f >= a) i = k; });
  const cur = SCREENS[i], prev = SCREENS[i - 1];
  const o = ease(f, [cur[1], cur[1] + 5], [0, 1]);
  const flash = interpolate(f - cues.uploadTap - 4, [0, 2, 8], [0, 0.9, 0], clamp);
  const toast = spring({ frame: f - cues.toGroup - 2, fps: 30, config: { damping: 15, stiffness: 180 } });
  return (
    <>
      {prev && o < 1 && <Shot src={prev[0]} />}
      <Shot src={cur[0]} opacity={o} />
      {cur[0] === 'group-start' && <TapBox at={cues.uploadTap} box="upload" />}
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      {cur[0] === 'scanned' && <Typing box="composer" text={ASSIGN} from={S.say.from + 2} to={cues.sendTap - 4} />}
      {cur[0] === 'scanned' && <TapBox at={cues.sendTap} box="composer" fx={0.93} />}
      {cur[0] === 'assigned-bottom' && f < S.chat.from && <Ring box="shareList" at={at('shares', 'paisa') - 2} out={at('shares', 'checked') - 3} />}
      {cur[0] === 'assigned-bottom' && f < S.chat.from && <Ring box="matches" at={at('shares', 'checked') - 2} />}
      {cur[0] === 'home' && <Typing box="aiInput" text={CHAT} from={at('chat', 'just')} to={at('chat', 'text')} pad={0} />}
      {cur[0] === 'home' && <TapBox at={at('chat', 'text') + 6} box="aiBar" fx={0.93} />}
      {(cur[0] === 'assigned-bottom' || cur[0] === 'group') && f >= S.save.from && <TapBox at={cues.saveTap} box="save" />}
      {cur[0] === 'group' && (
        <>
          <div style={{ position: 'absolute', left: sw * 0.2, right: sw * 0.2, top: sw * 0.06 + (1 - toast) * -sw * 0.3, background: C.ink, color: C.paper, borderRadius: 999,
            padding: `${sw * 0.03}px 0`, textAlign: 'center', fontFamily: F.body, fontWeight: 700, fontSize: sw * 0.042, boxShadow: '0 12px 30px rgba(0,0,0,.25)' }}>
            Expense added ✓
          </div>
          <Ring box="liveSync" at={at('save', 'live') - 4} pad={8} />
        </>
      )}
      {cur[0] === 'credits' && f < S.invite.from && <Ring box="creditDots" at={at('credits', 'five') - 2} pad={10} />}
      {cur[0] === 'credits' && <Ring box="inviteCode" at={at('invite', 'invite')} pad={6} />}
      {cur[0] === 'credits' && <TapBox at={cues.shareTap} box="shareInvite" />}
    </>
  );
};

/** Bill photo with the parts the AI reads, highlighted on the words that name them (bill px). */
const BILL_CROP: [number, number, number, number] = [120, 290, 790, 1110];
const BILL_MARKS: { box: [number, number, number, number]; at: number; label: string }[] = [
  { box: [176, 612, 722, 786], at: at('read', 'item'), label: '5 items ✓' },
  { box: [182, 804, 724, 852], at: at('read', 'service'), label: 'Service 10% ✓' },
  { box: [182, 860, 726, 908], at: at('read', 'vat'), label: 'VAT 13% ✓' },
  { box: [170, 524, 390, 574], at: at('read', 'nepali'), label: '2083/06/14 B.S. → 30 Sep ✓' },
];
const BillCard: React.FC<{ w: number; marks?: boolean }> = ({ w, marks }) => {
  const f = useCurrentFrame();
  const k = w / (BILL_CROP[2] - BILL_CROP[0]);
  return (
    <Crop src="bill-photo" ext="jpg" crop={BILL_CROP} w={w}>
      {marks && BILL_MARKS.map((m, i) => {
        const o = ease(f, [m.at - 2, m.at + 6], [0, 1]);
        const [x0, y0, x1, y1] = m.box;
        const left = (x0 - BILL_CROP[0]) * k, top = (y0 - BILL_CROP[1]) * k;
        return (
          <div key={i} style={{ position: 'absolute', left, top, width: (x1 - x0) * k, height: (y1 - y0) * k, border: `4px solid ${C.marigold}`, borderRadius: 10,
            background: 'rgba(242,160,7,.12)', opacity: o, transform: `rotate(-2.2deg) scale(${1.06 - 0.06 * o})` }}>
            <span style={{ position: 'absolute', right: -6, top: -34, background: C.ink, color: C.marigold, fontFamily: F.body, fontWeight: 800, fontSize: 21, padding: '4px 12px', borderRadius: 999, whiteSpace: 'nowrap' }}>{m.label}</span>
          </div>
        );
      })}
    </Crop>
  );
};

const Product: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useProductLayout();
  const { V, px, py, pw, sw, bezel, side } = L;
  const win = (id: string, pre = 3) => f >= S[id].from - pre && f < S[id].from + S[id].frames + 3;
  const fadeWin = (a: number, b: number) => ease(f, [a - 3, a + 3], [0, 1]) * ease(f, [b - 3, b + 3], [1, 0]);
  const k = sw / 412; // CSS px -> screen px

  // Side cards: landscape to the right of the phone, vertical overlapping its lower right.
  const sideY = (h: number) => (V ? 1240 : 540 - h / 2);
  const billW = V ? 420 : 470;
  const billH = billW * ((BILL_CROP[3] - BILL_CROP[1]) / (BILL_CROP[2] - BILL_CROP[0]));
  const intoPhone = ease(f, [cues.uploadTap + 2, cues.uploadTap + 10], [0, 1], Easing.in(Easing.cubic));

  const replyBottom = py + bezel + (733 + 40) * k;
  const shareCrop: [number, number, number, number] = [60, 1020, 1176, 2115];
  const shareW = V ? 460 : 520;

  // Save: the rest of the group gets it live.
  const pops = [1, 2, 3, 4].map((i) => spring({ frame: f - (at('save', 'whole') + (i - 1) * 3), fps, config: { damping: 10, stiffness: 200 } }));

  const dots = [0, 1, 2, 3, 4].map((i) => spring({ frame: f - (at('credits', 'five') + i * 3), fps, config: { damping: 9, stiffness: 220 } }));

  return (
    <AbsoluteFill>
      <TiledBg />
      <Caption ids={PRODUCT} {...L.cap} center={V} dots />
      <Phone x={px} y={py} w={pw}><ProductScreen /></Phone>

      {/* snap: your bill, then into the phone */}
      {f < S.read.from + 4 && (
        <div style={{ position: 'absolute', left: V ? 560 : side.x, top: V ? 1150 : sideY(billH), transformOrigin: 'center',
          opacity: (1 - intoPhone) * ease(f, [cues.productIn, cues.productIn + 6], [0, 1]),
          transform: `translate(${-intoPhone * (V ? 300 : 500)}px, ${intoPhone * (V ? -200 : 0)}px) scale(${1 - 0.6 * intoPhone}) rotate(${3 - 3 * intoPhone}deg)` }}>
          <Card x={0} y={0} w={billW + 24} style={{ position: 'relative' }}><BillCard w={billW} /></Card>
        </div>
      )}
      {/* read: what the AI found */}
      {win('read') && (
        <Card x={V ? 540 : side.x} y={V ? 1130 : sideY(billH)} w={billW + 24} opacity={fadeWin(S.read.from, S.say.from)}><BillCard w={billW} marks /></Card>
      )}
      {/* say: the sentence, typed */}
      {win('say') && (
        <Bubble text={ASSIGN} from={S.say.from + 2} to={cues.sendTap - 4} show={S.say.from} hide={S.shares.from + 6} size={V ? 34 : 32} w={V ? 700 : 560} x={V ? 320 : side.x} y={V ? 1320 : 380} />
      )}
      {/* shares: the split, checked against the bill */}
      {win('shares') && (
        <Card x={V ? 540 : side.x} y={V ? 1180 : sideY(shareW * (1095 / 1116))} w={shareW + 24} opacity={ease(f, [at('shares', 'paisa') - 12, at('shares', 'paisa') - 4], [0, 1]) * ease(f, [S.chat.from - 3, S.chat.from + 3], [1, 0])}>
          <Crop src="assigned-bottom" crop={shareCrop} w={shareW} />
        </Card>
      )}
      {/* chat: typed the way you text; the bubble also covers the reply line */}
      {win('chat') && (
        <>
          <Bubble text={CHAT} from={at('chat', 'just')} to={at('chat', 'text')} show={at('chat', 'just') - 2} hide={S.save.from - 3} size={V ? 34 : 30}
            w={V ? 760 : 600} x={V ? 250 : px + 40} bottom={L.H - replyBottom} />
          <div style={{ position: 'absolute', left: V ? 0 : side.x, right: V ? 0 : undefined, top: V ? 604 : 330, display: 'flex', flexDirection: V ? 'row' : 'column', gap: 16, justifyContent: 'center', alignItems: V ? 'center' : 'flex-start' }}>
            {[['English', 'english'], ['नेपाली', 'nepali'], ['Both ✨', 'both']].map(([t, w]) => {
              const s = spring({ frame: f - at('chat', w) + 1, fps, config: { damping: 11, stiffness: 220 } });
              return <Pill key={w} style={{ opacity: s * ease(f, [S.save.from - 3, S.save.from + 3], [1, 0]), transform: `scale(${s})`, fontSize: V ? 32 : 36, padding: '12px 30px' }}>{t} <span style={{ color: '#1f9d55' }}>✓</span></Pill>;
            })}
          </div>
        </>
      )}
      {/* save: everyone in the group sees it */}
      {win('save') && [1, 2, 3, 4].map((i) => {
        const s = pops[i - 1];
        const x = V ? (i <= 2 ? 120 : 850) : side.x + 40 + ((i - 1) % 2) * 220;
        const y = V ? 860 + ((i - 1) % 2) * 220 : 300 + Math.floor((i - 1) / 2) * 240;
        return f >= at('save', 'whole') + (i - 1) * 3 ? (
          <div key={i} style={{ position: 'absolute', left: x, top: y, transform: `scale(${s})`, opacity: ease(f, [S.credits.from - 3, S.credits.from + 3], [1, 0]) }}>
            <Avatar i={i} size={V ? 110 : 130} />
            <div style={{ position: 'absolute', right: -12, top: -10, width: 48, height: 48, borderRadius: '50%', background: C.marigold, display: 'grid', placeItems: 'center', fontFamily: F.emoji, fontSize: 24 }}>🔔</div>
          </div>
        ) : null;
      })}
      {/* credits: five free a month */}
      {win('credits') && (
        <Card x={V ? 520 : side.x} y={V ? 1240 : 330} w={V ? 500 : 520} opacity={fadeWin(S.credits.from + 2, S.invite.from)} style={{ padding: 34 }}>
          <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 64, letterSpacing: '-0.04em', color: C.ink }}>5 AI bills</div>
          <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 28, color: C.muted, marginTop: 4 }}>free, every month</div>
          <div style={{ display: 'flex', gap: 16, margin: '26px 0' }}>
            {dots.map((s, i) => <div key={i} style={{ width: 58, height: 58, borderRadius: '50%', background: C.marigold, transform: `scale(${s})`, boxShadow: '0 10px 20px -8px rgba(242,160,7,.8)' }} />)}
          </div>
          <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 24, color: C.ink }}>1 credit = 1 bill · fixing it is free</div>
          <div style={{ fontFamily: F.body, fontWeight: 600, fontSize: 24, color: C.muted, marginTop: 6 }}>Renews on the 1st</div>
        </Card>
      )}
      {/* invite: the code, shared */}
      {win('invite', 2) && (() => {
        const s = spring({ frame: f - cues.shareTap - 4, fps, config: { damping: 14, stiffness: 170 } });
        return (
          <Card x={V ? 470 : side.x} y={V ? 1260 : 300} w={V ? 560 : 540} opacity={s} scale={0.85 + 0.15 * s} style={{ padding: 30, background: '#e9f7ee', border: '1px solid #cfe9d8' }}>
            <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: 22, color: '#2d7a4b', marginBottom: 12 }}>Your invite, shared</div>
            <div style={{ background: '#fff', borderRadius: '24px 24px 24px 6px', padding: '20px 24px', fontFamily: F.body, fontWeight: 500, fontSize: 27, lineHeight: 1.35, color: C.ink }}>
              Split bills with me on Split-Up! Sign up with my invite code <b style={{ letterSpacing: '0.06em' }}>VG7U-DX5G</b> and we both get 5 free AI bill scans.
              <div style={{ marginTop: 12, color: '#1a73e8', fontSize: 24 }}>splitup.thimitech.com/add/VG7U-DX5G</div>
            </div>
          </Card>
        );
      })()}
    </AbsoluteFill>
  );
};

// ── 13. Bonus: two phones, +5 each ────────────────────────────────────────────────────────────
const Bonus: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, V } = useLayout();
  const pw = V ? 440 : 400, ph = phoneH(pw);
  const phones = V ? [{ x: 70, y: 650 }, { x: W - 70 - pw, y: 650 }] : [{ x: 760, y: (H - ph) / 2 + 20 }, { x: 1300, y: (H - ph) / 2 + 20 }];
  const inS = spring({ frame: f - S.bonus.from + 2, fps, config: { damping: 18, stiffness: 120 } });
  const never = spring({ frame: f - at('bonus', 'never') + 1, fps, config: { damping: 12, stiffness: 180 } });
  return (
    <AbsoluteFill>
      <TiledBg />
      <Caption ids={['bonus']} {...(V ? { x: 60, y: 150, w: 960, size: 70, h: 380 } : { x: 120, y: 250, w: 580, size: 62, h: 520 })} center={V} />
      {phones.map((p, i) => {
        const s = spring({ frame: f - cues.plusFive - i * 5, fps, config: { damping: 9, stiffness: 200 } });
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - inS) * (i ? 900 : 700)}px)` }}>
              <Phone x={p.x} y={p.y} w={pw}><Shot src={i ? 'invite-landing' : 'credits'} /></Phone>
              <div style={{ position: 'absolute', left: p.x, width: pw, top: p.y - 58, display: 'flex', justifyContent: 'center' }}>
                <Pill style={{ fontSize: 26, padding: '8px 22px' }}>{i ? '🎁 Your friend' : '🙋 You'}</Pill>
              </div>
            </div>
            {f >= cues.plusFive + i * 5 && (
              <div style={{ position: 'absolute', left: p.x + pw / 2 - 90, top: p.y + ph * 0.42 - 90, width: 180, height: 180, borderRadius: '50%', background: C.marigold,
                display: 'grid', placeItems: 'center', fontFamily: F.display, fontWeight: 800, fontSize: 78, color: C.ink, letterSpacing: '-0.04em',
                transform: `scale(${s}) rotate(${(1 - s) * -60}deg)`, boxShadow: '0 30px 60px -20px rgba(242,160,7,.8), 0 0 0 12px rgba(251,247,240,.7)' }}>+5</div>
            )}
          </React.Fragment>
        );
      })}
      {f >= at('bonus', 'never') - 1 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: V ? 1640 : 930, display: 'flex', justifyContent: V ? 'center' : 'flex-start', paddingLeft: V ? 0 : 120, transform: `scale(${never})` }}>
          <Pill style={{ background: C.ink, color: C.paper, border: 'none', fontSize: V ? 40 : 34, padding: '16px 34px' }}>Bonus credits never expire <span style={{ color: C.marigold }}>∞</span></Pill>
        </div>
      )}
    </AbsoluteFill>
  );
};

// ── 14. Payoff: the same bill, now two seconds ────────────────────────────────────────────────
const ShareCard: React.FC<{ w: number }> = ({ w }) => {
  const rows: [string, string][] = [['You', '996.89'], ['Aayush', '313.23'], ['Binisha', '996.89'], ['Sunayana', '313.23'], ['Sagar', '835.30']];
  const fs = w * 0.058;
  return (
    <div style={{ width: w, background: C.ink, padding: `${fs * 1.4}px ${fs * 1.3}px ${fs * 1.8}px`, fontFamily: '"Courier New", monospace', fontSize: fs, lineHeight: 1.7, color: C.paper,
      WebkitMaskImage: `linear-gradient(#000,#000), radial-gradient(circle at 50% 100%, transparent ${w / 70}px, #000 ${w / 70 + 0.5}px)`,
      WebkitMaskSize: `100% calc(100% - ${w / 70}px), ${w / 26}px ${w / 70}px`, WebkitMaskPosition: 'top, bottom', WebkitMaskRepeat: 'no-repeat, repeat-x', borderRadius: '24px 24px 0 0' }}>
      <div style={{ opacity: 0.6, fontSize: fs * 0.75, marginBottom: fs * 0.5 }}>Each share incl. service + VAT</div>
      {rows.map(([n, a]) => <div key={n} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{n}</span><span style={{ color: C.marigold }}>Rs {a}</span></div>)}
      <div style={{ marginTop: fs * 0.6, color: '#7ddc9f', fontFamily: F.body, fontWeight: 700 }}>✓ Matches the bill total</div>
    </div>
  );
};

const Payoff: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { W, H, V } = useLayout();
  const rw = V ? 520 : 460;
  const [rx, ry] = V ? [(W - rw) / 2, 760] : [1180, 110];
  const drop = spring({ frame: f - cues.payoffDrop, fps, config: { damping: 12, stiffness: 180, mass: 0.8 } });
  const flash = interpolate(f - cues.payoffSnap, [0, 2, 7], [0, 0.95, 0], clamp);
  const frame = ease(f, [cues.payoffSnap - 4, cues.payoffSnap], [0, 1]);
  const morph = ease(f, [cues.payoffSay + 12, cues.payoffSquare - 2], [0, 1]);
  const check = spring({ frame: f - cues.payoffSquare + 1, fps, config: { damping: 9, stiffness: 190 } });
  const tea = at('payoff', 'tea') - 2;
  return (
    <AbsoluteFill>
      <TiledBg />
      <div style={{ position: 'absolute', left: V ? 60 : 120, top: V ? 150 : 260, width: V ? 960 : 900 }}>
        <Kinetic words={words('payoff')} size={V ? 88 : 92} energetic align={V ? 'center' : 'left'} maxWidth={V ? 960 : 900} emphasis={['snap', 'say', 'square', 'tea']} style={{ height: V ? 480 : 540 }} />
      </div>
      {f >= cues.payoffDrop - 1 && (
        <div style={{ position: 'absolute', left: rx, top: interpolate(drop, [0, 1], [-1500, ry]), transform: `rotate(${3 - 5 * drop * (1 - morph)}deg)` }}>
          <div style={{ opacity: 1 - morph, position: 'absolute' }}><Receipt w={rw} /></div>
          <div style={{ opacity: morph, transform: `scale(${0.9 + 0.1 * morph})`, transformOrigin: 'top center', position: 'absolute', top: 60 }}><ShareCard w={rw} /></div>
          {/* scanner brackets on "snap" */}
          {frame > 0 && morph < 1 && [0, 1, 2, 3].map((i) => (
            <div key={i} style={{ position: 'absolute', width: 90, height: 90, opacity: frame * (1 - morph), borderColor: C.marigold, borderStyle: 'solid', borderWidth: 0,
              ...(i < 2 ? { top: -20 } : { top: rw * 1.72 }), ...(i % 2 ? { left: rw - 70 } : { left: -20 }),
              [i < 2 ? 'borderTopWidth' : 'borderBottomWidth']: 10, [i % 2 ? 'borderRightWidth' : 'borderLeftWidth']: 10, borderRadius: 18 } as React.CSSProperties} />
          ))}
        </div>
      )}
      <Bubble text="Binisha & I had the beers…" from={cues.payoffSay} to={cues.payoffSay + 10} size={V ? 34 : 34} w={V ? 700 : 560} x={V ? 320 : 1060} y={V ? 700 : 70} hide={cues.payoffSquare} />
      {f >= cues.payoffSquare - 1 && (
        <div style={{ position: 'absolute', left: rx + rw - 110, top: ry + 400, width: 170, height: 170, borderRadius: '50%', background: C.marigold, display: 'grid', placeItems: 'center',
          transform: `scale(${check}) rotate(${(1 - check) * -120}deg)`, boxShadow: '0 30px 60px -20px rgba(242,160,7,.8)' }}>
          <svg width="96" height="96" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke={C.ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      )}
      <Prop at={tea} x={V ? 90 : 860} y={V ? 1480 : 760} size={V ? 170 : 170} tilt={0}>🍵</Prop>
      {f >= tea && [0, 1, 2].map((i) => {
        const t = (f - tea + i * 7) % 24;
        return <div key={i} style={{ position: 'absolute', left: (V ? 150 : 920) + i * 34, top: (V ? 1450 : 730) - t * 3, width: 14, height: 44, borderRadius: 14, background: '#fff', opacity: 0.7 * Math.sin((t / 24) * Math.PI), filter: 'blur(3px)' }} />;
      })}
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
      {H > 0 && null}
    </AbsoluteFill>
  );
};

// ── 15. Coming soon; have it today ────────────────────────────────────────────────────────────
const StoreBadge: React.FC<{ name: string; at: number; big: number }> = ({ name, at: a, big }) => {
  const s = useSpring(a - 1, { damping: 11, stiffness: 200 });
  return (
    <div style={{ transform: `scale(${s})`, background: C.ink, color: C.paper, borderRadius: 22, padding: `${big * 0.35}px ${big * 0.7}px`, fontFamily: F.body, minWidth: big * 6 }}>
      <div style={{ fontSize: big * 0.42, fontWeight: 600, color: C.marigold, letterSpacing: '0.08em' }}>COMING SOON</div>
      <div style={{ fontSize: big, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{name}</div>
    </div>
  );
};

const Soon: React.FC = () => {
  const f = useCurrentFrame();
  const { W, V } = useLayout();
  const up = useSpring(cues.phoneUp, { damping: 18, stiffness: 120 });
  const pw = V ? 480 : 440;
  return (
    <AbsoluteFill>
      <TiledBg />
      <Caption ids={['soon']} {...(V ? { x: 60, y: 150, w: 960, size: 70, h: 330 } : { x: 120, y: 200, w: 900, size: 72, h: 360 })} center={V} />
      <div style={{ position: 'absolute', left: V ? 0 : 120, right: V ? 0 : undefined, top: V ? 640 : 700, display: 'flex', gap: 24, justifyContent: V ? 'center' : 'flex-start' }}>
        <StoreBadge name="Play Store" at={cues.badges[0]} big={V ? 50 : 48} />
        <StoreBadge name="App Store" at={cues.badges[1]} big={V ? 50 : 48} />
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - up) * 1300}px)` }}>
        <Phone x={V ? (W - pw) / 2 : 1240} y={V ? 900 : 67} w={pw}><Shot src="login" /></Phone>
        {f >= cues.phoneUp && (
          <div style={{ position: 'absolute', left: V ? 0 : 1240, width: V ? W : pw, top: V ? 845 : 1000, display: 'flex', justifyContent: 'center' }}>
            <Pill style={{ fontSize: 28, background: C.marigold, border: 'none' }}>Today: install from your browser</Pill>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// ── 16–17. Install demos: Android (Chrome) then iPhone (Safari) ───────────────────────────────
const Steps: React.FC<{ title: string; steps: [string, number][]; x: number; y: number; w: number; size: number; opacity: number }> = ({ title, steps, x, y, w, size, opacity }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, opacity }}>
      <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: size * 1.25, letterSpacing: '-0.03em', color: C.ink, marginBottom: size * 0.5 }}>{title}</div>
      {steps.map(([t, a], i) => {
        const done = ease(f, [a, a + 6], [0, 1]);
        const active = f >= (i ? steps[i - 1][1] : 0) - 4;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: size * 0.5, marginBottom: size * 0.45, opacity: active ? 1 : 0.4 }}>
            <div style={{ width: size * 1.4, height: size * 1.4, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontFamily: F.body, fontWeight: 800, fontSize: size * 0.7,
              background: done > 0.5 ? C.marigold : C.surface, border: `2px solid ${done > 0.5 ? C.marigold : C.line}`, color: C.ink, transform: `scale(${1 + 0.15 * Math.sin(done * Math.PI)})` }}>
              {done > 0.5 ? '✓' : i + 1}
            </div>
            <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: size, color: C.ink, lineHeight: 1.2 }}>{t}</div>
          </div>
        );
      })}
    </div>
  );
};

const InstallScreen: React.FC = () => {
  const f = useCurrentFrame();
  const { sw, sh } = usePhone();
  const iOS = f >= cues.iPhoneIn;
  const a = androidTaps(sw, sh), b = iosTaps(sw, sh);
  const aHome = cues.aConfirm + 3, iHome = cues.iAdd + 3;
  const swap = ease(f, [cues.iPhoneIn - 4, cues.iPhoneIn + 3], [0, 1]);
  return (
    <>
      {!iOS || swap < 1 ? (
        <AbsoluteFill style={{ opacity: 1 - swap }}>
          {f < aHome ? <AndroidBrowser urlFrom={at('android', 'open')} urlTo={at('android', 'chrome') - 4} pageAt={at('android', 'chrome')} menuAt={cues.aMenu} installAt={cues.aInstall} confirmAt={cues.aConfirm} /> : <HomeScreen at={cues.aConfirm + 6} />}
          <Tap at={cues.aMenu} x={a.menu.x} y={a.menu.y} size={sw * 0.11} />
          <Tap at={cues.aInstall} x={a.install.x} y={a.install.y} size={sw * 0.11} />
          <Tap at={cues.aConfirm} x={a.confirm.x} y={a.confirm.y} size={sw * 0.11} />
        </AbsoluteFill>
      ) : null}
      {iOS && (
        <AbsoluteFill style={{ opacity: swap }}>
          {f < iHome ? <IosBrowser urlFrom={cues.iPhoneIn} urlTo={at('iphone', 'safari') - 3} pageAt={at('iphone', 'safari')} shareAt={cues.iShare} addAt={cues.iAdd} /> : <HomeScreen at={cues.iAdd + 6} ios />}
          <Tap at={cues.iShare} x={b.share.x} y={b.share.y} size={sw * 0.11} />
          <Tap at={cues.iAdd} x={b.add.x} y={b.add.y} size={sw * 0.11} />
        </AbsoluteFill>
      )}
    </>
  );
};

const Install: React.FC = () => {
  const f = useCurrentFrame();
  const { W, V } = useLayout();
  const pw = V ? 480 : 440, ph = phoneH(pw);
  const swap = ease(f, [cues.iPhoneIn - 4, cues.iPhoneIn + 3], [0, 1]);
  const stepsBox = V ? { x: 100, y: 470, w: 880, size: 34 } : { x: 120, y: 300, w: 620, size: 40 };
  return (
    <AbsoluteFill>
      <TiledBg />
      <Caption ids={['android', 'iphone']} {...(V ? { x: 60, y: 150, w: 960, size: 58, h: 250 } : { x: 1290, y: 300, w: 540, size: 52, h: 400 })} center={V} />
      <Steps title="Android · Chrome" opacity={1 - swap} {...stepsBox} steps={[['Open splitup.thimitech.com', at('android', 'chrome')], ['Tap ⋮ (menu)', cues.aMenu], ['Install app / Add to Home screen', cues.aConfirm]]} />
      <Steps title="iPhone · Safari" opacity={swap} {...stepsBox} steps={[['Open splitup.thimitech.com', at('iphone', 'safari')], ['Tap Share', cues.iShare], ['Add to Home Screen', cues.iAdd]]} />
      <Phone x={V ? (W - pw) / 2 : 790} y={V ? 800 : (1080 - ph) / 2} w={pw}><InstallScreen /></Phone>
    </AbsoluteFill>
  );
};

// ── 18. CTA on a marigold flood ───────────────────────────────────────────────────────────────
const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { W, V } = useLayout();
  const w = words('cta');
  const url = useSpring(at('cta', 'splitup') - 1, { damping: 12, stiffness: 200 });
  const soon = useSpring(at('cta', 'splitup') + 10, { damping: 14 });
  const phone = useSpring(cues.ctaClick + 10, { damping: 18, stiffness: 110 });
  const size = V ? 96 : 116;
  const line = (a: number, b: number, color: string) => (
    <Kinetic words={w.slice(a, b)} size={size} energetic whole align={V ? 'center' : 'left'} color={color} maxWidth={V ? 980 : 1190} style={{ height: size * 1.1 }} />
  );
  const pw = V ? 440 : 440;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 40%, #f7b52e 0%, ${C.marigold} 55%, #e89600 100%)` }}>
      <div style={{ position: 'absolute', left: V ? 0 : 130, right: V ? 0 : undefined, top: V ? 140 : 100, display: 'flex', alignItems: 'center', justifyContent: V ? 'center' : 'flex-start', gap: 22 }}>
        <Logo size={84} />
        <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 64, letterSpacing: '-0.04em', color: C.ink }}>Split-Up</span>
        <span style={{ fontFamily: F.emoji, fontSize: 52 }}>✨</span>
      </div>
      <div style={{ position: 'absolute', left: V ? 60 : 130, top: V ? 300 : 240, width: V ? 960 : 1150 }}>
        {line(0, 3, C.ink)}
        {line(3, 7, C.paper)}
        {line(7, 9, C.ink)}
      </div>
      <div style={{ position: 'absolute', left: V ? 0 : 130, right: V ? 0 : undefined, top: V ? 760 : 740, display: 'flex', flexDirection: 'column', alignItems: V ? 'center' : 'flex-start', gap: 22 }}>
        <div style={{ transform: `scale(${url})`, transformOrigin: V ? 'center' : 'left center', background: C.ink, color: C.paper, fontFamily: F.display, fontWeight: 700, fontSize: V ? 54 : 56,
          letterSpacing: '-0.02em', padding: '22px 44px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 20 }}>
          splitup.thimitech.com <span style={{ color: C.marigold }}>→</span>
        </div>
        <Pill style={{ opacity: soon, transform: `translateY(${(1 - soon) * 20}px)`, background: C.paper, border: 'none', fontSize: V ? 28 : 28 }}>
          Coming soon to Play Store & App Store · install from your browser today
        </Pill>
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${(1 - phone) * 1200}px)` }}>
        <Phone x={V ? (W - pw) / 2 : 1340} y={V ? 1020 : 67} w={pw}>
          <Shot src="home" />
        </Phone>
      </div>
    </AbsoluteFill>
  );
};

// ── The film ──────────────────────────────────────────────────────────────────────────────────
const FadeIn: React.FC<{ at: number; children: React.ReactNode; d?: number }> = ({ at: a, children, d = 6 }) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: ease(f, [a, a + d], [0, 1]) }}>{children}</AbsoluteFill>;
};

export const SmartSplitFilm: React.FC<{ previewAudio: boolean }> = ({ previewAudio }) => {
  const f = useCurrentFrame();
  const { W, H, V } = useLayout();
  const inWin = (a: number, b: number) => f >= a && f < b;
  const btn = TURN_BTN(W, H, V);
  const flash = interpolate(f - cues.shutter, [0, 2, 6], [0, 1, 0], clamp);
  const whip = ease(f, [cues.payoffIn - 3, cues.payoffIn + 5], [1, 0], Easing.out(Easing.cubic));
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {f < cues.shutter + 20 && (
        <CameraMotionBlur shutterAngle={200} samples={8}><Opening /></CameraMotionBlur>
      )}
      {inWin(cues.shutter, cues.productIn + 8) && <Flood at={cues.shutter} x={btn.x} y={btn.y} dur={16}><Reveal /></Flood>}
      {inWin(cues.productIn, S.bonus.from + 4) && <FadeIn at={cues.productIn}><Product /></FadeIn>}
      {inWin(S.bonus.from - 3, cues.payoffIn + 6) && <FadeIn at={S.bonus.from - 3}><Bonus /></FadeIn>}
      {inWin(cues.payoffIn - 3, S.soon.from + 6) && (
        <AbsoluteFill style={{ transform: `translateX(${whip * W}px)` }}>
          <CameraMotionBlur shutterAngle={200} samples={6}><Payoff /></CameraMotionBlur>
        </AbsoluteFill>
      )}
      {inWin(S.soon.from, S.android.from + 6) && <FadeIn at={S.soon.from}><Soon /></FadeIn>}
      {inWin(S.android.from, cues.ctaClick + 20) && <FadeIn at={S.android.from}><Install /></FadeIn>}
      {f >= cues.ctaClick && <Flood at={cues.ctaClick} x={W / 2} y={H / 2}><Cta /></Flood>}
      <AbsoluteFill style={{ background: '#fff', opacity: flash, pointerEvents: 'none' }} />
      {previewAudio && <Audio src={staticFile('ai/master.wav')} />}
    </AbsoluteFill>
  );
};

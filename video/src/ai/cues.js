// Smart Split film: cue frames derived from the voice timeline.
// Shared by the video (src/ai/Film.tsx) and the mix (scripts/mix.mjs) so every tap and whoosh lands on the same frame.

export const compositions = ['AI-Landscape', 'AI-Vertical'];
export const outputs = { 'AI-Landscape': 'splitup-smart-split-16x9', 'AI-Vertical': 'splitup-smart-split-9x16' };

/** @param {{fps:number,totalFrames:number,shots:{id:string,from:number,frames:number,words:{text:string,start:number}[]}[]}} tl */
export function getCues(tl) {
  const S = Object.fromEntries(tl.shots.map((s) => [s.id, s]));
  const wordFrame = (id, text) => {
    const w = S[id].words.find((x) => x.text.toLowerCase().startsWith(text.toLowerCase()));
    if (!w) throw new Error(`no "${text}" in ${id}`);
    return Math.round(w.start * tl.fps);
  };
  const W = wordFrame;
  const c = {
    billDrop: W('hook', 'bill') - 2,
    chips: [W('sad', 'beers'), W('sad', 'chowmein'), W('sad', 'ten'), W('sad', 'thirteen')],
    calcIn: W('sad', 'calculator') - 4,
    calcAway: S.turn.from + 3,
    shutter: S.reveal.from - 3, // the camera button is pressed: flash, then the marigold flood
    productIn: S.snap.from - 2,
    uploadTap: W('snap', 'bill') - 4,
    sendTap: S.say.from + 38,
    saveTap: W('save', 'save'),
    toGroup: W('save', 'save') + 7,
    shareTap: W('invite', 'share'),
    plusFive: W('bonus', 'five'),
    payoffIn: S.payoff.from - 2,
    payoffDrop: W('payoff', 'bill') - 2,
    payoffSnap: W('payoff', 'snap'),
    payoffSay: W('payoff', 'say'),
    payoffSquare: W('payoff', 'square'),
    soonIn: S.soon.from,
    badges: [W('soon', 'play'), W('soon', 'app')],
    phoneUp: W('soon', 'today') - 6,
    aMenu: W('android', 'menu') - 4,
    aInstall: W('android', 'install') + 1,
    aConfirm: W('android', 'install') + 12,
    iPhoneIn: S.iphone.from + 26, // the Android icon holds through "On iPhone,"
    iShare: W('iphone', 'share'),
    iAdd: W('iphone', 'add') - 2,
    ctaClick: S.cta.from - 3,
  };
  return {
    S,
    wordFrame,
    ...c,
    sfx: [
      { type: 'thump', frame: c.billDrop + 4 },
      { type: 'whoosh', frame: S.sad.from - 4 },
      ...c.chips.map((frame) => ({ type: 'pop', frame })),
      { type: 'whoosh', frame: c.calcIn },
      { type: 'thump', frame: c.calcIn + 6 },
      { type: 'whoosh', frame: c.calcAway },
      { type: 'shutter', frame: c.shutter },
      { type: 'whoosh', frame: c.shutter + 1 },
      { type: 'whoosh', frame: c.productIn - 2 },
      { type: 'tap', frame: c.uploadTap },
      { type: 'shutter', frame: c.uploadTap + 4 },
      { type: 'tap', frame: c.sendTap },
      { type: 'tap', frame: W('chat', 'text') + 6 },
      { type: 'tap', frame: c.saveTap },
      { type: 'pop', frame: c.toGroup + 2 },
      { type: 'pop', frame: W('credits', 'five') },
      { type: 'tap', frame: c.shareTap },
      { type: 'pop', frame: c.plusFive },
      { type: 'pop', frame: c.plusFive + 5 },
      { type: 'whoosh', frame: c.payoffIn - 2 },
      { type: 'thump', frame: c.payoffDrop + 4 },
      { type: 'shutter', frame: c.payoffSnap },
      { type: 'pop', frame: c.payoffSay },
      { type: 'pop', frame: c.payoffSquare },
      ...c.badges.map((frame) => ({ type: 'pop', frame })),
      { type: 'tap', frame: c.aMenu },
      { type: 'tap', frame: c.aInstall },
      { type: 'tap', frame: c.aConfirm },
      { type: 'pop', frame: c.aConfirm + 6 },
      { type: 'tap', frame: c.iShare },
      { type: 'tap', frame: c.iAdd },
      { type: 'pop', frame: c.iAdd + 6 },
      { type: 'click', frame: c.ctaClick },
      { type: 'whoosh', frame: c.ctaClick + 1 },
    ],
  };
}

/** Extra stills to check besides one per shot: transitions and busy moments. */
export const stillFrames = (c, tl) => [
  ['x-bill-drop', c.billDrop + 8],
  ['x-chips', c.chips[3] + 10],
  ['x-calc', c.calcIn + 14],
  ['x-flash', c.shutter + 2],
  ['x-flood', c.shutter + 9],
  ['x-product-first', c.productIn + 3],
  ['x-reading', c.S.read.from + 30],
  ['x-typing', c.sendTap - 8],
  ['x-chat-typing', c.wordFrame('chat', 'type') + 10],
  ['x-toast', c.toGroup + 10],
  ['x-share-bubble', c.shareTap + 14],
  ['x-plus5', c.plusFive + 8],
  ['x-payoff-snap', c.payoffSnap + 6],
  ['x-android-menu', c.aMenu + 12],
  ['x-android-dialog', c.aConfirm - 4],
  ['x-android-home', c.aConfirm + 16],
  ['x-android-hold', c.iPhoneIn - 5],
  ['x-iphone-sheet', c.iShare + 14],
  ['x-iphone-home', c.iAdd + 14],
  ['x-cta-flood', c.ctaClick + 7],
  ['x-end', tl.totalFrames - 1],
];

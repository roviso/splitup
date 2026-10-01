// Transition + SFX cue frames, derived from the voice timeline.
// Shared by the video (src/Video.tsx) and the audio mix (scripts/mix.mjs) so clicks land on the same frame.

// Two cuts from one timeline and one master: 16:9 and 9:16 (TikTok, Reels, Shorts).
export const compositions = ['Launch', 'Launch-Vertical'];
export const outputs = { Launch: 'splitup-launch', 'Launch-Vertical': 'splitup-launch-9x16' };

/** @param {{fps:number,totalFrames:number,shots:{id:string,from:number,frames:number,words:{text:string,start:number}[]}[]}} tl */
export function getCues(tl) {
  const S = Object.fromEntries(tl.shots.map((s) => [s.id, s]));
  const wordFrame = (id, text) => {
    const w = S[id].words.find((x) => x.text.toLowerCase().startsWith(text));
    return Math.round(w.start * tl.fps);
  };
  const turnClick = wordFrame('turn', 'change') + 1; // the world changes on "change"
  const revealClick = S.items.from - 14;
  const ctaClick = S.cta.from - 5; // after "square again" lands
  return {
    S,
    wordFrame,
    turnClick,
    revealClick,
    ctaClick,
    friendsSwap: wordFrame('friends', 'in'), // QR -> नेपाली home on "In English..."
    squareAt: wordFrame('result', 'square'),
    sfx: [
      { type: 'whoosh', frame: S.sad.from - 6 },
      { type: 'thump', frame: S.d1.from },
      { type: 'thump', frame: S.d2.from },
      { type: 'thump', frame: S.d3.from },
      { type: 'click', frame: turnClick },
      { type: 'whoosh', frame: turnClick + 1 },
      { type: 'click', frame: revealClick },
      { type: 'whoosh', frame: revealClick + 1 },
      { type: 'pop', frame: wordFrame('result', 'square') },
      { type: 'click', frame: ctaClick },
      { type: 'whoosh', frame: ctaClick + 1 },
    ],
  };
}

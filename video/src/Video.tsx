import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import tl from './timeline.json';
import { getCues } from './cues.js';
import { C } from './theme';
import { Cursor, Flood, useLayout } from './kit';
import { clickPoints, Cta, Diagnosis, Opening, Product, Result, Reveal, Turn } from './scenes';

const cues = getCues(tl);
const S = cues.S;

/** Energetic opening: sampled motion blur on fast moves. */
const Energetic: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      {f < S.honest.from + 1 && <Opening />}
      {f >= S.honest.from && f < S.turn.from + 1 && <Diagnosis />}
      {f >= S.turn.from && <Turn />}
    </AbsoluteFill>
  );
};

export const LaunchVideo: React.FC<{ previewAudio: boolean }> = ({ previewAudio }) => {
  const f = useCurrentFrame();
  const { V } = useLayout();
  const { turn: TURN_CLICK, reveal: REVEAL_CLICK, result: RESULT_CLICK } = clickPoints(V);
  const inWin = (a: number, b: number) => f >= a && f < b;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      {f < cues.turnClick + 20 && (
        <CameraMotionBlur shutterAngle={200} samples={8}>
          <Energetic />
        </CameraMotionBlur>
      )}
      {inWin(cues.turnClick, cues.revealClick + 20) && <Flood at={cues.turnClick} {...TURN_CLICK}><Reveal /></Flood>}
      {inWin(cues.revealClick, S.result.from + 6) && <Flood at={cues.revealClick} {...REVEAL_CLICK}><Product /></Flood>}
      {inWin(S.result.from - 4, cues.ctaClick + 20) && <Result />}
      {f >= cues.ctaClick && <Flood at={cues.ctaClick} {...RESULT_CLICK}><Cta /></Flood>}

      {inWin(cues.turnClick - 18, cues.turnClick + 22) && <Cursor click={cues.turnClick} {...TURN_CLICK} ring={C.marigold} />}
      {inWin(cues.revealClick - 18, cues.revealClick + 22) && <Cursor click={cues.revealClick} {...REVEAL_CLICK} ring={C.paper} from={[REVEAL_CLICK.x + 500, REVEAL_CLICK.y + 380]} />}
      {inWin(cues.ctaClick - 18, cues.ctaClick + 22) && <Cursor click={cues.ctaClick} {...RESULT_CLICK} ring={C.marigold} from={[RESULT_CLICK.x + 520, RESULT_CLICK.y + 420]} />}

      {/* Studio preview plays the mastered mix; the final render muxes the same file in untouched. */}
      {previewAudio && <Audio src={staticFile('master.wav')} />}
    </AbsoluteFill>
  );
};

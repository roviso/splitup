import React from 'react';
import { Composition } from 'remotion';
import tl from './timeline.json';
import aiTl from './ai/timeline.json';
import { LaunchVideo } from './Video';
import { SmartSplitFilm } from './ai/Film';

export const Root: React.FC = () => (
  <>
    <Composition id="Launch" component={LaunchVideo} durationInFrames={tl.totalFrames} fps={tl.fps} width={1920} height={1080} defaultProps={{ previewAudio: true }} />
    <Composition id="Launch-Vertical" component={LaunchVideo} durationInFrames={tl.totalFrames} fps={tl.fps} width={1080} height={1920} defaultProps={{ previewAudio: true }} />
    <Composition id="AI-Landscape" component={SmartSplitFilm} durationInFrames={aiTl.totalFrames} fps={aiTl.fps} width={1920} height={1080} defaultProps={{ previewAudio: true }} />
    <Composition id="AI-Vertical" component={SmartSplitFilm} durationInFrames={aiTl.totalFrames} fps={aiTl.fps} width={1080} height={1920} defaultProps={{ previewAudio: true }} />
  </>
);

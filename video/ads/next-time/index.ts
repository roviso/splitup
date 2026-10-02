import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Film, FPS, TOTAL } from './Film';

registerRoot(() => React.createElement(Composition, { id: 'NextTime', component: Film, durationInFrames: TOTAL * FPS, fps: FPS, width: 1080, height: 1920 }));

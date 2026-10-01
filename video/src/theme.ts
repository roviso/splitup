import { loadFont as loadBricolage } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadFigtree } from '@remotion/google-fonts/Figtree';
import { loadFont as loadAnek } from '@remotion/google-fonts/AnekDevanagari';
import { loadFont as loadEmoji } from '@remotion/google-fonts/NotoColorEmoji';

// The app's own palette (apps/web/src/index.css): lokta paper, ink, and ONE accent — marigold.
export const C = {
  paper: '#fbf7f0',
  surface: '#ffffff',
  surface2: '#f4eee3',
  line: '#e8dfd0',
  ink: '#1b1a17',
  muted: '#7a7266',
  marigold: '#f2a007',
  marigoldSoft: '#fdf0d3',
};

const display = loadBricolage('normal', { weights: ['500', '700', '800'], subsets: ['latin'] }).fontFamily;
const body = loadFigtree('normal', { weights: ['500', '600', '700'], subsets: ['latin'] }).fontFamily;
const deva = loadAnek('normal', { weights: ['600', '700'], subsets: ['devanagari', 'latin'] }).fontFamily;
const emoji = loadEmoji('normal', {}).fontFamily;

export const F = {
  display: `${display}, ${deva}, ${emoji}, sans-serif`,
  body: `${body}, ${deva}, ${emoji}, sans-serif`,
  emoji: `${emoji}, sans-serif`,
};

export const W = 1920;
export const H = 1080;

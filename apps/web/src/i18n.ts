import { useSyncExternalStore } from 'react';
import NepaliDate from 'nepali-date-converter';
import { NE } from './ne';

type Prefs = { lang: 'en' | 'ne'; cal: 'ad' | 'bs' };
const read = (): Prefs => {
  try { return { lang: 'en', cal: 'ad', ...JSON.parse(localStorage.getItem('prefs') ?? '{}') }; } catch { return { lang: 'en', cal: 'ad' }; }
};
let prefs = read();
const subs = new Set<() => void>();
export function setPrefs(p: Partial<Prefs>) {
  prefs = { ...prefs, ...p };
  try { localStorage.setItem('prefs', JSON.stringify(prefs)); } catch { /* private mode */ }
  document.documentElement.lang = prefs.lang;
  subs.forEach((f) => f());
}
export const usePrefs = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => prefs);

/** English text is the key; Nepali falls back to English when a string isn't translated yet. `{x}` placeholders get filled from vars. */
export function translate(lang: Prefs['lang'], s: string, vars?: Record<string, string | number>) {
  const out = (lang === 'ne' && NE[s]) || s;
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : out;
}
export function useT() {
  const { lang } = usePrefs();
  return (s: string, vars?: Record<string, string | number>) => translate(lang, s, vars);
}

const nf = (lang: Prefs['lang'], frac: boolean) =>
  new Intl.NumberFormat(lang === 'ne' ? 'ne-NP-u-nu-deva' : 'en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 });
/** Paisa → "रु 1,23,456.50" (Devanagari digits in Nepali). Always unsigned; callers pick the colour/wording. */
export const money = (paisa: number, lang: Prefs['lang'] = prefs.lang) => `रु ${nf(lang, Math.abs(paisa) % 100 !== 0).format(Math.abs(paisa) / 100)}`;

const jsDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
export function date(iso: string, p: Prefs = prefs, style: 'full' | 'short' = 'full') {
  const d = jsDate(iso);
  if (p.cal === 'bs') return new NepaliDate(d).format(style === 'full' ? 'DD MMMM YYYY' : 'DD MMMM', p.lang === 'ne' ? 'np' : 'en');
  return d.toLocaleDateString(p.lang === 'ne' ? 'ne-NP' : 'en-GB', style === 'full' ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}
/** Month heading for grouping lists, e.g. "Asoj 2083" or "Sep 2026". */
export function month(iso: string, p: Prefs = prefs) {
  const d = jsDate(iso);
  if (p.cal === 'bs') return new NepaliDate(d).format('MMMM YYYY', p.lang === 'ne' ? 'np' : 'en');
  return d.toLocaleDateString(p.lang === 'ne' ? 'ne-NP' : 'en-GB', { month: 'long', year: 'numeric' });
}
export function ago(iso: string, lang: Prefs['lang'] = prefs.lang) {
  const s = (Date.now() - +new Date(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'ne' ? 'ne' : 'en', { numeric: 'auto' });
  if (s < 60) return rtf.format(0, 'second');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  if (s < 86400 * 30) return rtf.format(-Math.floor(s / 86400), 'day');
  return date(iso);
}
export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

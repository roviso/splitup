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

// Chrome and Android ship without Nepali number data, so Intl can't be trusted for Devanagari digits: swap them ourselves.
const DEVA = '०१२३४५६७८९';
export const devaDigits = (s: string) => s.replace(/[0-9]/g, (d) => DEVA[+d]);

/** English text is the key; Nepali falls back to English when a string isn't translated yet. `{x}` placeholders get filled from vars (numbers in Devanagari for Nepali). */
export function translate(lang: Prefs['lang'], s: string, vars?: Record<string, string | number>) {
  const out = (lang === 'ne' && NE[s]) || s;
  const fill = (v: string | number | undefined) => (lang === 'ne' && typeof v === 'number' ? devaDigits(String(v)) : String(v ?? ''));
  return vars ? out.replace(/\{(\w+)\}/g, (_, k) => fill(vars[k])) : out;
}
export function useT() {
  const { lang } = usePrefs();
  return (s: string, vars?: Record<string, string | number>) => translate(lang, s, vars);
}

const nf = (frac: boolean) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }); // lakh grouping
/** Currency sign: "Rs" in English, "रु" in Nepali. */
export const cur = (lang: Prefs['lang'] = prefs.lang) => (lang === 'ne' ? 'रु' : 'Rs');
/** Paisa → "Rs 1,23,456.50" / "रु १,२३,४५६.५०". Always unsigned; callers pick the colour/wording. */
export const money = (paisa: number, lang: Prefs['lang'] = prefs.lang) => `${cur(lang)} ${amount(paisa, lang)}`;
/** Just the number part of `money`. */
export const amount = (paisa: number, lang: Prefs['lang'] = prefs.lang) => {
  const s = nf(Math.abs(paisa) % 100 !== 0).format(Math.abs(paisa) / 100);
  return lang === 'ne' ? devaDigits(s) : s;
};

/** Nepali mode always shows B.S. dates; English follows the calendar setting. */
export const usesBs = (p: Prefs = prefs) => p.lang === 'ne' || p.cal === 'bs';
// The everyday month names people say (साउन, not श्रावण), as on most Nepali calendars.
const BS_MONTHS = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत'];
function bs(d: Date, p: Prefs, parts: 'dmy' | 'dm' | 'my') {
  const n = new NepaliDate(d);
  if (p.lang !== 'ne') return n.format({ dmy: 'D MMMM YYYY', dm: 'D MMMM', my: 'MMMM YYYY' }[parts], 'en');
  const [day, mon, yr] = [devaDigits(String(n.getDate())), BS_MONTHS[n.getMonth()], devaDigits(String(n.getYear()))];
  return { dmy: `${day} ${mon} ${yr}`, dm: `${day} ${mon}`, my: `${mon} ${yr}` }[parts];
}

const jsDate = (iso: string) => new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
export function date(iso: string, p: Prefs = prefs, style: 'full' | 'short' = 'full') {
  const d = jsDate(iso);
  if (usesBs(p)) return bs(d, p, style === 'full' ? 'dmy' : 'dm');
  return d.toLocaleDateString('en-GB', style === 'full' ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}
/** Month heading for grouping lists, e.g. "असोज २०८३", "Aswin 2083" or "September 2026". */
export function month(iso: string, p: Prefs = prefs) {
  const d = jsDate(iso);
  if (usesBs(p)) return bs(d, p, 'my');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
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

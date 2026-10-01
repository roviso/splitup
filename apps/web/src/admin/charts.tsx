import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../ui';

// Series colours are CSS vars (index.css), validated for colour-blind separation in light and dark.
// Always assign them in this order and by entity, never by rank.
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
/** One step of a single-hue sequential ramp: 0 → faint, 1 → full. */
export const ramp = (t: number, hue = 'var(--s1)') => `color-mix(in oklab, ${hue} ${Math.round(12 + Math.min(1, Math.max(0, t)) * 88)}%, var(--surface))`;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Round max up to a clean axis: 0 / 250 / 500 / 750 / 1,000. */
function niceTicks(max: number, count = 4, integer = false) {
  if (max <= 0) return [0, 1];
  const raw = max / count, mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  if (integer) step = Math.max(1, Math.ceil(step)); // counts: no "0.5 sign-ups"
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

export type Series = { key: string; label: string; color: string };
type Row = Record<string, number | string>;

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  // Flip to the left of the pointer near the right edge.
  const left = x > w - 190 ? x - 186 : x + 14;
  return (
    <div className="pointer-events-none absolute z-10 min-w-36 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg" style={{ left, top: Math.max(0, y) }}>
      {children}
    </div>
  );
}
const TipRow = ({ color, label, value, kind = 'line' }: { color: string; label: string; value: string; kind?: 'line' | 'rect' }) => (
  <div className="flex items-center gap-2">
    {kind === 'line' ? <span className="h-0.5 w-3 rounded" style={{ background: color }} /> : <span className="size-2.5 rounded-sm" style={{ background: color }} />}
    <b className="tabular-nums">{value}</b>
    <span className="text-muted">{label}</span>
  </div>
);
export function Legend({ series, kind = 'line' }: { series: Series[]; kind?: 'line' | 'rect' }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          {kind === 'line' ? <span className="h-0.5 w-3.5 rounded" style={{ background: s.color }} /> : <span className="size-2.5 rounded-sm" style={{ background: s.color }} />}
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Time series: lines (with a faint wash for a single series) or columns (stacked when several). Crosshair + tooltip, arrow keys too. */
export function TimeChart({ data, series, x = 'day', format = String, height = 220, kind = 'line', xLabel, integer }: {
  data: Row[]; series: Series[]; x?: string; format?: (n: number) => string; height?: number; kind?: 'line' | 'columns'; xLabel?: (v: string) => string;
  /** Whole-number data (counts): ticks step by at least 1. */
  integer?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const val = (r: Row, k: string) => Number(r[k]) || 0;
  const tops = data.map((r) => (kind === 'columns' ? series.reduce((a, s) => a + val(r, s.key), 0) : Math.max(...series.map((s) => val(r, s.key)))));
  const ticks = niceTicks(Math.max(...tops, 0), 4, integer);
  const yMax = ticks.at(-1)!;
  const padL = Math.max(...ticks.map((t) => format(t).length)) * 6.6 + 10, padR = 12, padT = 10, padB = 24;
  const iw = w - padL - padR, ih = height - padT - padB;
  const band = iw / Math.max(n, 1);
  const cx_ = (i: number) => (kind === 'columns' ? padL + band * (i + 0.5) : padL + (n > 1 ? (iw * i) / (n - 1) : iw / 2));
  const cy = (v: number) => padT + ih - (v / yMax) * ih;
  const colW = Math.min(24, Math.max(2, band - 2)); // ≤24px, a 2px surface gap between neighbours
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const fmtX = xLabel ?? ((v: string) => new Date(v + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = kind === 'columns' ? Math.floor((px - padL) / band) : Math.round(((px - padL) / iw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === 'Escape') setHover(null);
    else return;
    e.preventDefault();
  };
  // Rounded 4px data-end, square at the baseline.
  const colPath = (x0: number, y0: number, y1: number, top: boolean) => {
    const h = y1 - y0, r = top ? Math.min(4, h, colW / 2) : 0;
    return `M${x0},${y1} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + colW - r} Q${x0 + colW},${y0} ${x0 + colW},${y0 + r} V${y1} Z`;
  };

  return (
    <div className="space-y-2">
      <Legend series={series} kind={kind === 'columns' ? 'rect' : 'line'} />
      <div ref={ref} className="relative">
        <svg width={w} height={height} className="block touch-pan-y outline-none focus-visible:outline-2" tabIndex={0} role="img"
          aria-label={`${series.map((s) => s.label).join(', ')} chart, ${n} points. Use arrow keys for values.`}
          onPointerMove={move} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={w - padR} y1={cy(t)} y2={cy(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={padL - 8} y={cy(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">{format(t)}</text>
            </g>
          ))}
          {data.map((r, i) => (i % labelEvery === 0 || i === n - 1) && (i === n - 1 || n - 1 - i >= labelEvery) ? (
            <text key={i} x={cx_(i)} y={height - 6} textAnchor={i === 0 && kind === 'line' ? 'start' : i === n - 1 && kind === 'line' ? 'end' : 'middle'} className="fill-muted text-[11px]">{fmtX(String(r[x]))}</text>
          ) : null)}
          {kind === 'columns' && data.map((r, i) => {
            let acc = 0;
            const visible = series.filter((s) => val(r, s.key) > 0);
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                {visible.map((s, j) => {
                  const v = val(r, s.key), y1 = cy(acc), y0 = cy(acc + v);
                  acc += v;
                  // 2px surface gap between stacked segments
                  return <path key={s.key} d={colPath(cx_(i) - colW / 2, y0, j ? y1 - 2 : y1, j === visible.length - 1)} fill={s.color} />;
                })}
              </g>
            );
          })}
          {kind === 'line' && series.map((s) => {
            const pts = data.map((r, i) => `${cx_(i)},${cy(val(r, s.key))}`);
            return (
              <g key={s.key}>
                {series.length === 1 && <path d={`M${cx_(0)},${cy(0)} L${pts.join(' L')} L${cx_(n - 1)},${cy(0)} Z`} fill={s.color} opacity={0.1} />}
                <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {n > 0 && <circle cx={cx_(n - 1)} cy={cy(val(data[n - 1], s.key))} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            );
          })}
          {hover !== null && kind === 'line' && (
            <g>
              <line x1={cx_(hover)} x2={cx_(hover)} y1={padT} y2={padT + ih} stroke="var(--muted)" strokeWidth={1} opacity={0.6} />
              {series.map((s) => <circle key={s.key} cx={cx_(hover)} cy={cy(val(data[hover], s.key))} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
            </g>
          )}
        </svg>
        {hover !== null && data[hover] && (
          <Tip x={cx_(hover)} y={padT} w={w}>
            <div className="mb-1 text-xs font-semibold text-muted">{fmtX(String(data[hover][x]))}</div>
            {series.map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={format(val(data[hover], s.key))} kind={kind === 'columns' ? 'rect' : 'line'} />)}
          </Tip>
        )}
      </div>
      <TableView head={['Date', ...series.map((s) => s.label)]} rows={data.map((r) => [fmtX(String(r[x])), ...series.map((s) => format(val(r, s.key)))])} />
    </div>
  );
}

/** Every chart's numbers, reachable without hovering. */
export function TableView({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer select-none text-xs font-semibold text-muted hover:text-ink">View as table</summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line">
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-surface-2"><tr>{head.map((h) => <th key={h} className="px-3 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-3 py-1">{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** Twelve-ish points in the de-emphasis hue, the latest one in the accent. */
export function Sparkline({ values, w = 72, h = 22 }: { values: number[]; w?: number; h?: number }) {
  const max = Math.max(...values, 1), n = values.length;
  const pts = values.map((v, i) => [2 + ((w - 4) * i) / (n - 1), h - 3 - (v / max) * (h - 6)]);
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--muted)" strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={2.5} fill="var(--marigold)" />
    </svg>
  );
}

/** Ranked horizontal bars, one colour (identity is the label, not the hue). Value at the tip. */
export function Bars({ rows, format = String, color = 'var(--s1)', empty = 'Nothing yet' }: {
  rows: { key: string; label: ReactNode; value: number; detail?: string; icon?: ReactNode }[]; format?: (n: number) => string; color?: string; empty?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="group grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-sm" title={r.detail}>
          <span className="flex min-w-0 items-center gap-1.5 truncate">{r.icon}<span className="truncate">{r.label}</span></span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 rounded-r-[4px] transition group-hover:brightness-110" style={{ width: `${Math.max(1, (r.value / max) * 78)}%`, background: color }} />
            <span className="shrink-0 font-semibold tabular-nums">{format(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Part-to-whole at a glance (≤4 parts), 2px gaps between segments, legend with values below. */
export function Composition({ parts, format = String }: { parts: { key: string; label: string; value: number; color: string }[]; format?: (n: number) => string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const [tip, setTip] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} className="h-full transition hover:brightness-110" style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            onPointerEnter={() => setTip(p.key)} onPointerLeave={() => setTip(null)} />
        ))}
      </div>
      <ul className="space-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.key} className={cx('flex items-center gap-2 rounded-lg px-1 transition', tip === p.key && 'bg-surface-2')}>
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="truncate text-muted">{p.label}</span>
            <b className="ml-auto tabular-nums">{format(p.value)}</b>
            <span className="w-10 text-right text-xs text-muted tabular-nums">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Weekday × hour, one hue light→dark. */
export function Heatmap({ cells, label = 'expenses' }: { cells: { dow: number; hour: number; n: number }[]; label?: string }) {
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.n]));
  const max = Math.max(...cells.map((c) => c.n), 1);
  const [tip, setTip] = useState<{ d: number; h: number; n: number } | null>(null);
  const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`);
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px] text-muted">
          <span />
          {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center">{h % 3 === 0 ? hourLabel(h) : ''}</span>)}
          {DOW.map((d, i) => (
            <div key={d} className="contents">
              <span className="self-center pr-1 text-right">{d}</span>
              {Array.from({ length: 24 }, (_, h) => {
                const n = grid.get(`${i + 1}-${h}`) ?? 0;
                return (
                  <span key={h} className={cx('aspect-square rounded-[3px] transition', tip?.d === i && tip.h === h && 'ring-2 ring-ink')}
                    style={{ background: n ? ramp(n / max) : 'var(--surface-2)' }}
                    onPointerEnter={() => setTip({ d: i, h, n })} onPointerLeave={() => setTip(null)} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="h-4">{tip ? <><b className="text-ink">{tip.n}</b> {label} · {DOW[tip.d]} {hourLabel(tip.h)}–{hourLabel((tip.h + 1) % 24)} (Nepal time)</> : 'Hover a cell'}</span>
        <span className="flex items-center gap-1">Less {[0.05, 0.3, 0.55, 0.8, 1].map((t) => <span key={t} className="size-2.5 rounded-[2px]" style={{ background: ramp(t) }} />)} More</span>
      </div>
    </div>
  );
}

/** Sign-up week × weeks since, share still active. */
export function Retention({ cohorts }: { cohorts: { cohort: string; size: number; weeks: number[] }[] }) {
  const cols = Math.max(0, ...cohorts.map((c) => c.weeks.length));
  if (!cohorts.length) return <p className="py-6 text-center text-sm text-muted">No sign-ups in this window yet</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs tabular-nums">
        <thead>
          <tr className="text-muted">
            <th className="px-2 py-1 text-left font-semibold">Week of</th><th className="px-2 py-1 text-right font-semibold">Users</th>
            {Array.from({ length: cols }, (_, i) => <th key={i} className="px-1 py-1 font-semibold">W{i}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="whitespace-nowrap px-2 py-1">{new Date(c.cohort + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
              <td className="px-2 py-1 text-right font-semibold">{c.size}</td>
              {Array.from({ length: cols }, (_, i) => {
                if (i >= c.weeks.length) return <td key={i} />;
                const p = c.size ? c.weeks[i] / c.size : 0;
                return (
                  <td key={i} className="min-w-11 rounded-md px-1 py-1.5 text-center font-semibold" title={`${c.weeks[i]} of ${c.size} active in week ${i}`}
                    style={{ background: p ? ramp(p) : 'var(--surface-2)', color: p > 0.55 ? '#fff' : 'var(--ink)' }}>{Math.round(p * 100)}%</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Step bars with % of the first step and of the step before. Ordered categories → one hue. */
export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const first = steps[0]?.n || 1;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span>{s.label}</span>
            <span className="tabular-nums"><b>{s.n.toLocaleString('en-IN')}</b> <span className="text-xs text-muted">{Math.round((s.n / first) * 100)}%{i > 0 && steps[i - 1].n && s.n <= steps[i - 1].n ? ` · ${Math.round((s.n / steps[i - 1].n) * 100)}% of prev.` : ''}</span></span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-2"><div className="h-full rounded-r-[4px] rounded-l-full" style={{ width: `${Math.max(1, (s.n / first) * 100)}%`, background: ramp(1 - i * 0.14) }} /></div>
        </li>
      ))}
    </ol>
  );
}

/** Last ~6 months of active days, GitHub-style. */
export function ActivityCalendar({ days, weeks = 26 }: { days: string[]; weeks?: number }) {
  const set = new Set(days);
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - ((end.getDay() + 6) % 7) - (weeks - 1) * 7); // Monday, `weeks` weeks back
  const cols: { d: string; on: boolean; future: boolean }[][] = [];
  for (let w = 0; w < weeks; w++) {
    cols.push(Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + w * 7 + i);
      const d = x.toLocaleDateString('en-CA');
      return { d, on: set.has(d), future: x > end };
    }));
  }
  return (
    <div className="space-y-1">
      <div className="flex gap-[3px] overflow-x-auto">
        {cols.map((c, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {c.map((x) => <span key={x.d} title={`${x.d}${x.on ? ' · active' : ''}`} className="size-2.5 rounded-[2px]"
              style={{ background: x.future ? 'transparent' : x.on ? 'var(--s4)' : 'var(--surface-2)' }} />)}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">{days.length} active day{days.length === 1 ? '' : 's'} in the last {weeks} weeks</p>
    </div>
  );
}

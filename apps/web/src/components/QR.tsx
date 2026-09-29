import { useMemo } from 'react';
import { encode, QrCodeDataType } from 'uqr';

/**
 * QR with rounded modules, soft finder "eyes" and the logo in the middle.
 * ECC level H survives the ~20% the logo covers. Always dark-on-white: phone scanners need it, even in dark mode.
 */
export default function QR({ text, size = 240, className }: { text: string; size?: number; className?: string }) {
  const { n, dots, eyes } = useMemo(() => {
    const q = encode(text, { ecc: 'H', border: 0 });
    const n = q.size;
    const hole = Math.ceil(n * 0.22) | 1; // odd, so it centres on a module
    const lo = (n - hole) / 2, hi = lo + hole;
    const dots: [number, number][] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!q.data[y][x] || q.types[y][x] === QrCodeDataType.Position) continue;
      if (x >= lo - 0.5 && x < hi && y >= lo - 0.5 && y < hi) continue;
      dots.push([x, y]);
    }
    return { n, dots, eyes: [[0, 0], [n - 7, 0], [0, n - 7]] as [number, number][] };
  }, [text]);
  const pad = 2;
  const logo = Math.ceil(n * 0.22);

  return (
    <svg viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`} width={size} height={size} className={className} role="img" aria-label="QR code">
      <rect x={-pad} y={-pad} width={n + pad * 2} height={n + pad * 2} rx={3} fill="#fff" />
      {/* Full-size rounded squares: gaps between small dots make jsQR (the iPhone fallback) miss codes. */}
      {dots.map(([x, y]) => <rect key={x + ',' + y} x={x} y={y} width={1.02} height={1.02} rx={0.36} fill="#1b1a17" />)}
      {eyes.map(([x, y]) => (
        <g key={x + ',' + y}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.8} fill="none" stroke="#1b1a17" strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill="#1b1a17" />
        </g>
      ))}
      <image href="/icon.svg" x={(n - logo) / 2} y={(n - logo) / 2} width={logo} height={logo} />
    </svg>
  );
}

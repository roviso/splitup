import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';
import { useT } from '../i18n';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Native BarcodeDetector (Android Chrome) when it can read QR; otherwise jsQR, loaded only when needed (iPhone Safari). */
async function makeReader(): Promise<(v: HTMLVideoElement) => Promise<string | undefined>> {
  const BD = (window as any).BarcodeDetector;
  if (BD && (await BD.getSupportedFormats?.())?.includes('qr_code')) {
    const d: Detector = new BD({ formats: ['qr_code'] });
    return async (v) => (await d.detect(v))[0]?.rawValue;
  }
  const jsQR = (await import('jsqr')).default;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return async (v) => {
    const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)); // full-res frames are slow to scan
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data;
  };
}

/** Live camera viewfinder that calls `onScan` once with the first QR it reads. */
export default function Scanner({ onScan }: { onScan: (text: string) => void }) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const done = useRef(onScan);
  done.current = onScan;
  const [error, setError] = useState<string>();

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const read = await makeReader();
        const tick = async () => {
          if (stopped) return;
          const text = v.readyState >= 2 ? await read(v).catch(() => undefined) : undefined;
          if (text && !stopped) { navigator.vibrate?.(60); done.current(text); return; }
          timer = setTimeout(tick, 120);
        };
        tick();
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError' ? 'denied' : 'unsupported');
      }
    })();
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((tr) => tr.stop()); };
  }, []);

  if (error) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl bg-surface-2 p-6 text-center">
        <CameraOff size={36} className="text-muted" />
        <p className="font-semibold">{error === 'denied' ? t('Camera access was blocked') : t("Can't open the camera here")}</p>
        <p className="text-sm text-muted">{t('Allow camera access in your browser settings, or point your phone camera at the code — it opens Split-Up directly.')}</p>
      </div>
    );
  }
  return (
    <div className="scanner relative aspect-square overflow-hidden rounded-3xl bg-black">
      <video ref={video} playsInline muted className="size-full object-cover" />
      <div className="scanner-frame pointer-events-none absolute inset-[14%]" aria-hidden>
        <span /><span /><span /><span />
        <i className="scanner-line" />
      </div>
      <p className="absolute inset-x-0 bottom-3 text-center text-sm font-semibold text-white drop-shadow">{t("Point at a friend's Split-Up code")}</p>
    </div>
  );
}

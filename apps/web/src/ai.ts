import NepaliDate from 'nepali-date-converter';
import type { Draft, ScannedBill } from '@splitup/shared';
import { createStore } from './ui';

/** Where Smart split was opened from. `message` = first thing to ask the AI, `photo` = a bill to read straight away. */
export type AiCtx = { groupId?: string | null; friendId?: string; message?: string; photo?: File };
export const [useAi, openAi] = createStore<AiCtx | null>(null);

// One hidden file input for the whole app, so any camera button opens the camera in the same tap
// (browsers only open a file picker from inside a click handler).
let picker: HTMLInputElement | null = null;
let pending: AiCtx = {};
export const registerPicker = (el: HTMLInputElement | null) => { picker = el; };
export const pickedPhoto = (file: File) => openAi({ ...pending, photo: file });

/** Open the camera (phones) or file picker (desktop) for a bill photo, then Smart split with it. */
export function snapBill(ctx: AiCtx, from: 'camera' | 'gallery' = 'camera') {
  if (!picker) return openAi(ctx);
  pending = ctx;
  if (from === 'camera') picker.setAttribute('capture', 'environment');
  else picker.removeAttribute('capture');
  picker.value = '';
  picker.click();
}

const load = (file: File) =>
  createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => new Promise<HTMLImageElement>((ok, bad) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => bad(new Error("That photo couldn't be opened. Try a JPEG or PNG."));
    img.src = URL.createObjectURL(file);
  }));

/** Phone photos are 3–12 MB. Shrink to a JPEG data URL under ~1.5 MB: plenty for reading a bill. */
export async function shrink(file: File, maxBytes = 1_500_000): Promise<string> {
  const img = await load(file);
  const c = document.createElement('canvas');
  for (let side = 2200; ; side = Math.round(side * 0.75)) {
    const k = Math.min(1, side / Math.max(img.width, img.height));
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; // transparent PNGs would turn black
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.72, 0.6]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= maxBytes || side < 900) return url;
    }
  }
}

/** Bill date as A.D. YYYY-MM-DD. B.S. dates are converted; anything odd or in the future falls back to today. */
export function billDay(b: Pick<ScannedBill, 'date' | 'calendar'>, today: string) {
  if (!b.date) return today;
  try {
    const [y, m, d] = b.date.split('-').map(Number);
    const iso = b.calendar === 'bs' ? new NepaliDate(y, m - 1, d).toJsDate().toLocaleDateString('en-CA') : b.date;
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso <= today && iso > '2000' ? iso : today;
  } catch {
    return today;
  }
}

export function draftFromBill(b: ScannedBill, base: Pick<Draft, 'groupId' | 'peopleIds'> & { me: string; today: string }): Draft {
  return {
    description: b.merchant ?? '',
    category: b.category,
    date: billDay(b, base.today),
    groupId: base.groupId,
    peopleIds: base.peopleIds,
    items: b.items.map((i) => ({ ...i, userIds: [] })),
    serviceCharge: b.serviceCharge,
    vat: b.vat,
    extra: b.extra,
    discount: b.discount,
    payers: [{ userId: base.me, amount: null }],
    billTotal: b.total,
    unknownNames: [],
  };
}

/** Browser speech-to-text, where available (Chrome, Edge, Safari). */
export const Speech: (new () => any) | undefined =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : undefined;

import { useEffect, useRef, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { money, usePrefs, useT } from './i18n';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Tiny global store — enough for "which modal is open" and toasts. */
export function createStore<T>(init: T) {
  let v = init;
  const subs = new Set<() => void>();
  const set = (n: T) => { v = n; subs.forEach((f) => f()); };
  const use = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => v);
  return [use, set, () => v] as const;
}

// ---------- toasts ----------
const [useToasts, setToasts, getToasts] = createStore<{ id: number; text: string; bad?: boolean }[]>([]);
export function toast(text: string, bad = false) {
  const id = Date.now() + Math.random();
  setToasts([...getToasts(), { id, text, bad }]);
  setTimeout(() => setToasts(getToasts().filter((x) => x.id !== id)), 3500);
}
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : 'Something went wrong', true);
export function Toasts() {
  const ts = useToasts();
  return (
    <div className="fixed inset-x-0 bottom-24 md:bottom-6 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite">
      {ts.map((x) => (
        <div key={x.id} className={cx('rounded-full px-4 py-2.5 text-sm font-medium shadow-lg animate-[fade_.2s]', x.bad ? 'bg-owe text-white' : 'bg-ink text-on-ink')}>{x.text}</div>
      ))}
    </div>
  );
}

// ---------- controls ----------
type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ink' | 'marigold' | 'ghost' | 'soft' | 'danger'; size?: 'sm' | 'md' | 'lg'; busy?: boolean };
export function Button({ variant = 'ink', size = 'md', busy, className, children, disabled, ...p }: Btn) {
  return (
    <button
      {...p}
      disabled={disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none whitespace-nowrap',
        size === 'sm' && 'h-8 px-3 text-sm', size === 'md' && 'h-11 px-5', size === 'lg' && 'h-13 px-6 text-lg',
        variant === 'ink' && 'bg-ink text-on-ink hover:opacity-90',
        variant === 'marigold' && 'bg-marigold text-[#1b1a17] hover:brightness-105 shadow-[0_2px_0_rgb(0_0_0/.15)]',
        variant === 'ghost' && 'hover:bg-surface-2',
        variant === 'soft' && 'bg-surface-2 hover:bg-line',
        variant === 'danger' && 'bg-owe-soft text-owe hover:brightness-95',
        className,
      )}
    >
      {busy ? <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" /> : children}
    </button>
  );
}

export const inputCls = 'w-full h-11 rounded-xl bg-surface border border-line px-3.5 outline-none focus:border-ink transition placeholder:text-muted/70';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, className)} />;

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 rounded-full bg-surface-2 p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 h-8 rounded-full px-3 text-sm font-semibold transition cursor-pointer', value === o.value ? 'bg-surface shadow-sm' : 'text-muted hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-1">
      <span className="text-sm">{label}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-line transition peer-checked:bg-owed after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-marigold" />
    </label>
  );
}

// ---------- modal (native <dialog>: focus trap + Esc for free) ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx('m-0 mt-auto w-full max-w-none max-h-[92dvh] rounded-t-3xl bg-bg p-0 md:m-auto md:rounded-3xl md:max-h-[88dvh]', wide ? 'md:max-w-2xl' : 'md:max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 className="font-display text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="grid size-9 place-items-center rounded-full hover:bg-surface-2 cursor-pointer" aria-label="Close"><X size={20} /></button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ---------- display ----------
const TINTS = ['#f2a007', '#d9480f', '#1f8a5b', '#2f6db3', '#8a4fbf', '#c2255c', '#0c8599', '#5c7a29'];
const tint = (id: string) => TINTS[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];
export function Avatar({ name, id, size = 40, ring }: { name: string; id: string; size?: number; ring?: boolean }) {
  const initials = name.trim().split(/\s+/).map((w) => [...w][0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={cx('inline-grid shrink-0 place-items-center rounded-full font-display font-bold text-white', ring && 'ring-2 ring-bg')}
      style={{ width: size, height: size, background: tint(id), fontSize: size * 0.38 }} aria-hidden>
      {initials || '?'}
    </span>
  );
}
export const Avatars = ({ people, max = 4, size = 28 }: { people: { id: string; name: string }[]; max?: number; size?: number }) => (
  <span className="flex -space-x-2">
    {people.slice(0, max).map((p) => <Avatar key={p.id} id={p.id} name={p.name} size={size} ring />)}
    {people.length > max && <span className="grid place-items-center rounded-full bg-surface-2 text-xs font-bold ring-2 ring-bg" style={{ width: size, height: size }}>+{people.length - max}</span>}
  </span>
);

/** Coloured amount: positive = owed to me (leaf), negative = I owe (sindoor). */
export function Money({ amount, className }: { amount: number; className?: string }) {
  const { lang } = usePrefs();
  return <span className={cx('font-semibold tabular-nums', amount > 0 ? 'text-owed' : amount < 0 ? 'text-owe' : 'text-muted', className)}>{money(amount, lang)}</span>;
}

/** "owes you रु 500" / "you owe रु 500" / "settled up" */
export function BalanceLine({ amount, className }: { amount: number; className?: string }) {
  const t = useT();
  if (!amount) return <span className={cx('text-sm text-muted', className)}>{t('settled up')}</span>;
  return (
    <span className={cx('text-right leading-tight', className)}>
      <span className={cx('block text-xs', amount > 0 ? 'text-owed' : 'text-owe')}>{amount > 0 ? t('owes you') : t('you owe')}</span>
      <Money amount={amount} className="text-base" />
    </span>
  );
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-3xl border border-line bg-surface', className)}>{children}</div>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line px-6 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="font-display text-lg font-bold">{title}</div>
      {text && <p className="max-w-xs text-sm text-muted">{text}</p>}
      {action}
    </div>
  );
}

export const Spinner = () => (
  <div className="grid place-items-center py-16"><span className="size-7 rounded-full border-[3px] border-marigold border-t-transparent animate-spin" /></div>
);

export function PageHead({ title, sub, right, back }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl truncate">{title}</h1>
        {sub && <div className="mt-1 text-muted">{sub}</div>}
      </div>
      {right && <div className="flex shrink-0 gap-2">{right}</div>}
    </header>
  );
}

/** Share a link via the OS share sheet, falling back to copying it. */
export async function shareLink(text: string, url: string, copied: string) {
  if (navigator.share) {
    try { await navigator.share({ text, url }); return; } catch { /* cancelled */ }
  }
  await navigator.clipboard.writeText(`${text} ${url}`);
  toast(copied);
}
export const whatsapp = (phone: string | null, text: string) =>
  `https://wa.me/${phone ? phone.replace(/\D/g, '').replace(/^(?=9\d{9}$)/, '977') : ''}?text=${encodeURIComponent(text)}`;

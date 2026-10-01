import { useState } from 'react';
import { ArrowUp, Camera, Sparkles } from 'lucide-react';
import { openAi, snapBill } from '../ai';
import { useT } from '../i18n';
import { useConfig } from '../store';
import { cx } from '../ui';
import { CreditsPill, useAiGate } from './Credits';

/** One line to reach the AI: type what you spent, or tap the camera to snap the bill. */
export default function AiBar({ groupId, friendId, className }: { groupId?: string; friendId?: string; className?: string }) {
  const t = useT();
  const [text, setText] = useState('');
  const gate = useAiGate();
  if (!useConfig().data?.ai) return null;
  const ctx = { groupId, friendId };
  return (
    <form onSubmit={(e) => { e.preventDefault(); gate(() => { openAi({ ...ctx, message: text.trim() || undefined }); setText(''); }); }}
      className={cx('ai-bar flex items-center gap-2 rounded-full p-1.5 pl-4 shadow-sm', className)}>
      <Sparkles size={18} className="shrink-0 text-marigold" aria-hidden />
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} enterKeyHint="send"
        placeholder={t('Tell AI what you spent…')} aria-label={t('Tell AI what you spent…')}
        className="no-ring h-10 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
      {!text.trim() && <CreditsPill />}
      {text.trim() ? (
        <button type="submit" aria-label={t('Send')} className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-on-ink cursor-pointer"><ArrowUp size={18} strokeWidth={2.5} /></button>
      ) : (
        <button type="button" onClick={() => gate(() => snapBill(ctx))} aria-label={t('Scan a bill')} title={t('Scan a bill')}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-marigold text-[#1b1a17] transition active:scale-95 cursor-pointer"><Camera size={19} /></button>
      )}
    </form>
  );
}

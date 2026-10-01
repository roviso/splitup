import { useState, type FormEvent } from 'react';
import { LogOut, QrCode, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, qc, type Me } from '../api';
import { setPrefs, useT, date, usePrefs, today } from '../i18n';
import { useMe } from '../store';
import { Avatar, Button, Card, Field, Input, PageHead, Segmented, toast, toastError } from '../ui';
import { CreditsPanel } from '../components/Credits';

/** Shrink an uploaded QR screenshot to a small data URL (QR codes survive downscaling well). */
async function shrink(file: File, max = 600): Promise<string> {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const t = useT();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      qc.setQueryData(['me'], await api<Me>('/me/password', { password: pw }));
      setPw('');
      toast(t('Password saved'));
    } catch (x) { toastError(x); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">{hasPassword ? t('Change password') : t('Set a password')}</h2>
        {!hasPassword && <p className="text-sm text-muted">{t('Optional. Lets you log in with email + password instead of a code.')}</p>}
        <Field label={t('New password')}>
          <Input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <Button type="submit" variant="soft" busy={busy}>{t('Save password')}</Button>
      </Card>
    </form>
  );
}

export default function Account() {
  const t = useT();
  const me = useMe();
  const prefs = usePrefs();
  const [f, setF] = useState({ name: me.name, phone: me.phone ?? '', esewaId: me.esewaId ?? '', khaltiId: me.khaltiId ?? '' });
  const [busy, setBusy] = useState(false);

  const save = async (patch: Partial<Me>, msg = t('Saved')) => {
    try {
      const u = await api<Me>('/me', patch, 'PATCH');
      qc.setQueryData(['me'], u);
      toast(msg);
    } catch (e) { toastError(e); }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await save({ name: f.name, phone: f.phone || null, esewaId: f.esewaId || null, khaltiId: f.khaltiId || null });
    setBusy(false);
  };
  const logout = async () => {
    await api('/auth/logout', {}).catch(() => {});
    qc.clear();
    location.href = '/';
  };

  return (
    <div className="space-y-6">
      <PageHead title={t('Account')} />
      <Card className="flex items-center gap-4 p-5">
        <Avatar id={me.id} name={me.name} size={56} />
        <div className="min-w-0"><p className="truncate font-display text-xl font-bold">{me.name}</p><p className="truncate text-sm text-muted">{me.email}</p></div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">{t('Language & calendar')}</h2>
        <Segmented value={prefs.lang} onChange={(lang) => { setPrefs({ lang }); save({ locale: lang }); }} options={[{ value: 'en', label: 'English' }, { value: 'ne', label: 'नेपाली' }]} />
        {prefs.lang === 'en' && (
          <Segmented value={prefs.cal} onChange={(cal) => { setPrefs({ cal }); save({ calendar: cal }); }} options={[{ value: 'ad', label: t('A.D. (English)') }, { value: 'bs', label: t('B.S. (Nepali)') }]} />
        )}
        <p className="text-sm text-muted">
          {t('Today is {date}', { date: date(today(), prefs) })}
          {prefs.lang === 'ne' && <span className="block text-xs">{t('Dates show in B.S. in Nepali.')}</span>}
        </p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Sparkles size={18} className="text-marigold" /> {t('AI credits')}</h2>
        <CreditsPanel />
      </Card>

      <form onSubmit={submit}>
        <Card className="space-y-4 p-5">
          <h2 className="font-display text-lg font-bold">{t('Profile')}</h2>
          <Field label={t('Name')}><Input required maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t('Phone')} hint={t('Friends use it to send you reminders on WhatsApp.')}><Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98XXXXXXXX" /></Field>
          <h2 className="pt-2 font-display text-lg font-bold">{t('How friends pay you')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="eSewa ID"><Input value={f.esewaId} maxLength={40} onChange={(e) => setF({ ...f, esewaId: e.target.value })} placeholder="98XXXXXXXX" /></Field>
            <Field label="Khalti ID"><Input value={f.khaltiId} maxLength={40} onChange={(e) => setF({ ...f, khaltiId: e.target.value })} placeholder="98XXXXXXXX" /></Field>
          </div>
          <Button type="submit" busy={busy}>{t('Save changes')}</Button>
        </Card>
      </form>

      <Card className="space-y-4 p-5">
        <h2 className="font-display text-lg font-bold">{t('Payment QR')}</h2>
        <p className="text-sm text-muted">{t('Upload your eSewa / Khalti / Fonepay / bank QR. Friends see it when they settle up with you.')}</p>
        {me.paymentQr ? (
          <div className="flex items-end gap-4">
            <img src={me.paymentQr} alt={t('Your payment QR')} className="size-40 rounded-2xl border border-line bg-white object-contain p-2" />
            <Button variant="danger" size="sm" onClick={() => save({ paymentQr: null }, t('QR removed'))}><Trash2 size={14} /> {t('Remove')}</Button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line p-4 hover:bg-surface-2">
            <QrCode size={28} className="text-muted" />
            <span className="font-semibold">{t('Upload QR image')}</span>
            <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) save({ paymentQr: await shrink(file) }, t('QR saved'));
            }} />
          </label>
        )}
      </Card>

      <PasswordCard hasPassword={me.hasPassword} />

      {me.role === 'admin' && !me.impersonatedBy && (
        <Link to="/admin" className="flex items-center gap-3 rounded-3xl bg-ink p-5 text-on-ink transition hover:opacity-90">
          <ShieldCheck size={22} className="text-marigold" />
          <span className="flex-1"><b className="block font-display text-lg">{t('Admin console')}</b><span className="text-sm opacity-70">{t('Analytics, users and platform controls')}</span></span>
        </Link>
      )}

      <Button variant="danger" onClick={logout}><LogOut size={16} /> {t('Log out')}</Button>
    </div>
  );
}

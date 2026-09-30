import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { matchPath, useLocation } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { api, qc, type Me } from '../api';
import { setPrefs, usePrefs, useT } from '../i18n';
import { useConfig } from '../store';
import { forgetInvite, pendingInvite, rememberInvite } from '../components/Credits';
import { REFERRAL_BONUS } from '@splitup/shared';
import { Avatar, Button, Field, Input, Segmented, toast, toastError } from '../ui';

declare const google: any;
type AuthResult = { user: Me; isNew: boolean };

/** Google's four-colour "G", per their branding guidelines. */
const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export function LangSwitch() {
  const { lang } = usePrefs();
  return (
    <div className="flex rounded-full bg-surface-2 p-1 text-sm font-semibold">
      {(['en', 'ne'] as const).map((l) => (
        <button key={l} onClick={() => {
          setPrefs({ lang: l });
          // Logged in: save it too, or the account's saved language puts it back on the next load.
          if (qc.getQueryData(['me'])) api<Me>('/me', { locale: l }, 'PATCH').then((u) => qc.setQueryData(['me'], u), () => {});
        }} className={`rounded-full px-3 py-1 cursor-pointer ${lang === l ? 'bg-surface shadow-sm' : 'text-muted'}`}>
          {l === 'en' ? 'EN' : 'नेपाली'}
        </button>
      ))}
    </div>
  );
}

export default function Login() {
  const t = useT();
  const { lang } = usePrefs();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [viaCode, setViaCode] = useState(false); // log in with an emailed code instead of a password
  const [step, setStep] = useState<'email' | 'code' | 'name'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string>();
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState(pendingInvite());
  const [busy, setBusy] = useState(false);
  const googleRef = useRef<HTMLDivElement>(null);

  const path = useLocation().pathname;
  const token = matchPath('/invite/:token', path)?.params.token;
  const friendCode = matchPath('/add/:code', path)?.params.code;
  const codeOwner = useQuery({ queryKey: ['code', friendCode], queryFn: () => api<{ id: string; name: string }>(`/codes/${friendCode}`), enabled: !!friendCode, retry: false });
  const invite = useQuery({ queryKey: ['invite', token], queryFn: () => api<{ name: string; invitedBy: string | null }>(`/invites/${token}`), enabled: !!token });
  const cfg = useConfig();
  useEffect(() => { if (friendCode) { rememberInvite(friendCode); setInviteCode(friendCode); } }, [friendCode]);

  // Back from Google without a session: say why once, then tidy the URL.
  useEffect(() => {
    const why = new URLSearchParams(location.search).get('google');
    if (!why) return;
    if (why !== 'cancelled') toast(why === 'unverified' ? t('Your Google email isn’t verified yet') : t('Google sign-in didn’t work. Try again, or use your email.'), true);
    history.replaceState(null, '', location.pathname);
  }, []);

  const finish = (r: AuthResult) => {
    if (r.isNew) { setName(invite.data?.name ?? r.user.name); setStep('name'); }
    else qc.invalidateQueries({ queryKey: ['me'] });
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try { await f(); } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  // Fallback when the server has no client secret: Google's own in-page button.
  useEffect(() => {
    const clientId = cfg.data?.googleClientId;
    if (!clientId || cfg.data?.googleRedirect || step !== 'email' || !googleRef.current) return;
    const render = () => {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }: { credential: string }) => run(async () => finish(await api<AuthResult>('/auth/google', { credential }))),
      });
      google.accounts.id.renderButton(googleRef.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 320, locale: lang });
    };
    if (typeof google !== 'undefined') return render();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [cfg.data, step, lang]);

  const sendCode = async () => {
    const r = await api<{ devCode?: string }>('/auth/otp/request', { email });
    setDevCode(r.devCode);
    setStep('code');
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step === 'email') {
      if (tab === 'login' && !viaCode) run(async () => finish(await api<AuthResult>('/auth/login', { email, password })));
      else run(sendCode); // sign-up confirms the email once with a code
    }
    if (step === 'code') run(async () => finish(await api<AuthResult>('/auth/otp/verify', { email, code, ...(tab === 'signup' && { name, password }) })));
    if (step === 'name') run(async () => { await api('/me', { name, locale: lang }, 'PATCH'); await qc.invalidateQueries({ queryKey: ['me'] }); });
  };

  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      {/* hero */}
      <section className="relative flex flex-col overflow-hidden bg-[#1b1a17] text-[#fbf7f0]">
        <div className="dhaka" />
        <div className="relative z-10 flex flex-1 flex-col gap-6 p-6 md:p-12">
          <div className="flex items-center gap-2.5 font-display text-2xl font-extrabold">
            <img src="/icon.svg" alt="" className="size-9" /> <span>Split<span className="text-[#f2a007]">-</span>Up</span>
          </div>
          <div className="my-auto max-w-md space-y-5 py-6 md:py-0">
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              {t('Eat together.')}<br /><span className="text-[#f2a007]">{t('Split fairly.')}</span><br />{t('Stay friends.')}
            </h1>
            <ul className="hidden space-y-2.5 text-[#fbf7f0]/80 md:block">
              {['Snap a bill and AI splits it. 5 free every month.', 'Itemized bills with 10% service charge & 13% VAT', 'Settle up with eSewa, Khalti or Fonepay', 'Free & unlimited. English and नेपाली.'].map((f) => (
                <li key={f} className="flex items-start gap-2.5"><Check size={18} className="mt-0.5 shrink-0 text-[#f2a007]" /> {t(f)}</li>
              ))}
            </ul>
          </div>
        </div>
        <svg viewBox="0 0 600 160" className="absolute bottom-0 left-0 w-full text-[#26231f]" preserveAspectRatio="none" aria-hidden>
          <path fill="currentColor" d="M0 160 L0 120 L70 70 L110 100 L190 20 L250 90 L300 60 L360 110 L430 40 L500 100 L560 75 L600 95 L600 160 Z" />
          <path fill="#fbf7f0" opacity=".85" d="M190 20 L215 50 L200 46 L188 58 L175 44 L165 46 Z M430 40 L452 63 L440 60 L428 70 L418 58 L410 60 Z" />
        </svg>
      </section>

      {/* form */}
      <section className="flex flex-col p-6 md:p-12">
        <div className="flex justify-end"><LangSwitch /></div>
        <div className="mx-auto my-auto w-full max-w-sm space-y-6 py-8">
          {codeOwner.data && (
            <div className="flex items-center gap-3 rounded-2xl bg-marigold-soft p-4 text-sm">
              <Avatar id={codeOwner.data.id} name={codeOwner.data.name} size={40} />
              <span>
                {t('{name} wants to split bills with you. Log in or sign up to add them as a friend.', { name: codeOwner.data.name })}
                <b className="mt-1 block">🎁 {t('New here? You both get {n} free AI bill scans.', { n: REFERRAL_BONUS })}</b>
              </span>
            </div>
          )}
          {invite.data && (
            <div className="rounded-2xl bg-marigold-soft p-4 text-sm">
              🙏 {t('{by} invited you to Split-Up. Log in to see what you share.', { by: invite.data.invitedBy ?? t('A friend') })}
            </div>
          )}
          <div>
            <h2 className="font-display text-3xl font-extrabold">
              {step === 'name' ? t('Welcome! 🙏') : t('Namaste 🙏')}
            </h2>
            <p className="mt-1 text-muted">
              {step === 'email' && (tab === 'signup' ? t('Create your free account.') : t('Log in to your account.'))}
              {step === 'code' && t('We sent a 6-digit code to {email}', { email })}
              {step === 'name' && t('What should your friends call you?')}
            </p>
          </div>
          {step === 'email' && cfg.data?.googleRedirect && (
            <>
              <a href={`/api/auth/google/start?next=${encodeURIComponent(path)}`}
                className="flex h-13 w-full items-center justify-center gap-3 rounded-full border border-line bg-surface text-[17px] font-semibold shadow-sm transition hover:bg-surface-2 active:scale-[.98]">
                <GoogleG /> {t('Continue with Google')}
              </a>
              <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t('or use your email')}<span className="h-px flex-1 bg-line" /></div>
            </>
          )}
          {step === 'email' && (
            <Segmented value={tab} onChange={(v) => { setTab(v); setViaCode(false); }}
              options={[{ value: 'login', label: t('Log in') }, { value: 'signup', label: t('Sign up') }]} />
          )}
          <form onSubmit={submit} className="space-y-4">
            {step === 'email' && tab === 'signup' && (
              <Field label={t('Your name')}>
                <Input required maxLength={60} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            {step === 'email' && (
              <Field label={t('Email')}>
                <Input type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
            )}
            {step === 'email' && tab === 'signup' && (
              <Field label={t('Invite code (optional)')} hint={t('From a friend? You both get {n} free AI bill scans.', { n: REFERRAL_BONUS })}>
                <Input value={inviteCode} maxLength={20} autoComplete="off" placeholder="7KQ2-M9XP" className="font-display tracking-widest"
                  onChange={(e) => { const v = e.target.value.toUpperCase(); setInviteCode(v); v.trim() ? rememberInvite(v) : forgetInvite(); }} />
              </Field>
            )}
            {step === 'email' && !(tab === 'login' && viaCode) && (
              <Field label={t('Password')} hint={tab === 'signup' ? t("At least 8 characters. We'll email you a code once to confirm it's you.") : undefined}>
                <Input type="password" required minLength={tab === 'signup' ? 8 : 1} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
            )}
            {step === 'code' && (
              <Field label={t('Code')} hint={t('The code works for 10 minutes. Check your spam folder if it’s not in your inbox.')}>
                <Input required autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center font-display text-2xl tracking-[.5em]" placeholder="••••••" />
              </Field>
            )}
            {step === 'code' && devCode && (
              <button type="button" onClick={() => setCode(devCode)} className="w-full rounded-2xl bg-marigold-soft p-3 text-sm cursor-pointer">
                🛠️ {t('Dev mode (no email server): your code is {code}. Tap to fill.', { code: devCode })}
              </button>
            )}
            {step === 'name' && (
              <Field label={t('Your name')}>
                <Input required autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Button type="submit" busy={busy} className="w-full" size="lg">
              {step === 'email' ? (tab === 'signup' ? t('Create account') : viaCode ? t('Email me a code') : t('Log in')) : step === 'code' ? t('Verify') : t("Let's go")}
            </Button>
          </form>
          {step === 'email' && tab === 'login' && (
            <button className="w-full text-center text-sm font-semibold text-muted hover:text-ink cursor-pointer" onClick={() => setViaCode(!viaCode)}>
              {viaCode ? t('Use my password instead') : t('Forgot password or never set one? Email me a code')}
            </button>
          )}
          {step === 'code' && (
            <div className="flex justify-between text-sm">
              <button className="flex items-center gap-1 text-muted hover:text-ink cursor-pointer" onClick={() => { setStep('email'); setCode(''); }}><ArrowLeft size={14} /> {t('Change email')}</button>
              <button className="font-semibold hover:underline cursor-pointer" onClick={() => run(sendCode)}>{t('Resend code')}</button>
            </div>
          )}
          {step === 'email' && cfg.data?.googleClientId && !cfg.data.googleRedirect && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />{t('or')}<span className="h-px flex-1 bg-line" /></div>
              <div ref={googleRef} className="flex justify-center" />
            </>
          )}
        </div>
        <p className="text-center text-xs text-muted">© Split-Up · splitup.thimitech.com</p>
      </section>
    </div>
  );
}

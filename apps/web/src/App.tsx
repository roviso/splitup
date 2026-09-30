import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { Activity as ActivityIcon, Camera, Home as HomeIcon, Plus, Sparkles, UserRound, Users, Settings } from 'lucide-react';
import { ApiError } from './api';
import { setPrefs, useT } from './i18n';
import { useMeQuery, openExpense, useConfig } from './store';
import { openAi, snapBill } from './ai';
import { Avatar, Button, Spinner, Toasts, cx, toast } from './ui';
import Login from './pages/Login';
import Home from './pages/Home';
import Groups from './pages/Groups';
import Group from './pages/Group';
import Friends from './pages/Friends';
import Friend from './pages/Friend';
import Activity from './pages/Activity';
import Account from './pages/Account';
import { AddByCode, Invite, Join } from './pages/Join';
import ExpenseForm from './components/ExpenseForm';
import SettleUp from './components/SettleUp';
import ExpenseDetail from './components/ExpenseDetail';
import SmartSplit from './components/SmartSplit';
import CreditsSheet, { forgetInvite, openCredits, pendingInvite, redeem } from './components/Credits';
import { Banners, Celebrate, LivePill, Unread } from './components/Notices';
import { useLive } from './live';

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('flex items-center gap-2.5 font-display text-2xl font-extrabold tracking-tight', className)}>
      <img src="/icon.svg" alt="" className="size-9" />
      <span>Split<span className="text-marigold">-</span>Up</span>
    </Link>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/friends', label: 'Friends', icon: UserRound },
  { to: '/activity', label: 'Activity', icon: ActivityIcon },
];

export default function App() {
  const me = useMeQuery();
  const t = useT();
  const ai = useConfig().data?.ai;
  useLive(!!me.data);
  useEffect(() => {
    if (me.data) setPrefs({ lang: me.data.locale, cal: me.data.calendar });
  }, [me.data?.locale, me.data?.calendar]);

  // Signed up from a friend's invite link or typed their code: claim the bonus once we're in (works for every sign-in method).
  useEffect(() => {
    const code = pendingInvite();
    if (!me.data || !code) return;
    if (!me.data.canRedeem) return forgetInvite();
    redeem(code).then(
      (r) => toast(t('You and {name} got {n} bonus AI credits 🎉', { name: r.inviter.name.split(' ')[0], n: r.bonus })),
      () => forgetInvite(), // bad or own code: not worth an error on first login
    );
  }, [me.data?.id]);
  const gate = (f: () => void) => ((me.data?.aiCredits.left ?? 0) > 0 ? f() : openCredits(true));

  if (me.isPending) return <Spinner />;
  if (me.error instanceof ApiError && me.error.status === 401) return <><Login /><Toasts /></>;
  if (me.error) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="space-y-4">
          <p className="font-display text-xl font-bold">{t("Can't reach Split-Up right now.")}</p>
          <Button onClick={() => me.refetch()}>{t('Try again')}</Button>
        </div>
      </div>
    );
  }

  const link = ({ isActive }: { isActive: boolean }) =>
    cx('flex items-center gap-3 rounded-2xl px-4 h-11 font-semibold transition', isActive ? 'bg-ink text-on-ink' : 'text-muted hover:bg-surface-2 hover:text-ink');

  return (
    <div className="md:flex">
      <aside className="hidden md:flex sticky top-0 h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur">
        <div className="dhaka" />
        <div className="flex flex-1 flex-col gap-8 p-5">
          <Logo />
          <div className="space-y-2">
            <Button variant="marigold" className="w-full" onClick={() => openExpense({})}><Plus size={18} /> {t('Add expense')}</Button>
            {ai && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="soft" size="sm" onClick={() => gate(() => snapBill({}))}><Camera size={15} /> {t('Scan bill')}</Button>
                <Button variant="soft" size="sm" onClick={() => gate(() => openAi({}))}><Sparkles size={15} className="text-marigold" /> {t('Ask AI')}</Button>
              </div>
            )}
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}><n.icon size={19} /> {t(n.label)}{n.to === '/activity' && <Unread className="ml-auto" />}</NavLink>)}
            <NavLink to="/account" className={link}><Settings size={19} /> {t('Account')}</NavLink>
          </nav>
          <LivePill className="mt-auto" />
          <Link to="/account" className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
            <Avatar id={me.data.id} name={me.data.name} size={36} />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{me.data.name}</span>
              <span className="block truncate text-xs text-muted">{me.data.email}</span>
            </span>
          </Link>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-6 md:px-10 md:pb-16 md:pt-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<Group />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/friends/:id" element={<Friend />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/account" element={<Account />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/invite/:token" element={<Invite />} />
          <Route path="/add/:code" element={<AddByCode />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 items-center">
          {NAV.slice(0, 2).map((n) => <Tab key={n.to} {...n} label={t(n.label)} />)}
          <button onClick={() => openExpense({})} aria-label={t('Add expense')}
            className="mx-auto -mt-7 grid size-15 place-items-center rounded-full bg-marigold text-[#1b1a17] shadow-[0_6px_20px_rgb(242_160_7/.45)] active:scale-95 transition cursor-pointer">
            <Plus size={28} strokeWidth={2.5} />
          </button>
          {NAV.slice(2).map((n) => <Tab key={n.to} {...n} label={t(n.label)} />)}
        </div>
      </nav>

      <ExpenseForm />
      <SettleUp />
      <ExpenseDetail />
      <SmartSplit />
      <CreditsSheet />
      <Celebrate />
      <Banners />
      <Toasts />
    </div>
  );
}

function Tab({ to, label, icon: Icon }: (typeof NAV)[number]) {
  return (
    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', isActive ? 'text-ink' : 'text-muted')}>
      {to === '/activity' && <Unread className="absolute left-1/2 top-1 ml-1.5" />}
      <Icon size={22} />
      {label}
    </NavLink>
  );
}

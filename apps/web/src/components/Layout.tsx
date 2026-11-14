import { ClipboardList, Home, LayoutDashboard, MessageCircle, Settings, ShieldCheck, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useApp } from '../state/app';
import { DemoBadge } from './Badge';
import { LanguageSwitcher } from './LanguageSwitcher';

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { t, demoMode, online, session } = useApp();
  const authed = Boolean(session?.authenticated);
  const demoDetail = [demoMode.llm && 'AI assistant', demoMode.digilocker && 'DigiLocker', demoMode.aadhaar && 'Aadhaar eKYC', demoMode.language && 'Language services'].filter(Boolean).join(', ');
  const nav = [
    { to: '/chat', label: t.ui.navChat, icon: MessageCircle },
    { to: '/results', label: t.ui.navResults, icon: ClipboardList },
    { to: '/dashboard', label: t.ui.navDashboard, icon: LayoutDashboard },
    { to: '/links', label: t.ui.navLinks, icon: ShieldCheck },
    { to: '/settings', label: t.ui.navSettings, icon: Settings },
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-3">Skip to content</a>
      <header className="bg-brand text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-2">
          <Link to="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight" aria-label="DigiScheme">
            <Home className="h-5 w-5 text-saffron decor" aria-hidden /> DigiScheme
          </Link>
          <div className="flex items-center gap-2">
            {demoMode.any && <DemoBadge detail={demoDetail} />}
            <LanguageSwitcher />
          </div>
        </div>
        {!online && (
          <div role="status" className="flex items-center justify-center gap-2 bg-saffron px-4 py-1 text-sm font-semibold text-white">
            <WifiOff className="h-4 w-4" aria-hidden /> {t.ui.offline}
          </div>
        )}
      </header>
      <main id="main" className={`mx-auto w-full flex-1 px-4 py-4 pb-28 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>{children}</main>
      {authed && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <ul className="mx-auto flex max-w-3xl justify-around">
            {nav.map(({ to, label, icon: Icon }) => (
              <li key={to} className="flex-1">
                <NavLink to={to} className={({ isActive }) => `tap flex flex-col items-center justify-center gap-0.5 px-1 py-2 text-xs font-semibold ${isActive ? 'text-saffron-600' : 'text-slate-600'}`}>
                  <Icon className="h-6 w-6" aria-hidden /> <span className="text-center leading-tight">{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

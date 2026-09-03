import { EqualIcon } from '@eqds/icons';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher, statusLabel, useTranslator } from '@/i18n';
import { cn } from '@/lib/utils';
import { logoutSession } from '@/state/session-slice';
import { store, useAppSelector } from '@/state/store';
import { useUiShellStore } from '@/stores/ui-shell-store';

const navigation = [
  { icon: 'settings', labelKey: 'shell.nav.operations', to: '/dashboard' },
  { icon: 'file_text', labelKey: 'shell.nav.studies', to: '/studies' },
];

function makeNavLinkClassName(padding: string) {
  return ({ isActive }: { isActive: boolean }) =>
    cn(
      `flex items-center gap-2.5 rounded-lg ${padding} text-sm font-medium transition-colors`,
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
    );
}

const navLinkClassName = makeNavLinkClassName('px-2.5 py-2');
const mobileNavLinkClassName = makeNavLinkClassName('px-3 py-2.5');

export function AppShell() {
  const { closeMobileNav, isMobileNavOpen, isSidebarCollapsed, setMobileNavOpen, toggleSidebar } = useUiShellStore(
    useShallow((s) => ({
      closeMobileNav: s.closeMobileNav,
      isMobileNavOpen: s.isMobileNavOpen,
      isSidebarCollapsed: s.isSidebarCollapsed,
      setMobileNavOpen: s.setMobileNavOpen,
      toggleSidebar: s.toggleSidebar,
    })),
  );
  const session = useAppSelector((state) => state.session);
  const { t } = useTranslator();

  return (
    <div className="eq-root min-h-screen bg-background text-foreground">
      <a className="eq-skip-link" href="#main-content">
        {t('shell.skip_to_main')}
      </a>

      <div className="flex min-h-screen w-full">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            'sticky top-0 hidden h-screen shrink-0 self-start overflow-y-auto border-r border-border bg-sidebar px-3 py-5 md:flex md:flex-col',
            isSidebarCollapsed ? 'w-[72px]' : 'w-64',
          )}
        >
          <div className="mb-6 flex items-center justify-between gap-2 px-2">
            <div className={cn('overflow-hidden', isSidebarCollapsed && 'sr-only')}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Chronicle</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('shell.research_operations')}</p>
            </div>
            <Button aria-label={t('shell.toggle_sidebar')} onClick={toggleSidebar} size="icon" variant="ghost">
              {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>

          <nav aria-label={t('shell.primary_nav')} className="flex-1 space-y-1">
            {navigation.map(({ icon, labelKey, to }) => (
              <NavLink className={navLinkClassName} key={to} to={to}>
                <EqualIcon className="h-4 w-4 shrink-0" name={icon} />
                {!isSidebarCollapsed && <span>{t(labelKey)}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto border-t border-border pt-3">
            <div className={cn('flex items-center gap-2 px-2', isSidebarCollapsed && 'justify-center')}>
              <ThemeToggle />
              {!isSidebarCollapsed && <LanguageSwitcher />}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button
                  aria-label={t('shell.open_navigation')}
                  className="md:hidden"
                  onClick={() => setMobileNavOpen(true)}
                  size="icon"
                  variant="ghost"
                >
                  <EqualIcon className="h-5 w-5" name="menu" />
                </Button>
                <div>
                  <h1 className="text-base font-semibold tracking-tight text-foreground">Chronicle</h1>
                  <p className="hidden text-xs text-muted-foreground sm:block">{t('shell.console_subtitle')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {session.user?.name && (
                  <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.name}</span>
                )}
                <Badge variant={session.status === 'authenticated' ? 'success' : 'warning'}>
                  {session.status === 'authenticated'
                    ? t('shell.signed_in')
                    : statusLabel(t, 'session', session.status)}
                </Badge>
                {/* Without this there was no way off a signed-in session at all, which on a
                    shared lab machine leaves the next person holding the last one's dashboard. */}
                <Button
                  aria-label={t('shell.sign_out')}
                  onClick={() => {
                    void store.dispatch(logoutSession());
                  }}
                  size="sm"
                  variant="outline"
                >
                  <LogOut className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t('shell.sign_out')}</span>
                </Button>
                <div className="flex items-center gap-2 md:hidden">
                  <ThemeToggle />
                  <LanguageSwitcher />
                </div>
              </div>
            </div>
          </header>

          {/* Mobile nav overlay */}
          {isMobileNavOpen && (
            <div className="fixed inset-0 z-30 md:hidden">
              {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses mobile nav */}
              <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                onClick={closeMobileNav}
                role="presentation"
              />
              <nav className="absolute inset-y-0 left-0 w-72 border-r border-border bg-sidebar p-4 shadow-xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold tracking-tight text-foreground">Chronicle</p>
                    <p className="text-xs text-muted-foreground">{t('shell.research_operations')}</p>
                  </div>
                  <Button aria-label={t('shell.close_navigation')} onClick={closeMobileNav} size="icon" variant="ghost">
                    <EqualIcon className="h-4 w-4" name="close" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {navigation.map(({ icon, labelKey, to }) => (
                    <NavLink className={mobileNavLinkClassName} key={to} onClick={closeMobileNav} to={to}>
                      <EqualIcon className="h-4 w-4 shrink-0" name={icon} />
                      <span>{t(labelKey)}</span>
                    </NavLink>
                  ))}
                </div>
              </nav>
            </div>
          )}

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8" id="main-content" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

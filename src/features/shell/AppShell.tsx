import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, PanelLeftClose, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCrmStore } from '../../store/crmStore';
import { useInventoryStore } from '../../store/inventoryStore';
import { canManageUsers } from '../../lib/platform/roles';
import { AppNavProvider } from './AppNavContext';
import { NAV_GROUPS, pageTitleForPath } from './navConfig';
import './shell.css';

const NAV_COLLAPSED_KEY = 'mahnikka.nav.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(NAV_COLLAPSED_KEY, value ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

function useWideLayout() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 960px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 960px)');
    const sync = () => setWide(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return wide;
}

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hydrateCrm = useCrmStore((s) => s.hydrate);
  const navigate = useNavigate();
  const location = useLocation();
  const showUsers = canManageUsers(user?.role);
  const isBuild = location.pathname.startsWith('/build');
  const pageTitle = pageTitleForPath(location.pathname);
  const wide = useWideLayout();
  const canDock = wide && !isBuild;
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [overlay, setOverlay] = useState(false);
  const docked = canDock && !collapsed;
  const navOpen = docked || overlay;

  useEffect(() => {
    void hydrateCrm();
  }, [hydrateCrm]);

  useEffect(() => {
    const unsub = useInventoryStore.subscribe((state) => {
      useCrmStore.getState().seedMissingCatalogItems(state.items);
    });
    return unsub;
  }, []);

  useEffect(() => {
    setOverlay(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOverlay(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay]);

  const setCollapsedPref = useCallback((value: boolean) => {
    setCollapsed(value);
    writeCollapsed(value);
  }, []);

  const closeNav = useCallback(() => {
    setOverlay(false);
  }, []);

  const toggleNav = useCallback(() => {
    if (canDock) {
      setCollapsedPref(!collapsed);
      setOverlay(false);
      return;
    }
    setOverlay((open) => !open);
  }, [canDock, collapsed, setCollapsedPref]);

  const setNavOpen = useCallback(
    (open: boolean) => {
      if (canDock) {
        setCollapsedPref(!open);
        setOverlay(false);
        return;
      }
      setOverlay(open);
    },
    [canDock, setCollapsedPref],
  );

  const navValue = useMemo(
    () => ({ navOpen, docked, setNavOpen, closeNav, toggleNav }),
    [navOpen, docked, setNavOpen, closeNav, toggleNav],
  );

  return (
    <AppNavProvider value={navValue}>
      <div
        className={`app-shell${isBuild ? ' is-build' : ''}${docked ? ' is-nav-docked' : ''}${overlay ? ' is-nav-overlay' : ''}`}
      >
        <header className="app-shell-top">
          <button
            type="button"
            className="app-shell-menu"
            onClick={toggleNav}
            aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={navOpen}
            aria-controls="app-nav-pane"
          >
            {overlay ? (
              <X size={18} strokeWidth={1.75} />
            ) : docked ? (
              <PanelLeftClose size={18} strokeWidth={1.75} />
            ) : (
              <Menu size={18} strokeWidth={1.75} />
            )}
          </button>
          <NavLink to="/" className="app-shell-brand" end>
            Mahnikka
          </NavLink>
          <span className="app-shell-page">{pageTitle}</span>
          <div className="app-shell-user">
            <span className="app-shell-user-name" title={user?.email}>
              {user?.name ?? user?.email}
            </span>
            <button
              type="button"
              className="app-shell-logout"
              onClick={() => {
                void logout().then(() => navigate('/login'));
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </div>
        </header>
        {overlay && (
          <button type="button" className="app-nav-backdrop" aria-label="Close navigation" onClick={closeNav} />
        )}
        <aside
          id="app-nav-pane"
          className={`app-nav-pane${docked ? ' is-docked' : ''}${overlay ? ' is-overlay' : ''}`}
          aria-label="App navigation"
          hidden={!navOpen}
        >
          <div className="app-nav-pane-head">
            <p className="eyebrow">Menu</p>
            {docked ? (
              <button
                type="button"
                className="app-nav-pane-close"
                onClick={() => setCollapsedPref(true)}
                aria-label="Collapse menu"
                title="Collapse menu"
              >
                <PanelLeftClose size={18} />
              </button>
            ) : (
              <button type="button" className="app-nav-pane-close" onClick={closeNav} aria-label="Close menu">
                <X size={18} />
              </button>
            )}
          </div>
          <nav className="app-nav-groups" aria-label="Primary">
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => !item.adminOnly || showUsers);
              if (items.length === 0) return null;
              return (
                <section key={group.id} className="app-nav-group" aria-label={group.label}>
                  <h2 className="app-nav-group-title">{group.label}</h2>
                  {items.map(({ to, label, end, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) => `app-nav-link${isActive ? ' is-active' : ''}`}
                      onClick={() => {
                        if (!docked) closeNav();
                      }}
                    >
                      <span className="app-nav-icon" aria-hidden>
                        <Icon size={16} strokeWidth={1.85} />
                      </span>
                      {label}
                    </NavLink>
                  ))}
                  {group.id === 'account' && (
                    <button
                      type="button"
                      className="app-nav-link app-nav-signout"
                      onClick={() => {
                        void logout().then(() => navigate('/login'));
                      }}
                    >
                      <span className="app-nav-icon" aria-hidden>
                        <LogOut size={16} strokeWidth={1.85} />
                      </span>
                      Sign out
                    </button>
                  )}
                </section>
              );
            })}
          </nav>
        </aside>
        <main className="app-shell-main">
          <Outlet />
        </main>
      </div>
    </AppNavProvider>
  );
}

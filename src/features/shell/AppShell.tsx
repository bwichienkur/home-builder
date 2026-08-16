import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCrmStore } from '../../store/crmStore';
import { canManageUsers } from '../../lib/platform/roles';
import './shell.css';

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/build', label: 'Build', end: false },
  { to: '/clients', label: 'Clients', end: false },
  { to: '/vendors', label: 'Vendors', end: false },
  { to: '/inventory', label: 'Materials', end: false },
  { to: '/plans', label: 'Plans', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hydrateCrm = useCrmStore((s) => s.hydrate);
  const navigate = useNavigate();
  const showUsers = canManageUsers(user?.role);

  useEffect(() => {
    void hydrateCrm();
  }, [hydrateCrm]);

  return (
    <div className="app-shell">
      <header className="app-shell-top">
        <NavLink to="/" className="app-shell-brand" end>
          Mahnikka
        </NavLink>
        <nav className="app-shell-nav" aria-label="Primary">
          {NAV.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
              {label}
            </NavLink>
          ))}
          {showUsers && (
            <NavLink to="/users" className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
              Users
            </NavLink>
          )}
        </nav>
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
      <main className="app-shell-main">
        <Outlet />
      </main>
    </div>
  );
}

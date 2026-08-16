import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Boxes,
  Building2,
  Home,
  LayoutTemplate,
  LogOut,
  Package,
  Settings,
  Users,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import './shell.css';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/build', label: 'Build', icon: Building2 },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/vendors', label: 'Vendors', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/plans', label: 'House plans', icon: LayoutTemplate },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <header className="app-shell-top">
        <div className="app-shell-brand">
          <strong>Mahnikka</strong>
          <span className="muted">Studio</span>
        </div>
        <nav className="app-shell-nav" aria-label="Primary">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="app-shell-user">
          <span className="app-shell-user-name">{user?.name ?? user?.email}</span>
          <button
            type="button"
            className="app-shell-logout"
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Sign out"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </header>
      <main className="app-shell-main">
        <Outlet />
      </main>
    </div>
  );
}

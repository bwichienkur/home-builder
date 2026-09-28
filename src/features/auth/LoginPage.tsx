import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import './auth.css';

function postLoginPath(state: unknown): string {
  if (state && typeof state === 'object' && 'from' in state) {
    const from = (state as { from?: { pathname?: string; search?: string; hash?: string } }).from;
    if (from?.pathname && from.pathname !== '/login') {
      return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
    }
  }
  return '/';
}

export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const sessionReady = useAuthStore((s) => s.sessionReady);
  const markSessionReady = useAuthStore((s) => s.markSessionReady);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sessionReady) return;
    const t = window.setTimeout(() => {
      if (!useAuthStore.getState().sessionReady) markSessionReady();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [sessionReady, markSessionReady]);

  if (!sessionReady) {
    return <div className="loading-3d">Loading…</div>;
  }

  if (user) return <Navigate to={postLoginPath(location.state)} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await login(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate(postLoginPath(location.state), { replace: true });
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <p className="eyebrow">Olsen Custom Homes</p>
        <h1>Sign in</h1>
        <p className="auth-lede">
          Plan studio, clients, vendors, inventory, and house-plan imports in one workspace.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Email or username
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

/** Blocks app pages until session is known; sends guests to /login. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const sessionReady = useAuthStore((s) => s.sessionReady);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const markSessionReady = useAuthStore((s) => s.markSessionReady);
  const location = useLocation();

  useEffect(() => {
    if (sessionReady) return;
    // Persist may already be done (e.g. tests / fast path).
    const api = useAuthStore.persist;
    if (api.hasHydrated()) {
      void restoreSession();
      return;
    }
    const unsub = api.onFinishHydration(() => {
      void restoreSession();
    });
    // Safety: never leave the app stuck on Loading…
    const t = window.setTimeout(() => {
      if (!useAuthStore.getState().sessionReady) markSessionReady();
    }, 2500);
    return () => {
      unsub();
      window.clearTimeout(t);
    };
  }, [sessionReady, restoreSession, markSessionReady]);

  if (!sessionReady) {
    return <div className="loading-3d">Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

/** Unknown URLs: home when signed in, login when not. */
export function AuthCatchAll() {
  const user = useAuthStore((s) => s.user);
  const sessionReady = useAuthStore((s) => s.sessionReady);

  if (!sessionReady) {
    return <div className="loading-3d">Loading…</div>;
  }
  return <Navigate to={user ? '/' : '/login'} replace />;
}

import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_LOGIN, useAuthStore } from '../../store/authStore';
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
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState(DEMO_LOGIN.email);
  const [password, setPassword] = useState(DEMO_LOGIN.password);
  const [name, setName] = useState('');
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
    const result =
      mode === 'login' ? await login(email, password) : await register(email, password, name);
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
        <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-lede">
          Plan studio, clients, vendors, inventory, and house-plan imports in one workspace.
        </p>
        <form onSubmit={onSubmit} className="auth-form">
          {mode === 'register' && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              Need an account?{' '}
              <button type="button" className="auth-link" onClick={() => setMode('register')}>
                Register
              </button>
            </>
          ) : (
            <>
              Already registered?{' '}
              <button type="button" className="auth-link" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </p>
        <p className="auth-demo muted">
          Demo admin: {DEMO_LOGIN.email} / {DEMO_LOGIN.password}
          <br />
          Also: designer@ / designer123 · estimator@ / estimator123 · client@ / client123 · pm@ / pm123
          <span className="muted"> (@mahnikka.local)</span>
        </p>
        <p className="muted">
          Browser accounts by default. Set <code>VITE_AUTH_PROVIDER=remote</code> to use Neon{' '}
          <code>/api/auth</code>.
        </p>
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

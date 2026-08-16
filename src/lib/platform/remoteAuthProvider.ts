import { apiHeaders, platformConfig } from './config';
import type { AuthProvider, AuthResult, AuthUser } from './authProvider';

/**
 * Remote auth adapter — talks to YOUR API today ($0 file-backed /api/auth).
 * Later: point the same routes at Auth0/Clerk/Cognito token exchange, or
 * replace this class with an SDK wrapper. UI stays unchanged.
 */
export class RemoteAuthProvider implements AuthProvider {
  readonly id = 'remote' as const;

  private base() {
    if (!platformConfig.apiUrl) {
      throw new Error('VITE_API_URL is required when VITE_AUTH_PROVIDER=remote');
    }
    return platformConfig.apiUrl;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    try {
      const res = await fetch(`${this.base()}/api/auth/login`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: body.error || 'Sign-in failed.' };
      if (body.token) localStorage.setItem('mahnikka-auth-token', body.token);
      return { ok: true, user: body.user as AuthUser, token: body.token };
    } catch {
      return {
        ok: false,
        error: 'Auth API unreachable. Start `npm run server` or switch VITE_AUTH_PROVIDER=local.',
      };
    }
  }

  async register(email: string, password: string, name: string): Promise<AuthResult> {
    try {
      const res = await fetch(`${this.base()}/api/auth/register`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ email, password, name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: body.error || 'Registration failed.' };
      if (body.token) localStorage.setItem('mahnikka-auth-token', body.token);
      return { ok: true, user: body.user as AuthUser, token: body.token };
    } catch {
      return {
        ok: false,
        error: 'Auth API unreachable. Start `npm run server` or switch VITE_AUTH_PROVIDER=local.',
      };
    }
  }

  async logout() {
    const token = localStorage.getItem('mahnikka-auth-token');
    localStorage.removeItem('mahnikka-auth-token');
    if (!platformConfig.apiUrl || !token) return;
    try {
      await fetch(`${platformConfig.apiUrl}/api/auth/logout`, {
        method: 'POST',
        headers: apiHeaders(),
      });
    } catch {
      /* ignore */
    }
  }

  async restoreSession(): Promise<AuthUser | null> {
    const token = localStorage.getItem('mahnikka-auth-token');
    if (!token || !platformConfig.apiUrl) return null;
    try {
      const res = await fetch(`${platformConfig.apiUrl}/api/auth/me`, { headers: apiHeaders() });
      if (!res.ok) return null;
      const body = await res.json();
      return (body.user as AuthUser) ?? null;
    } catch {
      return null;
    }
  }
}

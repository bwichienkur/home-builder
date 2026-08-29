import { apiBaseUrl, apiHeaders } from './config';
import type {
  AdminUserRow,
  ApiKeyMeta,
  AuthProvider,
  AuthResult,
  AuthUser,
  CreateApiKeyResult,
} from './authProvider';
import { normalizeRole, type UserRole } from './roles';

function asUser(raw: Partial<AuthUser> & { id: string; email: string; name: string }): AuthUser {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role: normalizeRole(raw.role),
  };
}

/**
 * Remote auth adapter — talks to /api/auth (Neon auth_snapshots + users table).
 * Empty VITE_API_URL → same-origin (Vercel serverless or Vite proxy to Express).
 */
export class RemoteAuthProvider implements AuthProvider {
  readonly id = 'remote' as const;

  private base() {
    return apiBaseUrl();
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
      return { ok: true, user: asUser(body.user), token: body.token };
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
      return { ok: true, user: asUser(body.user), token: body.token };
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
    if (!token) return;
    try {
      await fetch(`${this.base()}/api/auth/logout`, {
        method: 'POST',
        headers: apiHeaders(),
      });
    } catch {
      /* ignore */
    }
  }

  async restoreSession(): Promise<AuthUser | null> {
    const token = localStorage.getItem('mahnikka-auth-token');
    if (!token) return null;
    try {
      const res = await fetch(`${this.base()}/api/auth/me`, { headers: apiHeaders() });
      if (!res.ok) return null;
      const body = await res.json();
      return body.user ? asUser(body.user) : null;
    } catch {
      return null;
    }
  }

  async listUsers(query = ''): Promise<AdminUserRow[]> {
    const res = await fetch(`${this.base()}/api/admin/users?q=${encodeURIComponent(query)}`, {
      headers: apiHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not load users.');
    return (body.items as AdminUserRow[]) ?? [];
  }

  async setUserRole(userId: string, role: UserRole) {
    const res = await fetch(`${this.base()}/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PATCH',
      headers: apiHeaders(),
      body: JSON.stringify({ role }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: body.error || 'Could not update role.' };
    return { ok: true as const };
  }

  async listApiKeys(userId: string): Promise<ApiKeyMeta[]> {
    const res = await fetch(`${this.base()}/api/admin/users/${encodeURIComponent(userId)}/api-keys`, {
      headers: apiHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Could not load API keys.');
    return (body.items as ApiKeyMeta[]) ?? [];
  }

  async createApiKey(userId: string, label: string): Promise<CreateApiKeyResult> {
    const res = await fetch(`${this.base()}/api/admin/users/${encodeURIComponent(userId)}/api-keys`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ label }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error || 'Could not create API key.' };
    return { ok: true, key: body.key as string, meta: body.meta as ApiKeyMeta };
  }

  async revokeApiKey(userId: string, keyId: string) {
    const res = await fetch(
      `${this.base()}/api/admin/users/${encodeURIComponent(userId)}/api-keys/${encodeURIComponent(keyId)}`,
      { method: 'DELETE', headers: apiHeaders() },
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: body.error || 'Could not revoke API key.' };
    return { ok: true as const };
  }
}

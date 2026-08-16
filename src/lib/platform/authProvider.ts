import type { UserRole } from './roles';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type AuthResult = { ok: true; user: AuthUser; token?: string } | { ok: false; error: string };

export type ApiKeyMeta = {
  id: string;
  label: string;
  /** Public prefix shown in lists, e.g. mnk_a1b2… */
  prefix: string;
  createdAt: string;
  revokedAt?: string | null;
};

export type AdminUserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  apiKeyCount: number;
};

export type CreateApiKeyResult =
  | { ok: true; key: string; meta: ApiKeyMeta }
  | { ok: false; error: string };

/**
 * Auth port — UI talks only to this. Swap LocalAuthProvider ↔ RemoteAuthProvider
 * (or Auth0/Clerk wrapper) via VITE_AUTH_PROVIDER without changing pages.
 */
export interface AuthProvider {
  readonly id: 'local' | 'remote';
  login(email: string, password: string): Promise<AuthResult>;
  register(email: string, password: string, name: string): Promise<AuthResult>;
  logout(token?: string | null): Promise<void>;
  /** Optional session restore for remote IdPs. */
  restoreSession?(): Promise<AuthUser | null>;

  /** System-admin user directory (optional — remote may require API). */
  listUsers?(query?: string): Promise<AdminUserRow[]>;
  setUserRole?(userId: string, role: UserRole): Promise<{ ok: true } | { ok: false; error: string }>;
  listApiKeys?(userId: string): Promise<ApiKeyMeta[]>;
  createApiKey?(userId: string, label: string): Promise<CreateApiKeyResult>;
  revokeApiKey?(userId: string, keyId: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

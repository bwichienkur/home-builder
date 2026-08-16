import type {
  AdminUserRow,
  ApiKeyMeta,
  AuthProvider,
  AuthResult,
  AuthUser,
  CreateApiKeyResult,
} from './authProvider';
import { canManageUsers, normalizeRole, type UserRole } from './roles';

const STORAGE = 'mahnikka-local-accounts-v1';
const DEMO_EMAIL = 'admin@mahnikka.local';
const DEMO_PASS = 'admin123';

type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  hash: string;
  createdAt: string;
  revokedAt?: string | null;
};

type AccountRow = {
  id: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  apiKeys: ApiKeyRow[];
};

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readAccounts(): Record<string, AccountRow> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Record<string, AccountRow>;
  } catch {
    return {};
  }
}

function writeAccounts(accounts: Record<string, AccountRow>) {
  localStorage.setItem(STORAGE, JSON.stringify(accounts));
}

function migrateAccount(email: string, raw: Partial<AccountRow> & { passwordHash: string; id: string; name: string }): AccountRow {
  return {
    id: raw.id,
    name: raw.name,
    passwordHash: raw.passwordHash,
    role: email === DEMO_EMAIL ? 'system_admin' : normalizeRole(raw.role),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    apiKeys: Array.isArray(raw.apiKeys) ? raw.apiKeys : [],
  };
}

async function ensureDemo(accounts: Record<string, AccountRow>): Promise<Record<string, AccountRow>> {
  const next: Record<string, AccountRow> = {};
  for (const [email, row] of Object.entries(accounts)) {
    next[email] = migrateAccount(email, row);
  }
  if (!next[DEMO_EMAIL]) {
    next[DEMO_EMAIL] = {
      id: 'user-demo',
      name: 'Studio Admin',
      passwordHash: await sha256(DEMO_PASS),
      role: 'system_admin',
      createdAt: new Date().toISOString(),
      apiKeys: [],
    };
  } else {
    next[DEMO_EMAIL] = { ...next[DEMO_EMAIL], role: 'system_admin' };
  }
  writeAccounts(next);
  return next;
}

function toUser(email: string, account: AccountRow): AuthUser {
  return { id: account.id, email, name: account.name, role: account.role };
}

function toAdminRow(email: string, account: AccountRow): AdminUserRow {
  const activeKeys = account.apiKeys.filter((k) => !k.revokedAt);
  return {
    id: account.id,
    email,
    name: account.name,
    role: account.role,
    createdAt: account.createdAt,
    apiKeyCount: activeKeys.length,
  };
}

function findById(accounts: Record<string, AccountRow>, userId: string): { email: string; account: AccountRow } | null {
  for (const [email, account] of Object.entries(accounts)) {
    if (account.id === userId) return { email, account };
  }
  return null;
}

function randomKeyMaterial() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** $0 browser auth — no signup, no server required. */
export class LocalAuthProvider implements AuthProvider {
  readonly id = 'local' as const;

  async login(email: string, password: string): Promise<AuthResult> {
    const key = email.trim().toLowerCase();
    const accounts = await ensureDemo(readAccounts());
    const account = accounts[key];
    if (!account) return { ok: false, error: 'No account for that email.' };
    if ((await sha256(password)) !== account.passwordHash) {
      return { ok: false, error: 'Incorrect password.' };
    }
    return { ok: true, user: toUser(key, account) };
  }

  async register(email: string, password: string, name: string): Promise<AuthResult> {
    const key = email.trim().toLowerCase();
    if (!key || !password || password.length < 6) {
      return { ok: false, error: 'Use a valid email and a password of at least 6 characters.' };
    }
    const accounts = await ensureDemo(readAccounts());
    if (accounts[key]) return { ok: false, error: 'That email is already registered.' };
    const id = crypto.randomUUID();
    const passwordHash = await sha256(password);
    const display = name.trim() || key;
    const account: AccountRow = {
      id,
      name: display,
      passwordHash,
      role: 'user',
      createdAt: new Date().toISOString(),
      apiKeys: [],
    };
    writeAccounts({ ...accounts, [key]: account });
    return { ok: true, user: toUser(key, account) };
  }

  async logout() {
    /* session lives in zustand only */
  }

  async listUsers(query = ''): Promise<AdminUserRow[]> {
    const accounts = await ensureDemo(readAccounts());
    const q = query.trim().toLowerCase();
    return Object.entries(accounts)
      .map(([email, account]) => toAdminRow(email, account))
      .filter((row) => {
        if (!q) return true;
        return (
          row.email.includes(q) ||
          row.name.toLowerCase().includes(q) ||
          row.role.includes(q) ||
          row.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  async setUserRole(userId: string, role: UserRole): Promise<{ ok: true } | { ok: false; error: string }> {
    const accounts = await ensureDemo(readAccounts());
    const found = findById(accounts, userId);
    if (!found) return { ok: false, error: 'User not found.' };
    if (found.email === DEMO_EMAIL && role !== 'system_admin') {
      return { ok: false, error: 'The demo system admin role cannot be downgraded.' };
    }
    accounts[found.email] = { ...found.account, role };
    writeAccounts(accounts);
    return { ok: true };
  }

  async listApiKeys(userId: string): Promise<ApiKeyMeta[]> {
    const accounts = await ensureDemo(readAccounts());
    const found = findById(accounts, userId);
    if (!found) return [];
    return found.account.apiKeys.map(({ id, label, prefix, createdAt, revokedAt }) => ({
      id,
      label,
      prefix,
      createdAt,
      revokedAt: revokedAt ?? null,
    }));
  }

  async createApiKey(userId: string, label: string): Promise<CreateApiKeyResult> {
    const accounts = await ensureDemo(readAccounts());
    const found = findById(accounts, userId);
    if (!found) return { ok: false, error: 'User not found.' };
    const material = randomKeyMaterial();
    const key = `mnk_${material}`;
    const prefix = `${key.slice(0, 12)}…`;
    const meta: ApiKeyRow = {
      id: crypto.randomUUID(),
      label: label.trim() || 'Integration key',
      prefix,
      hash: await sha256(key),
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    accounts[found.email] = {
      ...found.account,
      apiKeys: [...found.account.apiKeys, meta],
    };
    writeAccounts(accounts);
    return {
      ok: true,
      key,
      meta: {
        id: meta.id,
        label: meta.label,
        prefix: meta.prefix,
        createdAt: meta.createdAt,
        revokedAt: null,
      },
    };
  }

  async revokeApiKey(userId: string, keyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const accounts = await ensureDemo(readAccounts());
    const found = findById(accounts, userId);
    if (!found) return { ok: false, error: 'User not found.' };
    const nextKeys = found.account.apiKeys.map((k) =>
      k.id === keyId ? { ...k, revokedAt: k.revokedAt ?? new Date().toISOString() } : k,
    );
    if (!nextKeys.some((k) => k.id === keyId)) return { ok: false, error: 'API key not found.' };
    accounts[found.email] = { ...found.account, apiKeys: nextKeys };
    writeAccounts(accounts);
    return { ok: true };
  }
}

export const DEMO_LOGIN = { email: DEMO_EMAIL, password: DEMO_PASS };

export { canManageUsers };

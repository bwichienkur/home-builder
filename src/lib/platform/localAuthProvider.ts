import type { AuthProvider, AuthResult, AuthUser } from './authProvider';

const STORAGE = 'mahnikka-local-accounts-v1';
const DEMO_EMAIL = 'admin@mahnikka.local';
const DEMO_PASS = 'admin123';

type AccountRow = { id: string; name: string; passwordHash: string };

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

async function ensureDemo(accounts: Record<string, AccountRow>): Promise<Record<string, AccountRow>> {
  if (accounts[DEMO_EMAIL]) return accounts;
  const passwordHash = await sha256(DEMO_PASS);
  const next: Record<string, AccountRow> = {
    ...accounts,
    [DEMO_EMAIL]: { id: 'user-demo', name: 'Studio Admin', passwordHash },
  };
  writeAccounts(next);
  return next;
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
    const user: AuthUser = { id: account.id, email: key, name: account.name };
    return { ok: true, user };
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
    writeAccounts({ ...accounts, [key]: { id, name: display, passwordHash } });
    return { ok: true, user: { id, email: key, name: display } };
  }

  async logout() {
    /* session lives in zustand only */
  }
}

export const DEMO_LOGIN = { email: DEMO_EMAIL, password: DEMO_PASS };

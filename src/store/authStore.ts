import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

type AuthState = {
  user: AuthUser | null;
  /** Demo password store: email → sha256 hex. Not for production IdP. */
  accounts: Record<string, { id: string; name: string; passwordHash: string }>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  register: (email: string, password: string, name: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
};

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const DEMO_EMAIL = 'admin@mahnikka.local';
const DEMO_PASS = 'admin123';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accounts: {},
      login: async (email, password) => {
        const key = email.trim().toLowerCase();
        let accounts = get().accounts;
        // Seed demo account on first login attempt.
        if (!accounts[DEMO_EMAIL]) {
          const passwordHash = await sha256(DEMO_PASS);
          accounts = {
            ...accounts,
            [DEMO_EMAIL]: { id: 'user-demo', name: 'Studio Admin', passwordHash },
          };
          set({ accounts });
        }
        const account = accounts[key];
        if (!account) return { ok: false, error: 'No account for that email.' };
        const hash = await sha256(password);
        if (hash !== account.passwordHash) return { ok: false, error: 'Incorrect password.' };
        set({ user: { id: account.id, email: key, name: account.name } });
        return { ok: true };
      },
      register: async (email, password, name) => {
        const key = email.trim().toLowerCase();
        if (!key || !password || password.length < 6) {
          return { ok: false, error: 'Use a valid email and a password of at least 6 characters.' };
        }
        if (get().accounts[key]) return { ok: false, error: 'That email is already registered.' };
        const passwordHash = await sha256(password);
        const id = crypto.randomUUID();
        set({
          accounts: {
            ...get().accounts,
            [key]: { id, name: name.trim() || key, passwordHash },
          },
          user: { id, email: key, name: name.trim() || key },
        });
        return { ok: true };
      },
      logout: () => set({ user: null }),
    }),
    { name: 'mahnikka-auth-v1' },
  ),
);

export const DEMO_LOGIN = { email: DEMO_EMAIL, password: DEMO_PASS };
